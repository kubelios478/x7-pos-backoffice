export type CashShiftStatus = 'OPEN' | 'CLOSED' | 'DISCREPANCY';

export interface CashShiftCollaboratorRef {
  id: number;
  name: string;
  role: string;
}

export interface CashShift {
  id: number;
  merchantId: number;
  cashDrawerId: number;
  openingBalance: number;
  systemAmount: number | null;
  declaredAmount: number | null;
  difference: number | null;
  status: CashShiftStatus;
  openedAt: string;
  closedAt: string | null;
  openedByCollaborator: CashShiftCollaboratorRef;
  closedByCollaborator: CashShiftCollaboratorRef | null;
}

export interface CreateCashShiftDto {
  cashDrawerId: number;
  openingBalance: number;
}

export interface CloseCashShiftDto {
  declaredAmount: number;
}
