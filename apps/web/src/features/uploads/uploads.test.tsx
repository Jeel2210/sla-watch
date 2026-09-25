import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UploadCreated } from '@sla/core';
import * as client from '../../api/client';
import { navigate } from '../../lib/router';
import { page, uploadDetail, uploadSummary } from '../../test/fixtures';
import { renderWithQuery } from '../../test/render';
import { UploadsPage } from './UploadsPage';

vi.mock('../../api/client', async importOriginal => ({
  ...(await importOriginal<typeof client>()),
  getUploads: vi.fn(), postUpload: vi.fn(), gzipFile: vi.fn(),
}));
const getUploads = vi.mocked(client.getUploads);
const postUpload = vi.mocked(client.postUpload);
const gzipFile = vi.mocked(client.gzipFile);

const created = (over: Partial<UploadCreated> = {}): UploadCreated => {
  const { serviceNames: _s, agents: _a, regions: _r, intervalHits: _h, totalGaps: _g, ...d } = uploadDetail();
  return { ...d, duplicate: false, rejectedSample: [], ...over };
};
const csv = (name = 'checks.csv') => new File(['service_id,service_name\n'], name, { type: 'text/csv' });

async function choose(file: File) {
  const input = screen.getByLabelText('Choose a CSV file');
  await userEvent.upload(input, file, { applyAccept: false });
}

beforeEach(() => {
  vi.clearAllMocks();
  getUploads.mockResolvedValue(page([]));
  gzipFile.mockResolvedValue(new Blob(['gz']));
  navigate({ screen: 'uploads' }, { replace: true });
});

describe('upload panel', () => {
  it('idle: says what the file needs and offers examples', () => {
    renderWithQuery(<UploadsPage currentId={undefined} />);
    for (const c of ['service_id', 'timestamp', 'status_code', 'latency_unit', 'agent']) expect(screen.getByText(c)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wrong columns' })).toBeInTheDocument();
  });

  it('not a .csv → refused in the browser, nothing sent', async () => {
    renderWithQuery(<UploadsPage currentId={undefined} />);
    await choose(new File(['x'], 'report.xlsx'));
    expect(await screen.findByText('This file couldn’t be processed')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Only .csv files can be uploaded.');
    expect(postUpload).not.toHaveBeenCalled();
  });

  it('success: counts, detected facts, fixes, and Open in dashboard', async () => {
    postUpload.mockResolvedValue(created());
    renderWithQuery(<UploadsPage currentId={undefined} />);
    await choose(csv());
    expect(await screen.findByText('Upload processed')).toBeInTheDocument();
    expect(postUpload).toHaveBeenCalledWith('checks.csv', expect.any(Blob));
    expect(screen.getByText('rows uploaded').previousSibling).toHaveTextContent('15,577');
    expect(screen.getByText('checks stored').previousSibling).toHaveTextContent('14,400');
    expect(screen.getByText('Unix epoch timestamps')).toBeInTheDocument();
    expect(screen.getByText('Latency in "s"')).toBeInTheDocument();
    expect(screen.getByText('Header OK · 15,577 rows readable · 0 rejected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open in dashboard' }));
    expect(location.pathname + location.search).toBe('/?upload=u30');
  });

  it('partial: rejected rows are listed, the rest is saved', async () => {
    postUpload.mockResolvedValue(created({
      rowsRejected: 3,
      rejectedSample: [{ line: 7, raw: 'x', reason: 'Unrecognised timestamp "13/06/2025 16:00"' }, { line: 102, raw: 'y', reason: 'Expected 8 fields, got 5' }],
    }));
    renderWithQuery(<UploadsPage currentId={undefined} />);
    await choose(csv());
    expect(await screen.findByText('Processed with 3 rejected rows')).toBeInTheDocument();
    expect(screen.getByText('Unrecognised timestamp "13/06/2025 16:00"')).toBeInTheDocument();
    expect(screen.getByText('and 1 more')).toBeInTheDocument();
  });

  it('wrong columns (422): lists what is missing and what was found', async () => {
    postUpload.mockRejectedValue(new client.ApiError(422, {
      error: 'Required columns are missing.', code: 'MISSING_COLUMNS', missing: ['service_name', 'agent'], found: ['service', 'time'],
    }));
    renderWithQuery(<UploadsPage currentId={undefined} />);
    await choose(csv());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Required columns are missing.');
    expect(within(alert).getByText('agent')).toHaveClass('col', 'miss');
    expect(within(alert).getByText('time')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Choose another file' }));
    expect(screen.getByText('Drop a CSV file here')).toBeInTheDocument();
  });

  it('same file again → "Already uploaded" and the stored upload', async () => {
    postUpload.mockResolvedValue(created({ duplicate: true }));
    renderWithQuery(<UploadsPage currentId={undefined} />);
    await choose(csv());
    expect(await screen.findByText('Already uploaded')).toBeInTheDocument();
    expect(screen.getByText('Already stored: this exact file was uploaded before')).toBeInTheDocument();
  });

  it('example file goes through the same flow', async () => {
    postUpload.mockResolvedValue(created());
    renderWithQuery(<UploadsPage currentId={undefined} />);
    await userEvent.click(screen.getByRole('button', { name: 'Valid file' }));
    await screen.findByText('Upload processed');
    expect(postUpload).toHaveBeenCalledWith('example_valid.csv', expect.any(Blob));
  });
});

describe('all uploads', () => {
  it('rows with period, counts and missed SLA; the viewed one is tagged', async () => {
    getUploads.mockResolvedValue(page([uploadSummary(), uploadSummary({ id: 'u9', fileName: '9d.csv', missedSla: 0, rowsRejected: 2 })]));
    renderWithQuery(<UploadsPage currentId="u30" />);
    const table = await screen.findByRole('table');
    expect(await within(table).findByText('monitoring_checks_30d_seed404.csv')).toBeInTheDocument();
    expect(within(table).getByText('Viewing')).toBeInTheDocument();
    expect(within(table).getByText('5 of 5')).toBeInTheDocument();
    expect(within(table).getByText('0 of 5')).toBeInTheDocument();
    await userEvent.click(within(table).getByText('9d.csv'));
    expect(location.search).toBe('?upload=u9');
  });

  it('search is sent to the server after typing stops; paging uses the cursor', async () => {
    getUploads.mockImplementation(async q => (q?.cursor ? page([uploadSummary({ id: 'p2', fileName: 'page2.csv' })]) : page([uploadSummary()], 'c1')));
    renderWithQuery(<UploadsPage currentId={undefined} />);
    await screen.findByText('monitoring_checks_30d_seed404.csv');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('page2.csv')).toBeInTheDocument();
    expect(screen.getByText('Page 2')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('Page 1')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search uploads' }), '30d');
    await waitFor(() => expect(getUploads).toHaveBeenCalledWith(expect.objectContaining({ q: '30d', cursor: undefined }), expect.anything()));
    await act(async () => {});
  });
});
