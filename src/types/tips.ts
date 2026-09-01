export type TipMethod = 'CARD' | 'CASH' | 'ONLINE' | 'QR_PAYMENT';

export type TipStatus = 'PENDING' | 'ALLOCATED' | 'SETTLED';

export type TipRecordStatus = 'ACTIVE' | 'DELETED';

export interface Tip {
  id: number;
  company_id: string;
  merchant_id: string;
  order_id: number;
  payment_id: number | null;
  amount: number;
  method: TipMethod;
  status: TipStatus;
  record_status: TipRecordStatus;
  created_at: string;
  updated_at?: string;
  notes?: string | null;
  collaborator_id?: number | null;
  collaborator_name?: string | null;
}

export interface FetchTipsParams {
  company_id: string;
  merchant_id: string;
  order_id?: number | string;
  status?: TipStatus | 'ALL' | TipStatus[] | 'NON_SETTLED';
  method?: TipMethod | 'ALL';
  record_status?: TipRecordStatus | 'ALL';
  search?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
  offset?: number;
}

export interface TipsSummaryMetrics {
  totalAmount: number;
  pendingCount: number;
  pendingAmount: number;
  allocatedAmount: number;
  settledAmount: number;
  activeCount: number;
  deletedCount: number;
}
