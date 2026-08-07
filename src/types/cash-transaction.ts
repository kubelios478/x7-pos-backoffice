import type { CashShiftStatus } from './cash-shift';

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

export interface BasicCollaboratorInfo {
  id: number;
  name: string;
  role: string;
}

export interface CashTransactionCashShift {
  id: number;
  status: CashShiftStatus;
  openedAt: string;
  closedAt: string | null;
  openingBalance: number;
  openedByCollaborator: BasicCollaboratorInfo;
  closedByCollaborator: BasicCollaboratorInfo | null;
}

export interface LoyaltyPointTransaction {
  id: number;
  description: string | null;
  source: string;
  points: number;
  loyaltyCustomerId: number;
  createdAt: string;
}

export interface CashTransaction {
  id: number;
  cashDrawerId: number;
  orderId: number | null;
  type: CashTransactionType;
  amount: number;
  collaboratorId: number;
  status: CashTransactionStatus;
  notes?: string | null;
  collaborator?: BasicCollaboratorInfo;
  cashShift?: CashTransactionCashShift | null;
  loyaltyPointTransactions?: LoyaltyPointTransaction[];
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
