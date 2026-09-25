import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HexDay, ServiceRow } from '@sla/core';
import * as client from '../../api/client';
import { uploadDetail } from '../../test/fixtures';
import { renderWithQuery } from '../../test/render';
import { FullView } from '../hexmap/FullView';
import { DataReport } from './DataReport';

vi.mock('../../api/client', async importOriginal => ({
  ...(await importOriginal<typeof client>()), getUpload: vi.fn(), getHex: vi.fn(), getServices: vi.fn(),
}));

const svc: ServiceRow = {
  id: 'svc-auth', name: 'auth-api', availability: 99.37, met: false, valid: 2879, failed: 18, present: 2880, expected: 2880,
  downtimeMin: 270, allowedDowntimeMin: 43.2, timesAllowance: 6.25, incidents: 1, longestIncidentMin: 375, p50Ms: 120, p95Ms: 190, coverage: 100,
};
const day = (d: string): HexDay => ({ day: d, hours: Array.from({ length: 24 }, () => ({ checks: 4, failed: 0, incident: false })) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.getUpload).mockResolvedValue(uploadDetail({ rowsRejected: 2, rejectedSample: [{ line: 7, raw: 'x', reason: 'Unrecognised timestamp "yesterday"' }] }));
  vi.mocked(client.getServices).mockResolvedValue({ items: [svc], nextCursor: null, total: 1 });
});

describe('Data report', () => {
  it('where every row went, what was detected, each fix and each rejected row', async () => {
    renderWithQuery(<DataReport uploadId="u30" open onClose={() => {}} />);
    const dlg = await screen.findByRole('dialog', { name: 'Data report for this upload', hidden: true });
    expect(await within(dlg).findByText('Where the 15,577 uploaded rows went')).toBeInTheDocument();
    expect(within(dlg).getByText('Stored as uploaded').parentElement).toHaveTextContent('11,120');   // 14,400 − 3,280 fixed
    expect(within(dlg).getByText('Merged as duplicates').parentElement).toHaveTextContent('1,177');
    expect(within(dlg).getByText(/15 min · 14,395 of 14,395 gaps/)).toBeInTheDocument();
    expect(within(dlg).getByText('Timestamps with an offset (+05:30)')).toBeInTheDocument();
    expect(within(dlg).getByText('Unrecognised timestamp "yesterday"')).toBeInTheDocument();
    expect(within(dlg).getByText('and 1 more')).toBeInTheDocument();
  });
  it('asks for the report only when opened', () => {
    renderWithQuery(<DataReport uploadId="u30" open={false} onClose={() => {}} />);
    expect(client.getUpload).not.toHaveBeenCalled();
  });
});

describe('Full view', () => {
  it('loads every day in chunks of at most 31 and fits them on one screen', async () => {
    const all = Array.from({ length: 40 }, (_, i) => day(new Date(Date.UTC(2025, 0, 1 + i)).toISOString().slice(0, 10)));
    vi.mocked(client.getHex).mockImplementation(async (_u, _s, q) => ({ serviceId: 'svc-auth', totalDays: 40, from: q.from, days: all.slice(q.from, q.from + q.days) }));
    renderWithQuery(<FullView uploadId="u30" intervalMin={15} initial={svc} onClose={() => {}} onOpenLogs={() => {}} />);
    await screen.findByRole('button', { name: /auth-api/, hidden: true });
    expect(vi.mocked(client.getHex).mock.calls.map(c => c[2])).toEqual([{ from: 0, days: 31 }, { from: 31, days: 31 }]);
  });
  it('clicking an hour closes the dialog and opens those checks', async () => {
    vi.mocked(client.getHex).mockResolvedValue({ serviceId: 'svc-auth', totalDays: 1, from: 0, days: [day('2025-04-22')] });
    const onOpenLogs = vi.fn();
    const onClose = vi.fn();
    renderWithQuery(<FullView uploadId="u30" intervalMin={15} initial={svc} onClose={onClose} onOpenLogs={onOpenLogs} />);
    const chart = await screen.findByRole('img', { name: /auth-api: failed checks per hour/, hidden: true });
    await userEvent.click(chart.querySelector('.hx')!);
    expect(onClose).toHaveBeenCalled();
    expect(onOpenLogs).toHaveBeenCalledWith(expect.objectContaining({ service: 'svc-auth', from: '2025-04-22T00:00:00.000Z' }));
  });
});
