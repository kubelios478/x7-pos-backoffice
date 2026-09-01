import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccountsPayableQuickLinks } from './AccountsPayableQuickLinks';

const ALL_LABELS = [
  'SUPPLIER INVOICES',
  'INVOICE LINE ITEMS',
  'CREDIT NOTES',
  'PAYMENTS & DISBURSEMENTS',
  'PAYMENT ITEMS',
  'PAYMENT ALLOCATIONS',
];

describe('AccountsPayableQuickLinks', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders all six accounts payable anchors', () => {
    render(<AccountsPayableQuickLinks active="allocations" />);

    ALL_LABELS.forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('marks the active anchor with aria-current and keeps it non-interactive', () => {
    render(<AccountsPayableQuickLinks active="allocations" />);

    const activeAnchor = screen.getByText('PAYMENT ALLOCATIONS');
    expect(activeAnchor).toHaveAttribute('aria-current', 'page');
    expect(
      screen.queryByRole('button', { name: /payment allocations/i }),
    ).not.toBeInTheDocument();
  });

  it('marks PAYMENT ITEMS active when that is the current workspace', () => {
    render(<AccountsPayableQuickLinks active="payment-items" />);

    expect(screen.getByText('PAYMENT ITEMS')).toHaveAttribute('aria-current', 'page');
    expect(
      screen.getByRole('button', { name: /payment allocations/i }),
    ).toBeInTheDocument();
  });

  it.each([
    ['SUPPLIER INVOICES', 'supplier-invoices'],
    ['INVOICE LINE ITEMS', 'supplier-invoice-items'],
    ['CREDIT NOTES', 'supplier-credit-notes'],
    ['PAYMENTS & DISBURSEMENTS', 'supplier-payments'],
    ['PAYMENT ITEMS', 'supplier-payment-items'],
  ])('routes %s to the %s feature', async (label, featureId) => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<AccountsPayableQuickLinks active="allocations" onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: label }));

    expect(onNavigate).toHaveBeenCalledWith(featureId);
  });

  it('routes PAYMENT ALLOCATIONS when it is not the active workspace', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<AccountsPayableQuickLinks active="payments" onNavigate={onNavigate} />);

    await user.click(screen.getByRole('button', { name: /payment allocations/i }));

    expect(onNavigate).toHaveBeenCalledWith('supplier-payments-allocation');
  });

  it('exposes the shortcuts as a labelled navigation landmark', () => {
    render(<AccountsPayableQuickLinks active="invoices" />);

    expect(
      screen.getByRole('navigation', { name: /accounts payable workspace shortcuts/i }),
    ).toBeInTheDocument();
  });
});
