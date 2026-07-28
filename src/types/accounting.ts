export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface LedgerAccount {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  is_active: boolean;
  parent_account_id: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface CreateLedgerAccountDto {
  code: string;
  name: string;
  type: AccountType;
  parent_account_id?: number | null;
}

export type UpdateLedgerAccountDto = Partial<CreateLedgerAccountDto> & {
  is_active?: boolean;
};

export type JournalEntryStatus = 'DRAFT' | 'POSTED' | 'VOIDED';

export type JournalEntryReferenceType =
  | 'ORDER'
  | 'PAYMENT'
  | 'PAYROLL'
  | 'TAX'
  | 'INVENTORY'
  | 'ADJUSTMENT'
  | 'MANUAL';

export interface JournalEntryLine {
  id: number;
  account: { id: number; code: string; name: string } | null;
  debit: number;
  credit: number;
  description: string | null;
}

export interface JournalEntry {
  id: number;
  entry_number: string;
  entry_date: string;
  description: string | null;
  status: JournalEntryStatus;
  total_debit: number;
  total_credit: number;
  is_balanced: boolean;
  reference_type: JournalEntryReferenceType | null;
  reference_id: number | null;
  created_at: string;
  updated_at: string;
  company: { id: number; name: string } | null;
  lines: JournalEntryLine[];
}

export interface CreateJournalEntryLineDto {
  account_id: number;
  debit: number;
  credit: number;
  description?: string;
}

export type UpdateJournalEntryLineDto = Partial<Omit<CreateJournalEntryLineDto, 'description'>> & {
  description?: string | null;
};

export interface CreateJournalEntryDto {
  entry_number: string;
  entry_date: string;
  description?: string;
  status?: JournalEntryStatus;
  reference_type?: JournalEntryReferenceType;
  reference_id?: number;
  lines: CreateJournalEntryLineDto[];
}

export type UpdateJournalEntryDto = Partial<CreateJournalEntryDto>;
