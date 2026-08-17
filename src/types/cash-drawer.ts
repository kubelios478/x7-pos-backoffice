export type CashDrawerStatus = 'Open' | 'Close' | 'Pause' | 'Discrepancy';

export interface CashDrawerMerchantRef {
  id: number;
  name: string;
}

export interface CashDrawerShiftRef {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  status: string;
  merchant: CashDrawerMerchantRef;
}

export interface CashDrawerCollaboratorRef {
  id: number;
  name: string;
  role: string;
}

export interface CashDrawer {
  id: number;
  openingBalance: number;
  currentBalance: number;
  closingBalance: number | null;
  createdAt: string;
  updatedAt: string;
  status: CashDrawerStatus;
  merchant: CashDrawerMerchantRef;
  shift: CashDrawerShiftRef;
  openedByCollaborator: CashDrawerCollaboratorRef;
  closedByCollaborator: CashDrawerCollaboratorRef | null;
}

export interface CreateCashDrawerDto {
  openingBalance: number;
}

export interface CloseCashDrawerDto {
  closingBalance: number;
}

export interface CashDrawerPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
