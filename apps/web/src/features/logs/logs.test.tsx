import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckRow, ChecksPage } from '@sla/core';
import * as client from '../../api/client';
import { uploadDetail, uploadSummary } from '../../test/fixtures';
import { renderWithQuery } from '../../test/render';
import { defaultFilters, withWindow, type LogFilters } from './logsFilter';
import { LogsPanel } from './LogsPanel';

vi.mock('../../api/client', async importOriginal => ({ ...(await importOriginal<typeof client>()), getChecks: vi.fn(), getServices: vi.fn() }));
const getChecks = vi.mocked(client.getChecks);

const upload = uploadSummary();
const detail = uploadDetail();
const row = (over: Partial<CheckRow> = {}): CheckRow => ({
  slot: '2025-04-22T04:00:00.000Z', serviceId: 'svc-auth', serviceName: 'auth-api', status: 503, isValid: true, isFailed: true,
  latencyMs: 2210, agents: ['agent-1', 'agent-2'], region: 'ap-south-1', flags: ['merged', 'offset_ts'], ...over,
});
const counts = { all: 14400, failed: 182, changed: 4149 };

function Harness({ initial }: { initial?: LogFilters }) {
  const [f, setF] = useState<LogFilters>(initial ?? defaultFilters(upload));
  return <LogsPanel upload={upload} detail={detail} filters={f} onFilters={setF} />;
}
/** The page on screen: the latest first-page request (later calls may be the automatic prefetch of page 2). */
const lastQuery = () => getChecks.mock.calls.filter(c => c[1].cursor === undefined).at(-1)![1];

beforeEach(() => {
  vi.clearAllMocks();
  getChecks.mockImplementation(async (_id, q): Promise<ChecksPage> => (q.cursor
    ? { items: [row({ slot: '2025-04-22T06:00:00.000Z', status: 200, isFailed: false, flags: [] })], nextCursor: null, counts: null }
    : { items: [row(), row({ slot: '2025-04-22T04:15:00.000Z', serviceId: 'svc-pay', serviceName: 'payments-api', status: 999, isValid: false, isFailed: false, flags: ['invalid_status'] })], nextCursor: 'c2', counts }));
  vi.mocked(client.getServices).mockResolvedValue({ items: [], nextCursor: null, total: 0 });
});

