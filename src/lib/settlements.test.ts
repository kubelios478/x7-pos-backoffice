import { describe, expect, it } from 'vitest';
import {
  buildSettlementsFromOrders,
  computeNetPayout,
  formatCurrency,
  isReadyToPay,
  round2,
  DEFAULT_PLATFORM_COMMISSION_RATE,
} from './settlements';
import type { MerchantOrder } from '../types/settlements';

const order = (partial: Partial<MerchantOrder> & { id: number }): MerchantOrder => ({
  company_id: 1,
  merchant_name: 'Bella Napoli',
  branch_name: 'Downtown',
  order_number: `ORD-${partial.id}`,
  order_date: '2026-07-25',
  channel: 'POS',
  payment_method: 'CARD',
  gross_amount: 100,
  status: 'COMPLETED',
  ...partial,
});

describe('settlements — money helpers', () => {
  it('rounds to 2 decimals', () => {
    expect(round2(10.005)).toBe(10.01);
    expect(round2(2.499)).toBe(2.5);
  });

  it('formats currency with grouping and 2 decimals', () => {
    expect(formatCurrency(1190)).toBe('$1,190.00');
    expect(formatCurrency('50')).toBe('$50.00');
    expect(formatCurrency(null)).toBe('$0.00');
  });

  it('net payout = gross - fee - refunds', () => {
    expect(computeNetPayout(1000, 50, 20)).toBe(930);
  });
});

describe('buildSettlementsFromOrders', () => {
  it('aggregates completed orders per merchant per day and applies the commission', () => {
    const orders: MerchantOrder[] = [
      order({ id: 1, gross_amount: 100 }),
      order({ id: 2, gross_amount: 200 }),
    ];
    const [s] = buildSettlementsFromOrders(orders);
    expect(s.orders_count).toBe(2);
    expect(s.gross_collected).toBe(300);
    expect(s.platform_fee).toBe(round2(300 * DEFAULT_PLATFORM_COMMISSION_RATE)); // 15
    expect(s.net_payout).toBe(285); // 300 - 15 - 0
    expect(s.status).toBe('PENDING');
  });

  it('subtracts refunds from the net payout', () => {
    const orders: MerchantOrder[] = [
      order({ id: 1, gross_amount: 500 }),
      order({ id: 2, gross_amount: 50, status: 'REFUNDED' }),
    ];
    const [s] = buildSettlementsFromOrders(orders, 0.1);
    expect(s.gross_collected).toBe(500);
    expect(s.refunds).toBe(50);
    expect(s.platform_fee).toBe(50); // 500 * 0.1
    expect(s.net_payout).toBe(400); // 500 - 50 - 50
    expect(s.orders_count).toBe(1); // sólo la completada cuenta como orden recaudada
  });

  it('excludes voided and pending orders from the money', () => {
    const orders: MerchantOrder[] = [
      order({ id: 1, gross_amount: 100 }),
      order({ id: 2, gross_amount: 999, status: 'VOIDED' }),
      order({ id: 3, gross_amount: 999, status: 'PENDING' }),
    ];
    const [s] = buildSettlementsFromOrders(orders);
    expect(s.gross_collected).toBe(100);
    expect(s.orders_count).toBe(1);
  });

  it('groups separately by merchant and by business day', () => {
    const orders: MerchantOrder[] = [
      order({ id: 1, company_id: 1, merchant_name: 'A', order_date: '2026-07-25', gross_amount: 100 }),
      order({ id: 2, company_id: 1, merchant_name: 'A', order_date: '2026-07-26', gross_amount: 100 }),
      order({ id: 3, company_id: 2, merchant_name: 'B', order_date: '2026-07-25', gross_amount: 100 }),
    ];
    const settlements = buildSettlementsFromOrders(orders);
    expect(settlements).toHaveLength(3);
  });
});

describe('isReadyToPay', () => {
  it('is true for pending settlements with a positive net', () => {
    expect(isReadyToPay({ status: 'PENDING', net_payout: 100 })).toBe(true);
    expect(isReadyToPay({ status: 'PROCESSING', net_payout: 100 })).toBe(true);
  });

  it('is false once paid, on hold, or with a zero net', () => {
    expect(isReadyToPay({ status: 'PAID', net_payout: 100 })).toBe(false);
    expect(isReadyToPay({ status: 'ON_HOLD', net_payout: 100 })).toBe(false);
    expect(isReadyToPay({ status: 'PENDING', net_payout: 0 })).toBe(false);
  });
});
