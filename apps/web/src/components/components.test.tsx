import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';
import { InfoPopover } from './InfoPopover';
import { Pill, Segmented } from './ui';

describe('Pill', () => {
  it('says the status in words, not colour alone', () => {
    const { rerender } = render(<Pill met />);
    expect(screen.getByText('Met')).toBeInTheDocument();
    rerender(<Pill met={false} credit />);
    expect(screen.getByText('Missed · credit')).toBeInTheDocument();
    rerender(<Pill met={null} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });
});

describe('Segmented', () => {
  it('marks the chosen option and reports clicks', async () => {
    const onChange = vi.fn();
    render(<Segmented label="Show" value="all" onChange={onChange}
      options={[{ value: 'all', label: 'All', count: '14,400' }, { value: 'failed', label: 'Failed', count: 182 }]} />);
    expect(screen.getByRole('button', { name: /All/ })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /Failed/ }));
    expect(onChange).toHaveBeenCalledWith('failed');
  });
});

describe('InfoPopover', () => {
  it('opens on click, closes on Escape and returns focus', async () => {
    render(<InfoPopover label="How availability is calculated"><b>Availability</b> (valid − failed) ÷ valid</InfoPopover>);
    const btn = screen.getByRole('button', { name: 'How availability is calculated' });
    await userEvent.click(btn);
    expect(screen.getByRole('tooltip')).toHaveTextContent('(valid − failed) ÷ valid');
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(btn).toHaveFocus();
  });
  it('closes on a click elsewhere', async () => {
    render(<><InfoPopover label="info">text</InfoPopover><p>outside</p></>);
    await userEvent.click(screen.getByRole('button', { name: 'info' }));
    await userEvent.click(screen.getByText('outside'));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('Dialog', () => {
  it('shows content only while open; Close calls onClose', async () => {
    const onClose = vi.fn();
    const { rerender } = render(<Dialog open={false} onClose={onClose} title="Data report"><p>body</p></Dialog>);
    expect(screen.queryByText('body')).not.toBeInTheDocument();
    rerender(<Dialog open onClose={onClose} title="Data report"><p>body</p></Dialog>);
    expect(screen.getByText('body')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Close', hidden: true }));
    expect(onClose).toHaveBeenCalled();
  });
});
