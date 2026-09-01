import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { TipsLedgerView } from './TipsLedgerView';
import * as tipsApi from '../../../../api/tips';
import type { Tip } from '../../../../types/tips';

const TEST_TIPS: Tip[] = [
  {
    id: 1001,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    order_id: 5012,
    payment_id: 8841,
    amount: 15.5,
    method: 'CARD',
    status: 'PENDING',
    record_status: 'ACTIVE',
    created_at: '2026-08-25T10:00:00.000Z',
    notes: 'Gratuity from Table 4',
  },
  {
    id: 1002,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    order_id: 5013,
    payment_id: null,
    amount: 5.0,
    method: 'CASH',
    status: 'PENDING',
    record_status: 'ACTIVE',
    created_at: '2026-08-25T11:00:00.000Z',
    notes: 'Cash tip at counter',
  },
  {
    id: 1003,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    order_id: 5014,
    payment_id: 8843,
    amount: 22.75,
    method: 'ONLINE',
    status: 'ALLOCATED',
    record_status: 'ACTIVE',
    created_at: '2026-08-25T12:00:00.000Z',
    notes: 'App tip',
  },
  {
    id: 1004,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    order_id: 5015,
    payment_id: 8844,
    amount: 12.0,
    method: 'QR_PAYMENT',
    status: 'SETTLED',
    record_status: 'ACTIVE',
    created_at: '2026-08-25T13:00:00.000Z',
    notes: 'QR code tip',
  },
  {
    id: 1005,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    order_id: 5016,
    payment_id: 8845,
    amount: 8.5,
    method: 'CARD',
    status: 'PENDING',
    record_status: 'DELETED',
    created_at: '2026-08-25T14:00:00.000Z',
    notes: 'Soft deleted tip record',
  },
];

