import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { MerchantSettlementsView } from './MerchantSettlementsView';
import type { MerchantSettlement } from '../../../types/settlements';

vi.mock('../../../lib/saas-auth-storage', () => ({
  getSaasToken: vi.fn(() => 'saas-token'),
  clearSaasToken: vi.fn(),
}));

const SETTLEMENTS: MerchantSettlement[] = [
  {
    id: 1,
    company_id: 10,
    merchant_name: 'Bella Napoli',
    settlement_date: '2026-07-25',
    orders_count: 12,
    gross_collected: 1000,
    refunds: 20,
    platform_fee: 50,
    net_payout: 930,
    status: 'PENDING',
  },
  {
    id: 2,
    company_id: 20,
    merchant_name: 'Sushi Zen',
    settlement_date: '2026-07-25',
    orders_count: 8,
    gross_collected: 600,
    refunds: 0,
    platform_fee: 30,
    net_payout: 570,
    status: 'PAID',
    payout_reference: 'PO-0002',
    paid_at: '2026-07-26T09:00:00.000Z',
  },
  {
    id: 3,
    company_id: 30,
    merchant_name: 'Taco Loco',
    settlement_date: '2026-07-25',
    orders_count: 4,
    gross_collected: 300,
    refunds: 0,
    platform_fee: 15,
    net_payout: 285,
    status: 'ON_HOLD',
  },
];

function jsonRes(body: unknown, status = 200) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

interface InstallOpts {
  settlements?: MerchantSettlement[];
  generated?: MerchantSettlement[];
}

function installFetch({ settlements = SETTLEMENTS, generated }: InstallOpts = {}) {
  const spy = vi.fn(async (url: string, options?: RequestInit) => {
    const u = String(url);
    const method = options?.method ?? 'GET';

    if (u.includes('/merchant-settlements/generate') && method === 'POST') {
      return jsonRes({ data: generated ?? settlements });
    }
    const payoutMatch = u.match(/merchant-settlements\/(\d+)\/payout/);
    if (payoutMatch && method === 'POST') {
      const id = Number(payoutMatch[1]);
      const base = settlements.find((s) => s.id === id)!;
      return jsonRes({
        data: {
          ...base,
          status: 'PAID',
          payout_reference: `PO-${String(id).padStart(4, '0')}`,
          paid_at: '2026-07-26T10:00:00.000Z',
        },
      });
    }
    const detailMatch = u.match(/merchant-settlements\/(\d+)$/);
    if (detailMatch && method === 'GET') {
      const s = settlements.find((x) => String(x.id) === detailMatch[1]);
      return jsonRes({ data: s ?? null });
    }
    return jsonRes({ data: settlements });
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('MerchantSettlementsView — states', () => {
  it('shows a loading indicator', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    render(<MerchantSettlementsView />);
    expect(screen.getByText(/Loading\.\.\./i)).toBeInTheDocument();
  });

  it('shows the empty state with a generate CTA', async () => {
    installFetch({ settlements: [] });
    render(<MerchantSettlementsView />);
    const empty = await screen.findByTestId('merchant-settlements-empty-state');
    expect(within(empty).getByRole('button', { name: /generate settlements/i })).toBeInTheDocument();
  });

  it('redirects to the SaaS gate on a 401', async () => {
    const originalLocation = window.location;
    // @ts-expect-error overriding for test
    delete window.location;
    // @ts-expect-error partial mock
    window.location = { href: '' };

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonRes({}, 401)));
    render(<MerchantSettlementsView />);
    await waitFor(() => expect(window.location.href).toBe('/saas-admin'));

    // @ts-expect-error restoring
    window.location = originalLocation;
  });
});

describe('MerchantSettlementsView — grid & summary', () => {
  beforeEach(() => installFetch());

  it('renders merchant, net payout and status', async () => {
    render(<MerchantSettlementsView />);
    const row = (await screen.findByText('Bella Napoli')).closest('tr')!;
    expect(within(row).getByText('$930.00')).toBeInTheDocument();
    expect(within(row).getByText('Pending')).toBeInTheDocument();
  });

  it('summarizes the ready count and pending payout total (paid/on-hold excluded)', async () => {
    render(<MerchantSettlementsView />);
    await screen.findByText('Bella Napoli');
    // Only settlement #1 (PENDING, net 930) is ready.
    const readyTile = screen.getByText('Ready to pay').closest('div')!;
    expect(within(readyTile).getByText('1')).toBeInTheDocument();
    const pendingTile = screen.getByText('Pending payout total').closest('div')!;
    expect(within(pendingTile).getByText('$930.00')).toBeInTheDocument();
  });
});

