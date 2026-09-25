import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import type { UploadCreated } from '@sla/core';
import App from '../../App';
import * as client from '../../api/client';
import { navigate } from '../../lib/router';
import { page, uploadDetail, uploadSummary } from '../../test/fixtures';
import { renderWithQuery } from '../../test/render';

vi.mock('../../api/client', async importOriginal => ({
  ...(await importOriginal<typeof client>()),
  getUploads: vi.fn(), getUpload: vi.fn(), postUpload: vi.fn(), gzipFile: vi.fn(),
}));

const old = uploadSummary({ id: 'u9', fileName: 'old.csv', rangeStart: '2025-05-08T00:00:00.000Z', rangeEnd: '2025-05-16T23:45:00.000Z', days: 9 });
const fresh = uploadSummary({ id: 'u30', fileName: 'fresh.csv' });

beforeEach(() => {
  vi.clearAllMocks();
  let stored = [old];
  vi.mocked(client.getUploads).mockImplementation(async () => page(stored));
  vi.mocked(client.getUpload).mockImplementation(async id => uploadDetail({ ...(id === 'u30' ? fresh : old) }));
  vi.mocked(client.gzipFile).mockResolvedValue(new Blob(['gz']));
  vi.mocked(client.postUpload).mockImplementation(async (): Promise<UploadCreated> => {
    stored = [fresh, old];                       // the server now has the new upload
    const { serviceNames: _s, agents: _a, regions: _r, intervalHits: _h, totalGaps: _g, ...d } = uploadDetail({ ...fresh });
    return { ...d, duplicate: false, rejectedSample: [] };
  });
  navigate({ screen: 'uploads' }, { replace: true });
});

it('a successful upload appears in Recent uploads and All uploads without a reload', async () => {
  renderWithQuery(<App />);
  const side = screen.getByRole('complementary', { name: 'Navigation' });
  await within(side).findByRole('link', { name: /8 May – 16 May 2025/ });
  expect(within(side).queryByRole('link', { name: /6 Apr – 5 May 2025/ })).not.toBeInTheDocument();

  await userEvent.upload(screen.getByLabelText('Choose a CSV file'), new File(['x'], 'fresh.csv', { type: 'text/csv' }));
  await screen.findByText('Upload processed');

  expect(await within(side).findByRole('link', { name: /6 Apr – 5 May 2025/ })).toBeInTheDocument();
  expect(await within(screen.getByRole('table')).findByText('fresh.csv')).toBeInTheDocument();
});

it('uploads made elsewhere show up when the tab is focused again', async () => {
  const { client: qc } = renderWithQuery(<App />);
  const side = screen.getByRole('complementary', { name: 'Navigation' });
  await within(side).findByRole('link', { name: /8 May – 16 May 2025/ });
  // Another tab (or person) uploads; this tab's list is now out of date.
  vi.mocked(client.getUploads).mockImplementation(async () => page([fresh, old]));
  const lists = qc.getQueryCache().findAll({ queryKey: ['uploads'] });
  for (const q of lists) q.setState({ dataUpdatedAt: Date.now() - 60_000 });
  const { focusManager } = await import('@tanstack/react-query');
  focusManager.setFocused(false);
  focusManager.setFocused(true);
  expect(await within(side).findByRole('link', { name: /6 Apr – 5 May 2025/ })).toBeInTheDocument();
});
