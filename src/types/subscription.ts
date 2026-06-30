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

export interface CreatePlanApplicationDto {
  subscriptionPlan: number;
  application: number;
  limits: string;
  status: 'active';
}

export interface UpdatePlanApplicationDto {
  limits: string;
  status: 'active' | 'inactive';
}

export interface Application {
  id: number;
  name: string;
  description: string;
  category: string;
  status: 'active' | 'inactive' | 'deleted';
}

export interface PlatformFeature {
  id: number;
  name: string;
  description: string;
  Unit: string;
  status: string;
}

export interface PlanApplication {
  id: number;
  subscriptionPlan: { id: number; name: string };
  application: { id: number; name: string; category: string };
  limits: string;
  status: string;
}
