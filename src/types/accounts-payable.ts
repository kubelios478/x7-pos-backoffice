// Tipos del dominio de Cuentas por Pagar (Accounts Payable).
// Las propiedades usan snake_case para coincidir con el contrato de la API REST
// (GET /api/v1/accounts-payable/...) y con el resto de vistas de inventario/proveedores.

// Valores en minúsculas para coincidir con el enum del backend
// (SupplierInvoiceStatus: pending | partially_paid | paid | cancelled).
// "Overdue" no es un estado persistido: se deriva en el front vía isPastDue().
export type SupplierInvoiceStatus =
  | 'pending'
  | 'partially_paid'
  | 'paid'
  | 'cancelled';

// Lista ordenada de estados para poblar selects y validaciones sin recorrer un enum.
export const SUPPLIER_INVOICE_STATUSES: SupplierInvoiceStatus[] = [
  'pending',
  'partially_paid',
  'paid',
  'cancelled',
];

// Etiquetas legibles para badges y selectores.
export const SUPPLIER_INVOICE_STATUS_LABELS: Record<SupplierInvoiceStatus, string> = {
  pending: 'Pending',
  partially_paid: 'Partially Paid',
  paid: 'Paid',
  cancelled: 'Cancelled',
};

// ================= Tipos de documento (compartidos AP) =================

// document_type es varchar(50) libre en el backend; el front ofrece este catálogo
// cerrado tanto en las líneas de pago como en las asignaciones.
export type ApDocumentType = 'invoice' | 'debit_note' | 'adjustment' | 'advance';

export const AP_DOCUMENT_TYPES: ApDocumentType[] = [
  'invoice',
  'debit_note',
  'adjustment',
  'advance',
];

// Las asignaciones apuntan a documentos de deuda: 'advance' no aplica como destino.
export const AP_ALLOCATION_DOCUMENT_TYPES: ApDocumentType[] = [
  'invoice',
  'debit_note',
  'adjustment',
];

export const AP_DOCUMENT_TYPE_LABELS: Record<ApDocumentType, string> = {
  invoice: 'Invoice',
  debit_note: 'Debit Note',
  adjustment: 'Adjustment',
  advance: 'Advance Payment',
};

export const AP_DOCUMENT_TYPE_BADGE_STYLES: Record<ApDocumentType, string> = {
  invoice: 'bg-blue-500/10 text-blue-700',
  debit_note: 'bg-[#5f5e5e]/20 text-[#5f5e5e]',
  adjustment: 'bg-amber-500/10 text-amber-700',
  advance: 'bg-purple-500/10 text-purple-700',
};

// El backend no valida el catálogo, así que un valor desconocido cae a un badge
// neutro y a una etiqueta legible derivada del propio string.
export const documentTypeLabel = (type: string): string =>
  AP_DOCUMENT_TYPE_LABELS[type as ApDocumentType] ??
  type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const documentTypeBadgeStyle = (type: string): string =>
  AP_DOCUMENT_TYPE_BADGE_STYLES[type as ApDocumentType] ??
  'bg-[#ece8e0] text-[#1d1c17]';