describe('Logs panel', () => {
  it('rows, tab counts and "Page 1 of N"; failed rows are marked, invalid codes are named', async () => {
    renderWithQuery(<Harness />);
    const table = await screen.findByRole('table');
    expect(await within(table).findByText('2025-04-22 04:00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /All.*14,400/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Failed.*182/ })).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 1,440 · 14,400 checks')).toBeInTheDocument();
    expect(within(table).getByText('503').closest('tr')).toHaveClass('fail');
    expect(within(table).getByText('(invalid code)')).toBeInTheDocument();
    expect(lastQuery()).toMatchObject({ tab: 'all', sort: 'fail', from: '2025-04-06T00:00:00.000Z', to: '2025-05-06T00:00:00.000Z', limit: 10 });
  });

  it('Next follows the cursor, keeps the counts; Previous goes back', async () => {
    renderWithQuery(<Harness />);
    await screen.findByText('Page 1 of 1,440 · 14,400 checks');
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('2025-04-22 06:00')).toBeInTheDocument();
    expect(screen.getByText('Page 2 of 1,440 · 14,400 checks')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
    expect(await screen.findByText('Page 1 of 1,440 · 14,400 checks')).toBeInTheDocument();
  });

  it('switching tab restarts at page 1 with the new tab', async () => {
    renderWithQuery(<Harness />);
    await screen.findByText('Page 1 of 1,440 · 14,400 checks');
    await userEvent.click(screen.getByRole('button', { name: /Failed/ }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ tab: 'failed' }));
    expect(await screen.findByText('Page 1 of 19 · 182 checks')).toBeInTheDocument();
  });

  it('single date and range filters (brief), with a chip that removes them', async () => {
    renderWithQuery(<Harness />);
    await userEvent.click(await screen.findByRole('button', { name: /Filters/ }));
    const menu = screen.getByRole('dialog', { name: 'Log filters' });
    await userEvent.click(within(menu).getByRole('button', { name: 'Single date' }));
    // A date picker sets the whole value at once (jsdom cannot type into date inputs key by key).
    fireEvent.change(within(menu).getByLabelText('Date'), { target: { value: '2025-04-22' } });
    await waitFor(() => expect(lastQuery()).toMatchObject({ from: '2025-04-22T00:00:00.000Z', to: '2025-04-23T00:00:00.000Z' }));

    await userEvent.click(within(menu).getByRole('button', { name: 'Range' }));
    fireEvent.change(within(menu).getByLabelText('To date'), { target: { value: '2025-04-25' } });
    await waitFor(() => expect(lastQuery()).toMatchObject({ from: '2025-04-22T00:00:00.000Z', to: '2025-04-26T00:00:00.000Z' }));

    await userEvent.click(within(menu).getByRole('button', { name: 'Done' }));
    expect(screen.getByText('22 Apr – 25 Apr')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Filters/ })).toHaveTextContent('1');
    await userEvent.click(screen.getByRole('button', { name: 'Remove 22 Apr – 25 Apr' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ from: '2025-04-06T00:00:00.000Z', to: '2025-05-06T00:00:00.000Z' }));
  });

  it('quick dates are relative to the upload’s last day; Escape closes and returns focus', async () => {
    renderWithQuery(<Harness />);
    const btn = await screen.findByRole('button', { name: /Filters/ });
    await userEvent.click(btn);
    await userEvent.click(screen.getByRole('button', { name: 'Last day' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ from: '2025-05-05T00:00:00.000Z', to: '2025-05-06T00:00:00.000Z' }));
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Log filters' })).not.toBeInTheDocument();
    expect(btn).toHaveFocus();
    expect(screen.getByText('Last day · 5 May')).toBeInTheDocument();
  });

  it('agent filter offers "Reported by 2+ agents"', async () => {
    renderWithQuery(<Harness />);
    await userEvent.click(await screen.findByRole('button', { name: /Filters/ }));
    await userEvent.selectOptions(screen.getByLabelText('Agent'), 'Reported by 2+ agents');
    await waitFor(() => expect(lastQuery()).toMatchObject({ agent: '*' }));
  });

  it('a chart window: its chip, oldest first, and removing it goes back to everything', async () => {
    const w = { service: 'svc-auth', serviceName: 'auth-api', from: '2025-04-22T04:00:00.000Z', to: '2025-04-22T05:00:00.000Z', label: 'auth-api · 22 Apr, 04:00–05:00' };
    renderWithQuery(<Harness initial={withWindow(defaultFilters(upload), w)} />);
    expect(await screen.findByText('auth-api · 22 Apr, 04:00–05:00')).toBeInTheDocument();
    expect(lastQuery()).toMatchObject({ service: 'svc-auth', from: w.from, to: w.to, sort: 'old' });
    await userEvent.click(screen.getByRole('button', { name: 'Remove auth-api · 22 Apr, 04:00–05:00' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ service: undefined, from: '2025-04-06T00:00:00.000Z' }));
  });

  it('what cleaning changed, in words', async () => {
    renderWithQuery(<Harness />);
    const table = await screen.findByRole('table');
    await within(table).findByText('2025-04-22 04:00');
    await userEvent.click(within(table).getAllByRole('button', { name: 'What cleaning changed' })[0]!);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Reported by agent-1 and agent-2. Merged into one check.');
    expect(tip).toHaveTextContent('Timestamp had a time-zone offset (+05:30). Converted to UTC.');
  });

  it('no matches → says what to do', async () => {
    getChecks.mockResolvedValue({ items: [], nextCursor: null, counts: { all: 0, failed: 0, changed: 0 } });
    renderWithQuery(<Harness />);
    expect(await screen.findByText('No checks match. Widen the dates or switch to All.')).toBeInTheDocument();
  });
});
