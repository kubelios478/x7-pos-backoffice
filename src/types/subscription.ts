export interface SubscriptionPlan {
  id: number;
  name: string;
  description: string;
  price: number;
  billingCycle: 'daily' | 'weekly' | 'monthly' | 'yearly';
  status: 'active' | 'inactive' | 'deleted';
}

export interface CreateSubscriptionPlanDto {
  name: string;
  description: string;
  price: number;
  billingCycle: 'daily' | 'weekly' | 'monthly' | 'yearly';
  status: 'active';
}

export interface UpdateSubscriptionPlanDto {
  name: string;
  description: string;
  price: number;
  billingCycle: 'daily' | 'weekly' | 'monthly' | 'yearly';
  status: 'active' | 'inactive';
}
