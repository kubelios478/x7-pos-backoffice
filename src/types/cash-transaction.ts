import type { CashShiftStatus } from './cash-shift';

export type CashTransactionType =
  | 'SALE'
  | 'REFUND'
  | 'PAY_IN'
  | 'PAY_OUT'
  | 'DRAWER_DROP'
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

export type CashTransactionStatus =
  | 'ACTIVE'
  | 'VOIDED'
  | 'AUDITED'
  | 'RECONCILED'
  | 'active'
  | 'deleted';

export interface BasicCollaboratorInfo {
  id: number;
  name: string;
  firstName?: string;
  lastName?: string;
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

export interface CashTransactionOrderRelation {
  id: number;
  orderNumber?: string;
}

export interface CashTransaction {
  id: number;
  cashDrawerId: number;
  shiftId?: number | null;
  orderId: number | null;
  orderNumber?: string | null;
  order?: CashTransactionOrderRelation | null;
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
