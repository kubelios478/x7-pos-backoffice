export type CashTransactionType =
  | 'opening'
  | 'sale'
  | 'refund'
  | 'tip'
  | 'withdrawal'
  | 'adjustment_up'
  | 'adjustment_down'
  | 'close'
  | 'pause'
  | 'unpause';

export type CashTransactionStatus = 'active' | 'deleted';

export interface CashTransaction {
  id: number;
  cashDrawerId: number;
  orderId: number | null;
  type: CashTransactionType;
  amount: number;
  collaboratorId: number;
  status: CashTransactionStatus;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CashTransactionPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
