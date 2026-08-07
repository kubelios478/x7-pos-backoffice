export type TaxType = 'percentage' | 'fixed' | 'compound';
export type ConfigurationStatus = 'active' | 'inactive' | 'deleted';

export interface AuditUser {
  id: number;
  username: string | null;
  email: string;
}

export interface MerchantTaxRule {
  id: number;
  name: string;
  description: string;
  taxType: TaxType;
  rate: number | string;
  appliesToTips: boolean;
  appliesToOvertime: boolean;
  externalTaxCode: string | null;
  status: ConfigurationStatus;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: AuditUser | null;
  updatedBy?: AuditUser | null;
}

export interface CreateTaxRuleDto {
  name: string;
  description: string;
  taxType: TaxType;
  rate: number;
  appliesToTips: boolean;
  appliesToOvertime: boolean;
  externalTaxCode?: string;
}

export type UpdateTaxRuleDto = Omit<Partial<CreateTaxRuleDto>, 'externalTaxCode'> & {
  status?: 'active' | 'inactive';
  externalTaxCode?: string | null;
};

export type TipCalculationMethod = 'percentage' | 'fixed_amount' | 'custom';
export type TipDistributionMethod = 'individual' | 'pool' | 'role_based';

export interface MerchantTipRule {
  id: number;
  name: string;
  tipCalculationMethod: TipCalculationMethod;
  tipDistributionMethod: TipDistributionMethod;
  suggestedPercentages: (number | string)[] | null;
  fixedAmountOptions: (number | string)[] | null;
  allowCustomTip: boolean;
  maximumTipPercentage: number;
  autoDistribute: boolean;
  staffPercentage: number | string | null;
  kitchenPercentage: number | string | null;
  managerPercentage: number | string | null;
  status: ConfigurationStatus;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: AuditUser | null;
  updatedBy?: AuditUser | null;
}

export interface CreateTipRuleDto {
  name: string;
  tipCalculationMethod: TipCalculationMethod;
  tipDistributionMethod: TipDistributionMethod;
  suggestedPercentages: number[];
  fixedAmountOptions: number[];
  allowCustomTip: boolean;
  maximumTipPercentage: number;
  autoDistribute: boolean;
  staffPercentage?: number;
  kitchenPercentage?: number;
  managerPercentage?: number;
}

export type UpdateTipRuleDto = Partial<CreateTipRuleDto> & {
  status?: 'active' | 'inactive';
};

export type OvertimeCalculationType = 'daily' | 'weekly' | 'holiday' | 'special_day';
export type OvertimeRateType = 'percentage' | 'multiplier' | 'fixed_amount';

export interface MerchantOvertimeRule {
  id: number;
  name: string;
  description: string;
  calculationMethod: OvertimeCalculationType;
  thresholdHours: number | null;
  maxHours: number | null;
  rateMethod: OvertimeRateType;
  rateValue: number;
  appliesOnHolidays: boolean;
  appliesOnWeekends: boolean;
  priority: number;
  status: ConfigurationStatus;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: AuditUser | null;
  updatedBy?: AuditUser | null;
}

export interface CreateOvertimeRuleDto {
  name: string;
  description: string;
  calculationMethod: OvertimeCalculationType;
  thresholdHours?: number | null;
  maxHours?: number | null;
  rateMethod: OvertimeRateType;
  rateValue: number;
  appliesOnHolidays: boolean;
  appliesOnWeekends: boolean;
  priority: number;
}

export type UpdateOvertimeRuleDto = Partial<CreateOvertimeRuleDto> & {
  status?: 'active' | 'inactive';
};

export type PayrollFrequency = 'weekly' | 'biweekly' | 'monthly' | 'custom';

export interface MerchantPayrollRule {
  id: number;
  name: string;
  frequencyPayroll: PayrollFrequency;
  payDayOfWeek: number | string | null;
  payDayOfMonth: number | string | null;
  allowNegativePayroll: boolean;
  roundingPrecision: number | string | null;
  currency: string;
  autoApprovePayroll: boolean;
  requiresManagerApproval: boolean;
  status: ConfigurationStatus;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: AuditUser | null;
  updatedBy?: AuditUser | null;
}

export interface CreatePayrollRuleDto {
  name: string;
  frequencyPayroll: PayrollFrequency;
  payDayOfWeek?: number | null;
  payDayOfMonth?: number | null;
  allowNegativePayroll: boolean;
  roundingPrecision: number;
  currency: string;
  autoApprovePayroll: boolean;
  requiresManagerApproval: boolean;
}

export type UpdatePayrollRuleDto = Partial<CreatePayrollRuleDto> & {
  status?: 'active' | 'inactive';
};
