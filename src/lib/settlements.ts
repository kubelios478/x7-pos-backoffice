// Lógica pura del flujo de liquidación (payout diario a merchants).
// Sin dependencias de React ni de red: fácilmente unit-testeable y reutilizable
// tanto por la vista como por el preview de "Generate settlements".

import type {
  MerchantOrder,
  MerchantSettlement,
  OrderStatus,
  SettlementStatus,
} from '../types/settlements';

// Comisión por defecto que la plataforma retiene del recaudo bruto (5%).
export const DEFAULT_PLATFORM_COMMISSION_RATE = 0.05;

export const num = (v: number | string | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
};

export const round2 = (n: number): number => Math.round(n * 100) / 100;

export const formatCurrency = (v: number | string | null | undefined): string =>
  `$${num(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatDate = (value?: string | null): string => {
  if (!value) return '—';
  const d = new Date(value);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
};

// Neto a transferir al merchant: bruto recaudado − comisión − reembolsos.
export const computeNetPayout = (
  grossCollected: number,
  platformFee: number,
  refunds: number,
): number => round2(grossCollected - platformFee - refunds);

const businessDay = (isoDate: string): string => (isoDate || '').slice(0, 10);

export interface BuiltSettlement {
  company_id: number;
  merchant_name: string;
  settlement_date: string;
  orders_count: number;
  gross_collected: number;
  refunds: number;
  platform_fee: number;
  net_payout: number;
  status: SettlementStatus;
  order_ids: number[];
}

// Agrupa las órdenes por (merchant, día de negocio) y calcula la liquidación de cada grupo.
// - gross_collected: suma de órdenes COMPLETED.
// - refunds: suma (en positivo) de órdenes REFUNDED.
// - platform_fee: gross_collected * commissionRate.
// - net_payout: gross_collected − platform_fee − refunds.
// Las órdenes VOIDED/PENDING se excluyen del dinero pero PENDING no cuenta como recaudo.
export function buildSettlementsFromOrders(
  orders: MerchantOrder[],
  commissionRate: number = DEFAULT_PLATFORM_COMMISSION_RATE,
): BuiltSettlement[] {
  const groups = new Map<string, BuiltSettlement>();

  for (const order of orders) {
    if (order.status === 'VOIDED' || order.status === 'PENDING') continue;
    const day = businessDay(order.order_date);
    const key = `${order.company_id}__${day}`;

    let group = groups.get(key);
    if (!group) {
      group = {
        company_id: order.company_id,
        merchant_name: order.merchant_name,
        settlement_date: day,
        orders_count: 0,
        gross_collected: 0,
        refunds: 0,
        platform_fee: 0,
        net_payout: 0,
        status: 'PENDING',
        order_ids: [],
      };
      groups.set(key, group);
    }

    const amount = num(order.gross_amount);
    if (order.status === 'COMPLETED') {
      group.gross_collected = round2(group.gross_collected + amount);
      group.orders_count += 1;
    } else if (order.status === 'REFUNDED') {
      group.refunds = round2(group.refunds + amount);
    }
    group.order_ids.push(order.id);
  }

  for (const group of groups.values()) {
    group.platform_fee = round2(group.gross_collected * commissionRate);
    group.net_payout = computeNetPayout(group.gross_collected, group.platform_fee, group.refunds);
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (a.settlement_date !== b.settlement_date) {
      return a.settlement_date < b.settlement_date ? 1 : -1; // Más reciente primero.
    }
    return a.merchant_name.localeCompare(b.merchant_name);
  });
}

// Una liquidación "lista para pagar" tiene neto positivo y no ha sido pagada/bloqueada.
export const isReadyToPay = (
  s: Pick<MerchantSettlement, 'status' | 'net_payout'>,
): boolean => (s.status === 'PENDING' || s.status === 'PROCESSING') && num(s.net_payout) > 0;

export const SETTLEMENT_BADGE_STYLES: Record<SettlementStatus, string> = {
  PENDING: 'bg-amber-500/10 text-amber-700',
  PROCESSING: 'bg-blue-500/10 text-blue-700',
  PAID: 'bg-green-500/10 text-green-700',
  ON_HOLD: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
  FAILED: 'bg-red-500/10 text-red-700',
};

export const ORDER_STATUS_BADGE_STYLES: Record<OrderStatus, string> = {
  COMPLETED: 'bg-green-500/10 text-green-700',
  REFUNDED: 'bg-amber-500/10 text-amber-700',
  VOIDED: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
  PENDING: 'bg-blue-500/10 text-blue-700',
};
