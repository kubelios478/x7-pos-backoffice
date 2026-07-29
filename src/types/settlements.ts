// Dominio de liquidaciones a merchants (plataforma → merchant).
// La plataforma recauda las órdenes de cada restaurante y le paga al merchant el neto
// del día (el "pago de caja"). Estos tipos modelan ese flujo.
// Propiedades en snake_case para coincidir con el contrato REST (/api/v1/platform/...).

export type OrderChannel = 'POS' | 'ONLINE' | 'QR' | 'DELIVERY';
export type OrderPaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'WALLET';
export type OrderStatus = 'COMPLETED' | 'REFUNDED' | 'VOIDED' | 'PENDING';

export const ORDER_STATUSES: OrderStatus[] = ['COMPLETED', 'REFUNDED', 'VOIDED', 'PENDING'];
export const ORDER_CHANNELS: OrderChannel[] = ['POS', 'ONLINE', 'QR', 'DELIVERY'];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  COMPLETED: 'Completed',
  REFUNDED: 'Refunded',
  VOIDED: 'Voided',
  PENDING: 'Pending',
};

// Una orden de un merchant en uno de sus restaurantes (branch).
export interface MerchantOrder {
  id: number;
  company_id: number;
  merchant_name: string;
  branch_name: string;
  order_number: string;
  order_date: string; // Día de negocio (YYYY-MM-DD o ISO).
  channel: OrderChannel;
  payment_method: OrderPaymentMethod;
  gross_amount: number | string;
  status: OrderStatus;
  settlement_id?: number | null; // Liquidación que ya incluyó esta orden.
  created_at?: string;
}

export type SettlementStatus = 'PENDING' | 'PROCESSING' | 'PAID' | 'ON_HOLD' | 'FAILED';

export const SETTLEMENT_STATUSES: SettlementStatus[] = [
  'PENDING',
  'PROCESSING',
  'PAID',
  'ON_HOLD',
  'FAILED',
];

export const SETTLEMENT_STATUS_LABELS: Record<SettlementStatus, string> = {
  PENDING: 'Pending',
  PROCESSING: 'Processing',
  PAID: 'Paid',
  ON_HOLD: 'On Hold',
  FAILED: 'Failed',
};

// Liquidación diaria de un merchant: el monto neto que la plataforma le transfiere.
export interface MerchantSettlement {
  id: number;
  company_id: number;
  merchant_name: string;
  settlement_date: string; // Día de negocio liquidado.
  orders_count: number;
  gross_collected: number | string; // Suma de órdenes COMPLETED del día.
  refunds: number | string; // Suma de reembolsos (REFUNDED) del día.
  platform_fee: number | string; // Comisión de la plataforma.
  net_payout: number | string; // gross_collected - platform_fee - refunds.
  status: SettlementStatus;
  payout_reference?: string | null;
  paid_at?: string | null;
  created_at?: string;
  orders?: MerchantOrder[];
}

// DTO para ejecutar el payout ("pago de caja").
export interface ExecutePayoutDto {
  reference?: string;
}