describe('Tips Ledger Directory Workspace', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('1. Dataset Hydration & Composite Index Query Optimization', () => {
    it('executes API fetch passing company_id, merchant_id, and default non-settled status filter on load', async () => {
      const fetchSpy = vi.spyOn(tipsApi, 'fetchTips').mockResolvedValue(TEST_TIPS);

      render(<TipsLedgerView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            company_id: 'cmp-01',
            merchant_id: 'mch-01',
            status: ['PENDING', 'ALLOCATED'],
            record_status: 'ACTIVE',
            method: 'ALL',
          })
        );
      });
    });

    it('passes order_id, status, and record_status parameters to exploit secondary index when filtering', async () => {
      const fetchSpy = vi.spyOn(tipsApi, 'fetchTips').mockResolvedValue(TEST_TIPS);

      render(<TipsLedgerView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenCalled();
      });

      // Change status filter to SETTLED
      const statusSelect = screen.getByTestId('filter-status-select');
      fireEvent.change(statusSelect, { target: { value: 'SETTLED' } });

      await waitFor(() => {
        expect(fetchSpy).toHaveBeenLastCalledWith(
          expect.objectContaining({
            company_id: 'cmp-01',
            merchant_id: 'mch-01',
            status: 'SETTLED',
            record_status: 'ACTIVE',
          })
        );
      });
    });
  });

  describe('2. Search & Multi-Filter Matrix', () => {
    it('filters rows in real-time by alphanumeric search against Tip ID, Order ID, and Payment ID', async () => {
      vi.spyOn(tipsApi, 'fetchTips').mockImplementation((params) => {
        return Promise.resolve(tipsApi.filterMockTips({ ...params, status: 'ALL' }));
      });

      render(<TipsLedgerView companyId="cmp-01" merchantId="mch-01" />);

      const searchInput = screen.getByTestId('tip-search-input');

      // Search by Tip ID
      fireEvent.change(searchInput, { target: { value: '1001' } });
      await waitFor(() => {
        expect(screen.getByText('#TIP-1001')).toBeInTheDocument();
        expect(screen.queryByText('#TIP-1002')).not.toBeInTheDocument();
      });

      // Search by Order ID
      fireEvent.change(searchInput, { target: { value: '5014' } });
      await waitFor(() => {
        expect(screen.getByText('#ORD-5014')).toBeInTheDocument();
        expect(screen.queryByText('#ORD-5012')).not.toBeInTheDocument();
      });

      // Search by Payment ID
      fireEvent.change(searchInput, { target: { value: '8841' } });
      await waitFor(() => {
        expect(screen.getByText('#PAY-8841')).toBeInTheDocument();
      });
    });

    it('filters tips dynamically by TipMethod enum values (CARD, CASH, ONLINE, QR_PAYMENT)', async () => {
      vi.spyOn(tipsApi, 'fetchTips').mockImplementation((params) => {
        return Promise.resolve(tipsApi.filterMockTips({ ...params, status: 'ALL' }));
      });

      render(<TipsLedgerView companyId="cmp-01" merchantId="mch-01" />);

      const methodSelect = screen.getByTestId('filter-method-select');

      // Select CASH
      fireEvent.change(methodSelect, { target: { value: 'CASH' } });
      await waitFor(() => {
        expect(screen.getByText('#TIP-1002')).toBeInTheDocument();
        expect(screen.queryByText('#TIP-1001')).not.toBeInTheDocument();
      });

      // Select QR_PAYMENT
      fireEvent.change(methodSelect, { target: { value: 'QR_PAYMENT' } });
      await waitFor(() => {
        expect(screen.getByText('#TIP-1004')).toBeInTheDocument();
        expect(screen.queryByText('#TIP-1002')).not.toBeInTheDocument();
      });
    });

    it('toggles between ACTIVE and DELETED record statuses', async () => {
      vi.spyOn(tipsApi, 'fetchTips').mockImplementation((params) => {
        return Promise.resolve(tipsApi.filterMockTips({ ...params, status: 'ALL' }));
      });

      render(<TipsLedgerView companyId="cmp-01" merchantId="mch-01" />);

      const toggleButton = screen.getByTestId('record-status-toggle');
      expect(screen.getByText('ACTIVE RECORDS')).toBeInTheDocument();

      // Click to toggle to DELETED
      fireEvent.click(toggleButton);
      await waitFor(() => {
        expect(screen.getByText('DELETED RECORDS')).toBeInTheDocument();
        expect(screen.getByText('#TIP-1005')).toBeInTheDocument();
        expect(screen.queryByText('#TIP-1001')).not.toBeInTheDocument();
      });
    });
  });

  describe('3. Core Workspace Grid Layout Data-Binding & Formatting', () => {
    it('renders currency strictly formatted ($#,##0.00) in bold typography and displays badges correctly', async () => {
      vi.spyOn(tipsApi, 'fetchTips').mockResolvedValue([
        {
          id: 2001,
          company_id: 'cmp-01',
          merchant_id: 'mch-01',
          order_id: 6001,
          payment_id: null,
          amount: 5.5,
          method: 'CASH',
          status: 'PENDING',
          record_status: 'ACTIVE',
          created_at: '2026-08-25T10:00:00.000Z',
        },
      ]);

      render(<TipsLedgerView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByText('#TIP-2001')).toBeInTheDocument();
        expect(screen.getAllByText('$5.50').length).toBeGreaterThan(0);
        expect(screen.getByText('N/A')).toBeInTheDocument();
        expect(screen.getByText('PENDING')).toBeInTheDocument();
        expect(screen.getByText('💵 CASH')).toBeInTheDocument();
        expect(screen.getByText('ACTIVE')).toBeInTheDocument();
      });
    });

    it('triggers navigation callback upon clicking associated order chip', async () => {
      vi.spyOn(tipsApi, 'fetchTips').mockResolvedValue([
        {
          id: 3001,
          company_id: 'cmp-01',
          merchant_id: 'mch-01',
          order_id: 7001,
          payment_id: 9901,
          amount: 14.25,
          method: 'CARD',
          status: 'ALLOCATED',
          record_status: 'ACTIVE',
          created_at: '2026-08-25T10:00:00.000Z',
        },
      ]);

      const onNavigateMock = vi.fn();
      render(<TipsLedgerView companyId="cmp-01" merchantId="mch-01" onNavigate={onNavigateMock} />);

      await waitFor(() => {
        expect(screen.getByText('#ORD-7001')).toBeInTheDocument();
      });

      const orderChip = screen.getByText('#ORD-7001');
      fireEvent.click(orderChip);

      expect(onNavigateMock).toHaveBeenCalledWith('/pos/orders/#ORD-7001');
    });
  });

  describe('4. Detail & Adjustment Slide-over Drawer (Business Rules & Guards)', () => {
    it('opens detail drawer upon clicking INSPECT / EDIT TIP button', async () => {
      vi.spyOn(tipsApi, 'fetchTips').mockResolvedValue([
        {
          id: 4001,
          company_id: 'cmp-01',
          merchant_id: 'mch-01',
          order_id: 8001,
          payment_id: 8841,
          amount: 15.0,
          method: 'CARD',
          status: 'PENDING',
          record_status: 'ACTIVE',
          created_at: '2026-08-25T10:00:00.000Z',
        },
      ]);

      render(<TipsLedgerView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByTestId('inspect-tip-btn-4001')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('inspect-tip-btn-4001'));

      await waitFor(() => {
        expect(screen.getByTestId('tip-detail-drawer')).toBeInTheDocument();
        expect(screen.getAllByText(/#TIP-4001/i).length).toBeGreaterThan(0);
      });
    });

    it('enforces Settlement Guard: disables amount input and displays warning when status is SETTLED', async () => {
      vi.spyOn(tipsApi, 'fetchTips').mockResolvedValue([
        {
          id: 4002,
          company_id: 'cmp-01',
          merchant_id: 'mch-01',
          order_id: 8002,
          payment_id: 8844,
          amount: 25.0,
          method: 'QR_PAYMENT',
          status: 'SETTLED',
          record_status: 'ACTIVE',
          created_at: '2026-08-25T10:00:00.000Z',
        },
      ]);

      render(<TipsLedgerView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByTestId('inspect-tip-btn-4002')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('inspect-tip-btn-4002'));

      await waitFor(() => {
        expect(screen.getByTestId('settlement-guard-warning')).toBeInTheDocument();
        expect(screen.getByText('Settled tips cannot be edited.')).toBeInTheDocument();
        const amountInput = screen.getByTestId('tip-edit-amount-input');
        expect(amountInput).toBeDisabled();
      });
    });

    it('updates payment_id link and binds tip record to card processing transaction', async () => {
      vi.spyOn(tipsApi, 'fetchTips').mockResolvedValue([
        {
          id: 4003,
          company_id: 'cmp-01',
          merchant_id: 'mch-01',
          order_id: 8003,
          payment_id: null,
          amount: 10.0,
          method: 'CASH',
          status: 'PENDING',
          record_status: 'ACTIVE',
          created_at: '2026-08-25T10:00:00.000Z',
        },
      ]);

      const updateSpy = vi.spyOn(tipsApi, 'updateTip').mockResolvedValue({
        id: 4003,
        company_id: 'cmp-01',
        merchant_id: 'mch-01',
        order_id: 8003,
        payment_id: 8841,
        amount: 10.0,
        method: 'CARD',
        status: 'PENDING',
        record_status: 'ACTIVE',
        created_at: '2026-08-25T10:00:00.000Z',
      });

      render(<TipsLedgerView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByTestId('inspect-tip-btn-4003')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('inspect-tip-btn-4003'));

      await waitFor(() => {
        expect(screen.getByTestId('tip-edit-payment-select')).toBeInTheDocument();
      });

      // Change payment ID to 8841
      fireEvent.change(screen.getByTestId('tip-edit-payment-select'), {
        target: { value: '8841' },
      });

      // Click save button
      fireEvent.click(screen.getByTestId('tip-save-button'));

      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalledWith(
          4003,
          expect.objectContaining({
            payment_id: 8841,
          })
        );
      });
    });

    it('executes logical soft delete: sets record_status to DELETED without row destruction', async () => {
      vi.spyOn(tipsApi, 'fetchTips').mockResolvedValue([
        {
          id: 4004,
          company_id: 'cmp-01',
          merchant_id: 'mch-01',
          order_id: 8004,
          payment_id: 8842,
          amount: 12.5,
          method: 'CARD',
          status: 'PENDING',
          record_status: 'ACTIVE',
          created_at: '2026-08-25T10:00:00.000Z',
        },
      ]);

      const updateSpy = vi.spyOn(tipsApi, 'updateTip').mockResolvedValue({
        id: 4004,
        company_id: 'cmp-01',
        merchant_id: 'mch-01',
        order_id: 8004,
        payment_id: 8842,
        amount: 12.5,
        method: 'CARD',
        status: 'PENDING',
        record_status: 'DELETED',
        created_at: '2026-08-25T10:00:00.000Z',
      });

      render(<TipsLedgerView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByTestId('inspect-tip-btn-4004')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('inspect-tip-btn-4004'));

      await waitFor(() => {
        expect(screen.getByTestId('tip-soft-delete-button')).toBeInTheDocument();
      });

      // Click soft delete button
      fireEvent.click(screen.getByTestId('tip-soft-delete-button'));

      await waitFor(() => {
        expect(updateSpy).toHaveBeenCalledWith(
          4004,
          expect.objectContaining({
            record_status: 'DELETED',
          })
        );
        expect(screen.getByTestId('tip-drawer-success')).toBeInTheDocument();
      });
    });
  });

  describe('5. Contextual Shortcuts Bar (Cross-Module SPA Routing)', () => {
    it('renders persistent tips shortcuts bar displaying all 6 tip sub-module anchors', async () => {
      vi.spyOn(tipsApi, 'fetchTips').mockResolvedValue([]);

      render(<TipsLedgerView companyId="cmp-01" merchantId="mch-01" />);

      await waitFor(() => {
        expect(screen.getByText('TIPS LEDGER')).toBeInTheDocument();
        expect(screen.getByText('TIP POOLS')).toBeInTheDocument();
        expect(screen.getByText('POOL MEMBERS')).toBeInTheDocument();
        expect(screen.getByText('TIP ALLOCATIONS')).toBeInTheDocument();
        expect(screen.getByText('TIP SETTLEMENTS')).toBeInTheDocument();
        expect(screen.getByText('CASH TIP MOVEMENTS')).toBeInTheDocument();
      });
    });

    it('triggers SPA navigation callback when clicking tip sub-module shortcut anchor', async () => {
      vi.spyOn(tipsApi, 'fetchTips').mockResolvedValue([]);
      const onNavigateMock = vi.fn();

      render(<TipsLedgerView companyId="cmp-01" merchantId="mch-01" onNavigate={onNavigateMock} />);

      await waitFor(() => {
        expect(screen.getByText('TIP POOLS')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('TIP POOLS'));

      expect(onNavigateMock).toHaveBeenCalledWith('/tips/pools');
    });
  });
});