describe('MerchantSettlementsView — filters', () => {
  beforeEach(() => installFetch());

  it('filters by status', async () => {
    const user = userEvent.setup();
    render(<MerchantSettlementsView />);
    await screen.findByText('Bella Napoli');

    await user.selectOptions(screen.getByLabelText('Filter by settlement status'), 'PAID');
    expect(screen.getByText('Sushi Zen')).toBeInTheDocument();
    expect(screen.queryByText('Bella Napoli')).not.toBeInTheDocument();
  });

  it('filters to ready-to-pay only', async () => {
    const user = userEvent.setup();
    render(<MerchantSettlementsView />);
    await screen.findByText('Bella Napoli');

    await user.click(screen.getByRole('button', { name: /ready to pay only/i }));
    expect(screen.getByText('Bella Napoli')).toBeInTheDocument();
    expect(screen.queryByText('Sushi Zen')).not.toBeInTheDocument(); // PAID
    expect(screen.queryByText('Taco Loco')).not.toBeInTheDocument(); // ON_HOLD
  });
});

describe('MerchantSettlementsView — generate', () => {
  it('generates settlements and updates the list', async () => {
    const newList: MerchantSettlement[] = [
      ...SETTLEMENTS,
      {
        id: 4,
        company_id: 40,
        merchant_name: 'Green Bowl',
        settlement_date: '2026-07-25',
        orders_count: 6,
        gross_collected: 450,
        refunds: 0,
        platform_fee: 22.5,
        net_payout: 427.5,
        status: 'PENDING',
      },
    ];
    const spy = installFetch({ generated: newList });
    const user = userEvent.setup();
    render(<MerchantSettlementsView />);
    await screen.findByText('Bella Napoli');

    await user.click(screen.getByRole('button', { name: /generate settlements/i }));

    expect(await screen.findByText('Green Bowl')).toBeInTheDocument();
    expect(screen.getByText('Daily settlements generated successfully')).toBeInTheDocument();
    const genCall = spy.mock.calls.find(
      ([url, opts]) =>
        (opts as RequestInit)?.method === 'POST' && String(url).includes('merchant-settlements/generate'),
    );
    expect(genCall).toBeTruthy();
  });
});

describe('MerchantSettlementsView — execute payout (cash flow)', () => {
  it('runs the payout confirm dialog and marks the settlement as paid', async () => {
    const spy = installFetch();
    const user = userEvent.setup();
    render(<MerchantSettlementsView />);
    const row = (await screen.findByText('Bella Napoli')).closest('tr')!;

    await user.click(within(row).getByRole('button', { name: /execute payout/i }));

    const dialog = await screen.findByRole('dialog', { name: /execute payout/i });
    expect(within(dialog).getByTestId('payout-net-amount')).toHaveTextContent('$930.00');

    await user.click(within(dialog).getByRole('button', { name: /confirm payout/i }));

    expect(await screen.findByText('Payout executed successfully')).toBeInTheDocument();
    const paidRow = (await screen.findByText('Bella Napoli')).closest('tr')!;
    expect(within(paidRow).getByText('PO-0001')).toBeInTheDocument();
    // Once paid, the settlement is no longer payable.
    expect(within(paidRow).getByRole('button', { name: /execute payout/i })).toBeDisabled();

    const payoutCall = spy.mock.calls.find(
      ([url, opts]) =>
        (opts as RequestInit)?.method === 'POST' && String(url).includes('merchant-settlements/1/payout'),
    );
    expect(payoutCall).toBeTruthy();
  });

  it('disables the payout button for an already paid settlement', async () => {
    installFetch();
    render(<MerchantSettlementsView />);
    const row = (await screen.findByText('Sushi Zen')).closest('tr')!;
    expect(within(row).getByRole('button', { name: /execute payout/i })).toBeDisabled();
  });

  it('disables the payout button for an on-hold settlement', async () => {
    installFetch();
    render(<MerchantSettlementsView />);
    const row = (await screen.findByText('Taco Loco')).closest('tr')!;
    expect(within(row).getByRole('button', { name: /execute payout/i })).toBeDisabled();
  });
});

describe('MerchantSettlementsView — detail drawer', () => {
  it('opens the settlement detail with its order breakdown', async () => {
    installFetch({
      settlements: [
        {
          ...SETTLEMENTS[0],
          orders: [
            {
              id: 501,
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
          ],
        },
        ...SETTLEMENTS.slice(1),
      ],
    });
    const user = userEvent.setup();
    render(<MerchantSettlementsView />);
    await user.click(await screen.findByText('Bella Napoli'));

    const dialog = await screen.findByRole('dialog', { name: /settlement details/i });
    expect(within(dialog).getByText('ORD-1001')).toBeInTheDocument();
  });
});