// Vínculo relacional mínimo hacia el proveedor (supplier) embebido en la factura.
export interface InvoiceSupplierRef {
  id: number;
  name: string;
  tax_id?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

// Vínculo relacional mínimo hacia el producto del catálogo de inventario.
// Variante de inventario de un producto. El backend exige product_id + variant_id
// juntos al vincular una línea a inventario (para el recibo de stock).
export interface InvoiceVariantRef {
  id: number;
  name: string;
  sku?: string | null;
  isActive?: boolean;
}

export interface InvoiceProductRef {
  id: number;
  name: string;
  sku?: string | null;
  last_cost?: number | string | null;
  variants?: InvoiceVariantRef[];
}

// Vínculo relacional mínimo hacia la factura padre desde una línea.
export interface ItemInvoiceRef {
  id: number;
  invoice_number: string;
}

export interface SupplierInvoiceItem {
  id: number;
  invoice_id: number;
  invoice?: ItemInvoiceRef | null;
  product_id: number | null;
  variant_id?: number | null;
  product?: InvoiceProductRef | null;
  description: string;
  quantity: number | string;
  unit_price: number | string;
  tax_amount: number | string;
  line_subtotal: number | string;
  line_total: number | string;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface SupplierInvoice {
  id: number;
  company_id: number;
  supplier_id: number;
  supplier?: InvoiceSupplierRef | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  subtotal: number | string;
  tax_total: number | string;
  total_amount: number | string;
  paid_amount: number | string;
  balance_due: number | string;
  status: SupplierInvoiceStatus;
  notes?: string | null;
  items?: SupplierInvoiceItem[];
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
}

// ---- DTOs de escritura ----

export interface CreateSupplierInvoiceDto {
  supplier_id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  tax_total: number;
  total_amount: number; // El backend lo exige explícitamente (= subtotal + tax_total).
  notes?: string | null;
  // company_id lo inyecta la vista en el body al enviar (se deriva de la sesión/JWT).
}

export type UpdateSupplierInvoiceDto = Partial<CreateSupplierInvoiceDto>;

export interface CreateSupplierInvoiceItemDto {
  invoice_id: number;
  product_id?: number | null;
  variant_id?: number | null;
  description: string;
  quantity: number;
  unit_price: number;
  line_subtotal: number; // Requerido por el backend.
  tax_amount: number;
  line_total: number; // Requerido por el backend.
}

// ================= Supplier Credit Notes =================

// Valores en minúsculas para coincidir con el enum del backend
// (SupplierCreditNoteStatus: draft | issued | partially_applied | fully_applied | cancelled).
export type SupplierCreditNoteStatus =
  | 'draft'
  | 'issued'
  | 'partially_applied'
  | 'fully_applied'
  | 'cancelled';

export const SUPPLIER_CREDIT_NOTE_STATUSES: SupplierCreditNoteStatus[] = [
  'draft',
  'issued',
  'partially_applied',
  'fully_applied',
  'cancelled',
];

export const SUPPLIER_CREDIT_NOTE_STATUS_LABELS: Record<SupplierCreditNoteStatus, string> = {
  draft: 'Draft',
  issued: 'Issued',
  partially_applied: 'Partially Applied',
  fully_applied: 'Fully Applied',
  cancelled: 'Cancelled',
};

export interface SupplierCreditNote {
  id: number;
  company_id: number;
  supplier_id: number;
  supplier?: InvoiceSupplierRef | null; // Resuelto en el front (el backend no lo embebe).
  credit_note_number: string;
  issue_date: string;
  total_amount: number | string;
  applied_amount: number | string;
  status: SupplierCreditNoteStatus;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  allocations?: SupplierPaymentAllocation[]; // Cargadas aparte para el drawer de detalle.
}

// Vínculo relacional mínimo hacia el pago padre desde una línea o asignación.
// El backend no lo embebe: se resuelve en el front contra /api/supplier-payments.
export interface ItemPaymentRef {
  id: number;
  payment_number: string;
}

// Vínculo relacional mínimo hacia la nota de crédito que financia una asignación.
export interface AllocationCreditNoteRef {
  id: number;
  credit_note_number: string;
}

// Aplicación de un pago/nota de crédito contra un documento (factura).
// payment_id y credit_note_id son mutuamente excluyentes (XOR): exactamente uno
// está presente — el backend rechaza ambos o ninguno.
export interface SupplierPaymentAllocation {
  id: number;
  payment_id: number | null;
  payment?: ItemPaymentRef | null; // Resuelto en el front.
  credit_note_id: number | null;
  credit_note?: AllocationCreditNoteRef | null; // Resuelto en el front.
  supplier_id: number;
  document_number: string;
  document_type: string;
  allocated_amount: number | string;
  created_at?: string;
  deleted_at?: string | null;
}

// Origen de fondeo de una asignación, derivado de qué id viene informado.
export type AllocationSourceType = 'payment' | 'credit_note';

export const allocationSourceType = (
  a: Pick<SupplierPaymentAllocation, 'payment_id' | 'credit_note_id'>,
): AllocationSourceType => (a.credit_note_id != null ? 'credit_note' : 'payment');

// Cuerpo para crear una asignación de pago→documento (invoice) contra un proveedor.
// Enviar SOLO uno de payment_id / credit_note_id (el otro va null u omitido).
export interface CreateSupplierPaymentAllocationDto {
  payment_id?: number | null;
  credit_note_id?: number | null;
  supplier_id: number;
  document_number: string;
  document_type: string;
  allocated_amount: number;
}

export type UpdateSupplierPaymentAllocationDto =
  Partial<CreateSupplierPaymentAllocationDto>;

export interface CreateSupplierCreditNoteDto {
  supplier_id: number;
  credit_note_number: string;
  issue_date: string;
  total_amount: number;
  // company_id lo inyecta la vista al enviar (se deriva de la sesión/JWT).
}

export type UpdateSupplierCreditNoteDto = Partial<CreateSupplierCreditNoteDto> & {
  status?: SupplierCreditNoteStatus;
};

// ================= Supplier Payments (Disbursements) =================

// Valores en minúsculas para coincidir con el enum del backend
// (SupplierPaymentStatus: draft | posted | partially_allocated | fully_allocated | cancelled).
export type SupplierPaymentStatus =
  | 'draft'
  | 'posted'
  | 'partially_allocated'
  | 'fully_allocated'
  | 'cancelled';

export const SUPPLIER_PAYMENT_STATUSES: SupplierPaymentStatus[] = [
  'draft',
  'posted',
  'partially_allocated',
  'fully_allocated',
  'cancelled',
];

export const SUPPLIER_PAYMENT_STATUS_LABELS: Record<SupplierPaymentStatus, string> = {
  draft: 'Draft',
  posted: 'Posted',
  partially_allocated: 'Partially Allocated',
  fully_allocated: 'Fully Allocated',
  cancelled: 'Voided', // El backend usa 'cancelled'; la UI lo muestra como "Voided" (spec).
};

// Métodos ofrecidos en el filtro (subconjunto del spec: Bank Transfer, Check, Credit Card, Cash).
export const SUPPLIER_PAYMENT_METHOD_FILTERS: Array<{ value: string; label: string }> = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'check', label: 'Check' },
  { value: 'card', label: 'Credit Card' },
  { value: 'cash', label: 'Cash' },
];

