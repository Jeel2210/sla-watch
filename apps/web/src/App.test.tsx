import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import * as client from './api/client';
import { navigate } from './lib/router';
import { page, uploadDetail, uploadSummary } from './test/fixtures';
import { renderWithQuery } from './test/render';

// The shell is under test here; dashboard reads stay pending (no network), each screen has its own tests.
const pending = vi.hoisted(() => () => new Promise<never>(() => {}));
vi.mock('./api/client', async importOriginal => ({
  ...(await importOriginal<typeof client>()),
  getUploads: vi.fn(), getUpload: vi.fn(),
  getStats: vi.fn(pending), getServices: vi.fn(pending), getHex: vi.fn(pending), getChecks: vi.fn(pending),
  getTimeline: vi.fn(pending), getIncidents: vi.fn(pending),
}));
const getUploads = vi.mocked(client.getUploads);
const getUpload = vi.mocked(client.getUpload);

const u30 = uploadSummary();
const u9 = uploadSummary({
  id: 'u9', fileName: 'monitoring_checks_9d_seed101.csv', rangeStart: '2025-05-08T00:00:00.000Z', rangeEnd: '2025-05-16T23:45:00.000Z',
  days: 9, rowsStored: 4320, rowsRejected: 3,
});

beforeEach(() => {
  getUploads.mockReset();
  getUpload.mockReset().mockImplementation(async id => uploadDetail({ id }));
  navigate({ screen: 'dashboard' }, { replace: true });
});

describe('App shell', () => {
  it('no uploads → empty state that leads to Uploads', async () => {
    getUploads.mockResolvedValue(page([]));
    renderWithQuery(<App />);
    expect(await screen.findByText('No monitoring data yet')).toBeInTheDocument();
    expect(screen.getByText('Nothing uploaded yet.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Go to Uploads' }));
    expect(location.pathname).toBe('/uploads');
  });

  it('shows the newest upload by default: period, file, detected facts', async () => {
    getUploads.mockResolvedValue(page([u30, u9]));
    renderWithQuery(<App />);
    expect(await screen.findByRole('heading', { level: 1, name: '6 Apr – 5 May 2025' })).toBeInTheDocument();
    const banner = screen.getByRole('banner');
    expect(within(banner).getByText('monitoring_checks_30d_seed404.csv')).toBeInTheDocument();
    expect(within(banner).getByText('30 days')).toBeInTheDocument();
    expect(within(banner).getByText('5 services')).toBeInTheDocument();
    expect(within(banner).getByText('a check every 15 min')).toBeInTheDocument();
  });

  it('sidebar lists recent uploads; clicking one opens it and marks it current', async () => {
    getUploads.mockResolvedValue(page([u30, u9]));
    renderWithQuery(<App />);
    const side = screen.getByRole('complementary', { name: 'Navigation' });
    const nine = await within(side).findByRole('link', { name: /8 May – 16 May 2025/ });
    expect(nine).toHaveTextContent('9 days · 4,320 checks · 3 rejected');
    await userEvent.click(nine);
    expect(location.search).toBe('?upload=u9');
    expect(await screen.findByRole('heading', { level: 1, name: '8 May – 16 May 2025' })).toBeInTheDocument();
    expect(nine).toHaveAttribute('aria-current', 'true');
  });

  it('an older upload opened by link is pinned under "Viewing"', async () => {
    getUploads.mockResolvedValue(page([u30]));
    getUpload.mockResolvedValue(uploadDetail({ ...u9 }));
    navigate({ screen: 'dashboard', upload: 'u9' }, { replace: true });
    renderWithQuery(<App />);
    expect(await screen.findByText('Viewing')).toBeInTheDocument();
    expect(getUpload).toHaveBeenCalledWith('u9', expect.anything());
  });

  it('an upload that does not exist → clear error and a way back', async () => {
    getUploads.mockResolvedValue(page([u30]));
    getUpload.mockRejectedValue(new client.ApiError(404, { error: 'Upload not found' }));
    navigate({ screen: 'dashboard', upload: '00000000-0000-4000-8000-000000000000' }, { replace: true });
    renderWithQuery(<App />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Upload not found');
    await userEvent.click(screen.getByRole('button', { name: 'Open the latest upload' }));
    expect(location.search).toBe('');
  });
});
