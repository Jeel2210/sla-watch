import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HexPage, ServiceRow, ServicesPage, TimelinePage, UploadStats } from '@sla/core';
import * as client from '../../api/client';
import { page, uploadSummary } from '../../test/fixtures';
import { renderWithQuery } from '../../test/render';
import { StatsPanel } from './StatsPanel';

vi.mock('../../api/client', async importOriginal => ({
  ...(await importOriginal<typeof client>()),
  getStats: vi.fn(), getServices: vi.fn(), getHex: vi.fn(), getTimeline: vi.fn(), getIncidents: vi.fn(),
}));

const upload = uploadSummary();
const stats: UploadStats = {
  slaTarget: 99.9, allowedDowntimeMin: 43.199999999997, servicesTotal: 5, missed: 5, incidents: 2,
  longestIncident: { serviceId: 'svc-auth', serviceName: 'auth-api', minutes: 375 },
  lowest: { serviceId: 'svc-reports', serviceName: 'reports-api', availability: 97.1527 },
};
const reports: ServiceRow = {
  id: 'svc-reports', name: 'reports-api', availability: 97.1527, met: false, valid: 2880, failed: 82, present: 2880, expected: 2880,
  downtimeMin: 1230, allowedDowntimeMin: 43.2, timesAllowance: 28.47, incidents: 1, longestIncidentMin: 135, p50Ms: 654, p95Ms: 845, coverage: 100,
};
const hex: HexPage = {
  serviceId: 'svc-reports', totalDays: 30, from: 0,
  days: [{ day: '2025-04-09', hours: Array.from({ length: 24 }, (_, h) => ({ checks: 4, failed: h === 12 ? 4 : 0, incident: h === 12 })) }],
};
const timeline: TimelinePage = {
  bins: 240, binMin: 180, rangeStart: '2025-04-06T00:00:00.000Z', offset: 0, total: 1,
  items: [{ serviceId: 'svc-reports', name: 'reports-api', availability: 97.1527, met: false, downtimeMin: 1230, timesAllowance: 28.47, p95Ms: 845, failed: new Array(240).fill(0), incidents: [[27, 28]] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.mocked(client.getStats).mockResolvedValue(stats);
  vi.mocked(client.getServices).mockResolvedValue({ ...page([reports]), total: 1 } as ServicesPage);
  vi.mocked(client.getHex).mockResolvedValue(hex);
  vi.mocked(client.getTimeline).mockResolvedValue(timeline);
  vi.mocked(client.getIncidents).mockResolvedValue(page([{
    serviceId: 'svc-reports', serviceName: 'reports-api', start: '2025-04-09T11:45:00.000Z', end: '2025-04-09T14:00:00.000Z',
    durationMin: 135, failed: 7, medianLatencyMs: 2193, normalLatencyMs: 638,
  }]));
});

function renderPanel(onOpenLogs = vi.fn()) {
  const onSelect = vi.fn();
  const utils = renderWithQuery(<StatsPanel upload={upload} selected={reports} onSelect={onSelect} onOpenLogs={onOpenLogs} />);
  return { ...utils, onOpenLogs, onSelect };
}

describe('Stats panel', () => {
  it('stat strip: the five numbers, with explanations from this upload', async () => {
    renderPanel();
    expect(await screen.findByText('5 of 5')).toBeInTheDocument();
    expect(screen.getByText('43.2 min')).toBeInTheDocument();
    expect(screen.getByText('longest 6 h 15 min · auth-api')).toBeInTheDocument();
    expect(screen.getByText('97.15%', { selector: '.kc .v' })).toBeInTheDocument();
    expect(screen.getByText('from 15,577 rows · 0 rejected')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Allowed downtime: how this is calculated' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('2,880 checks × 15 min × 0.1%');
  });

  it('collapses and expands; collapsed content is out of the tab order', async () => {
    renderPanel();
    const toggle = screen.getByRole('button', { name: 'Stats' });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)!.inert).toBe(true);
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('hex map: header KPIs and a click on an hour opens those checks', async () => {
    const { onOpenLogs } = renderPanel();
    expect(await screen.findByText('20 h 30 min')).toBeInTheDocument();
    expect(screen.getByText('28×')).toBeInTheDocument();
    expect(screen.getByText('654 / 845')).toBeInTheDocument();
    const chart = await screen.findByRole('img', { name: /reports-api: failed checks per hour/ });
    await userEvent.click(chart.querySelector('.hx.h3')!);
    expect(onOpenLogs).toHaveBeenCalledWith(expect.objectContaining({
      service: 'svc-reports', from: '2025-04-09T12:00:00.000Z', to: '2025-04-09T13:00:00.000Z', label: 'reports-api · 9 Apr, 12:00–13:00',
    }));
  });

  it('hex map is keyboard operable: arrows move, Enter opens', async () => {
    const { onOpenLogs } = renderPanel();
    const chart = await screen.findByRole('img', { name: /reports-api: failed checks per hour/ });
    chart.focus();
    await userEvent.keyboard('{End}{Enter}');
    expect(onOpenLogs).toHaveBeenCalledWith(expect.objectContaining({ from: '2025-04-09T23:00:00.000Z' }));
  });

  it('timeline and incidents views; the choice is remembered', async () => {
    const { onOpenLogs } = renderPanel();
    const views = screen.getByRole('group', { name: 'Chart view' });
    await userEvent.click(within(views).getByRole('button', { name: /Timeline/ }));
    expect(await screen.findByText('28× allowance')).toBeInTheDocument();
    expect(localStorage.getItem('sla-view')).toBe('timeline');
    await userEvent.click(within(views).getByRole('button', { name: /Incidents/ }));
    const row = await screen.findByRole('row', { name: /reports-api/ });
    expect(within(row).getByText('3.4× normal')).toBeInTheDocument();
    await userEvent.click(row);
    expect(onOpenLogs).toHaveBeenCalledWith(expect.objectContaining({ from: '2025-04-09T11:45:00.000Z', to: '2025-04-09T14:00:00.000Z' }));
  });
});
