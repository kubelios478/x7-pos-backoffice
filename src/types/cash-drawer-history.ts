// ─── Cash Drawer History — Type Surface ────────────────────────────────────
//
// Maps to the CashDrawerHistory entity as returned by the backend DTO.
// Status values are lowercase ('active' | 'deleted') per backend enum.
// Collaborator refs expose a single `name` field (not firstName/lastName).
// Balances arrive as numeric strings from Postgres `decimal`; normalize via
// normalizeHistoryRecord() at the fetch boundary.

export type CashDrawerHistoryStatus = 'active' | 'deleted';

export interface CashDrawerHistoryCollaboratorRef {
  id: number;
  name: string;
  role: string;
}

export interface CashDrawerHistoryDrawerRef {
  id: number;
  openingBalance: number;
  closingBalance: number | null;
}

export interface CashDrawerHistory {
  id: number;
  cashDrawerId: number;
  openingBalance: number;
  closingBalance: number;
  openedBy: number;
  closedBy: number | null;
  status: CashDrawerHistoryStatus;
  createdAt: string;
  updatedAt: string;

  // Eager-loaded relational bindings
  cashDrawer: CashDrawerHistoryDrawerRef;
  openedByCollaborator: CashDrawerHistoryCollaboratorRef;
  closedByCollaborator: CashDrawerHistoryCollaboratorRef | null;
}

export interface CashDrawerHistoryPaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}
