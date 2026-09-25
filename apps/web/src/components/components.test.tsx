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

describe('InfoPopover (help icon)', () => {
  const Help = ({ n = '' }: { n?: string }) => (
    <InfoPopover label={`How availability${n} is calculated`} title={`Availability${n}`}>
      <span className="calc">(valid − failed) ÷ valid</span>
    </InfoPopover>
  );

  it('click keeps it open; a second click closes it', async () => {
    render(<Help />);
    const btn = screen.getByRole('button', { name: 'How availability is calculated' });
    await userEvent.click(btn);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Availability');
    expect(tip).toHaveTextContent('(valid − failed) ÷ valid');
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    await userEvent.click(btn);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('hover peeks and hides again when the pointer leaves', async () => {
    render(<Help />);
    const btn = screen.getByRole('button', { name: 'How availability is calculated' });
    await userEvent.hover(btn);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await userEvent.unhover(btn);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('the × closes it and returns focus to the icon', async () => {
    render(<Help />);
    const btn = screen.getByRole('button', { name: 'How availability is calculated' });
    await userEvent.click(btn);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(btn).toHaveFocus();
  });

  it('Escape closes it and returns focus', async () => {
    render(<Help />);
    const btn = screen.getByRole('button', { name: 'How availability is calculated' });
    await userEvent.click(btn);
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(btn).toHaveFocus();
  });

  it('a click elsewhere closes it', async () => {
    render(<><Help /><p>outside</p></>);
    await userEvent.click(screen.getByRole('button', { name: 'How availability is calculated' }));
    await userEvent.click(screen.getByText('outside'));
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('only one is open at a time: opening another closes the first', async () => {
    render(<><Help n=" A" /><Help n=" B" /></>);
    await userEvent.click(screen.getByRole('button', { name: 'How availability A is calculated' }));
    await userEvent.click(screen.getByRole('button', { name: 'How availability B is calculated' }));
    const tips = screen.getAllByRole('tooltip');
    expect(tips).toHaveLength(1);
    expect(tips[0]).toHaveTextContent('Availability B');
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
