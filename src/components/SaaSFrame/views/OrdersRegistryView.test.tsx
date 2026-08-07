import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { OrdersRegistryView } from './OrdersRegistryView';
import type { MerchantOrder } from '../../../types/settlements';

vi.mock('../../../lib/saas-auth-storage', () => ({
  getSaasToken: vi.fn(() => 'saas-token'),
  clearSaasToken: vi.fn(),
}));

const ORDERS: MerchantOrder[] = [
  {
    id: 1,
    company_id: 10,
    merchant_name: 'Bella Napoli',
    branch_name: 'Downtown',
    order_number: 'ORD-1001',
    order_date: '2026-07-25',
    channel: 'POS',
    payment_method: 'CARD',
    gross_amount: 120,
    status: 'COMPLETED',
  },
  {
    id: 2,
    company_id: 10,
    merchant_name: 'Bella Napoli',
    branch_name: 'Airport',
    order_number: 'ORD-1002',
    order_date: '2026-07-25',
    channel: 'ONLINE',
    payment_method: 'WALLET',
    gross_amount: 80,
    status: 'REFUNDED',
  },
  {
    id: 3,
    company_id: 20,
    merchant_name: 'Sushi Zen',
    branch_name: 'Harbor',
    order_number: 'ORD-2001',
    order_date: '2026-07-24',
    channel: 'QR',
    payment_method: 'CASH',
    gross_amount: 200,
    status: 'COMPLETED',
  },
];

function jsonRes(body: unknown, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

function installFetch(orders: MerchantOrder[] = ORDERS) {
  const spy = vi.fn(async () => jsonRes({ data: orders }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('OrdersRegistryView — states', () => {
  it('shows a loading indicator', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<OrdersRegistryView />);
    expect(screen.getByText(/Loading\.\.\./i)).toBeInTheDocument();
  });

  it('shows the empty state when there are no orders', async () => {
    installFetch([]);
    render(<OrdersRegistryView />);
    expect(await screen.findByTestId('orders-registry-empty-state')).toBeInTheDocument();
  });

  it('redirects to the SaaS gate on a 401', async () => {
    const originalLocation = window.location;
    // @ts-expect-error overriding for test
    delete window.location;
    // @ts-expect-error partial mock
    window.location = { href: '' };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes({}, 401)));
    render(<OrdersRegistryView />);
    await waitFor(() => expect(window.location.href).toBe('/saas-admin'));

    // @ts-expect-error restoring
    window.location = originalLocation;
  });
});

describe('OrdersRegistryView — grid & summary', () => {
  beforeEach(() => installFetch());

  it('renders order number, merchant/restaurant and currency', async () => {
    render(<OrdersRegistryView />);
    expect(await screen.findByText('ORD-1001')).toBeInTheDocument();
    expect(screen.getByText(/Bella Napoli · Downtown/)).toBeInTheDocument();
    expect(screen.getByText('$120.00')).toBeInTheDocument();
  });

  it('sums gross collected from completed orders only', async () => {
    render(<OrdersRegistryView />);
    await screen.findByText('ORD-1001');
    // 120 + 200 completed (80 refunded excluded) = 320
    expect(screen.getByText('$320.00')).toBeInTheDocument();
  });
});

describe('OrdersRegistryView — filters', () => {
  beforeEach(() => installFetch());

  it('filters by merchant', async () => {
    const user = userEvent.setup();
    render(<OrdersRegistryView />);
    await screen.findByText('ORD-1001');

    await user.selectOptions(screen.getByLabelText('Filter by merchant'), '20');
    expect(screen.getByText('ORD-2001')).toBeInTheDocument();
    expect(screen.queryByText('ORD-1001')).not.toBeInTheDocument();
  });

  it('filters by channel', async () => {
    const user = userEvent.setup();
    render(<OrdersRegistryView />);
    await screen.findByText('ORD-1001');

    await user.selectOptions(screen.getByLabelText('Filter by channel'), 'QR');
    expect(screen.getByText('ORD-2001')).toBeInTheDocument();
    expect(screen.queryByText('ORD-1001')).not.toBeInTheDocument();
  });

  it('filters by order status', async () => {
    const user = userEvent.setup();
    render(<OrdersRegistryView />);
    await screen.findByText('ORD-1001');

    await user.selectOptions(screen.getByLabelText('Filter by order status'), 'REFUNDED');
    expect(screen.getByText('ORD-1002')).toBeInTheDocument();
    expect(screen.queryByText('ORD-1001')).not.toBeInTheDocument();
  });

  it('searches by order number, merchant or restaurant', async () => {
    const user = userEvent.setup();
    render(<OrdersRegistryView />);
    await screen.findByText('ORD-1001');

    await user.type(screen.getByLabelText('Search orders'), 'harbor');
    expect(screen.getByText('ORD-2001')).toBeInTheDocument();
    expect(screen.queryByText('ORD-1001')).not.toBeInTheDocument();
  });
});

describe('OrdersRegistryView — detail', () => {
  beforeEach(() => installFetch());

  it('opens an order detail drawer on row click', async () => {
    const user = userEvent.setup();
    render(<OrdersRegistryView />);
    await user.click(await screen.findByText('ORD-2001'));

    const dialog = await screen.findByRole('dialog', { name: /order details/i });
    expect(within(dialog).getByText('$200.00')).toBeInTheDocument();
  });

  it('navigates to settlements from the summary shortcut', async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<OrdersRegistryView onNavigate={onNavigate} />);
    await screen.findByText('ORD-1001');

    await user.click(screen.getByRole('button', { name: /open/i }));
    expect(onNavigate).toHaveBeenCalledWith('merchant-settlements');
  });
});