// Línea de desglose de un pago (breakdown items): qué documento externo cubre
// cada porción del voucher de desembolso.
export interface SupplierPaymentItem {
  id: number;
  payment_id: number;
  payment?: ItemPaymentRef | null; // Resuelto en el front (el backend no lo embebe).
  document_number: string;
  document_type: string;
  amount: number | string;
  deleted_at?: string | null;
}

export interface CreateSupplierPaymentItemDto {
  payment_id: number;
  document_number: string;
  document_type: string;
  amount: number;
}

export type UpdateSupplierPaymentItemDto = Partial<CreateSupplierPaymentItemDto>;

// Estados del pago padre que congelan sus líneas de desglose (Posted Payment
// Immobility Lock). 'cancelled' se muestra como "Voided" en la UI.
const FROZEN_PAYMENT_STATUSES: SupplierPaymentStatus[] = [
  'posted',
  'fully_allocated',
  'cancelled',
];

// Un pago está inmovilizado si ya se contabilizó/anuló o si tiene monto asignado
// (esto último cubre además 'partially_allocated').
export const isPaymentFrozen = (
  p: Pick<SupplierPayment, 'status' | 'allocated_amount'>,
): boolean => {
  const allocated =
    typeof p.allocated_amount === 'number'
      ? p.allocated_amount
      : parseFloat(p.allocated_amount ?? '0');
  return (
    FROZEN_PAYMENT_STATUSES.includes(p.status) ||
    (!isNaN(allocated) && allocated > 0)
  );
};

// payment_method es texto libre en el backend; ofrecemos opciones comunes en el form.
export const SUPPLIER_PAYMENT_METHODS: Array<{ value: string; label: string }> = [
  { value: 'bank_transfer', label: 'Bank Transfer' },
  { value: 'cash', label: 'Cash' },
  { value: 'check', label: 'Check' },
  { value: 'card', label: 'Card' },
  { value: 'wire', label: 'Wire' },
  { value: 'other', label: 'Other' },
];

export interface SupplierPayment {
  id: number;
  company_id: number;
  supplier_id: number;
  supplier?: InvoiceSupplierRef | null; // Resuelto en el front.
  payment_number: string;
  payment_date: string;
  payment_method: string;
  reference?: string | null;
  total_amount: number | string;
  allocated_amount: number | string;
  status: SupplierPaymentStatus;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string | null;
  allocations?: SupplierPaymentAllocation[];
}

export interface CreateSupplierPaymentDto {
  supplier_id: number;
  payment_number: string;
  payment_date: string;
  payment_method: string;
  reference?: string | null;
  total_amount: number;
  // company_id lo inyecta la vista al enviar (se deriva de la sesión/JWT).
}

export type UpdateSupplierPaymentDto = Partial<CreateSupplierPaymentDto> & {
  status?: SupplierPaymentStatus;
};

export type UpdateSupplierInvoiceItemDto = Partial<CreateSupplierInvoiceItemDto>;
