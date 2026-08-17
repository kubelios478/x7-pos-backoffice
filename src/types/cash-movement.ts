/**
 * CashMovement entity types — aligned with the backend CashMovementResponseDto
 * and cash-movement-type.enum.ts.
 *
 * GET endpoint: GET /api/cash-shifts/:shiftId/expenses
 * Response:     { statusCode: number; data: CashMovement[] }
 */

/** Matches the backend CashMovementType enum exactly. */
export type CashMovementType = 'INFLOW' | 'OUTFLOW';

/** Payload sent to POST /api/cash-shifts/:shiftId/expenses (OUTFLOW) or /inflows (INFLOW). */
export interface CreateCashMovementDto {
  /** Positive amount, minimum 0.01. */
  amount: number;
  /** Mandatory justification text (e.g. "Meat Supplier Invoice #1024"). */
  reason: string;
  /** Optional Base64 data-URI or URL of the receipt photo. */
  receiptPhoto?: string;
}

/** Flat response DTO from the backend (no eager-loaded user). */
export interface CashMovement {
  id: number;
  shiftId: number;
  /** Backend returns amount as a number (already coerced by the service). */
  amount: number;
  reason: string;
  receiptPhoto: string | null;
  userId: number;
  type: CashMovementType;
  createdAt: string | Date;
}
