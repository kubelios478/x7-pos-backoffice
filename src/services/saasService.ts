import type { SubscriptionPlan, CreateSubscriptionPlanDto, UpdateSubscriptionPlanDto } from '../types/subscription';
import { getSaasToken, clearSaasToken } from '../lib/saas-auth-storage';

async function saasApiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getSaasToken();
  const res = await fetch(`/api/${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  });
  if (res.status === 401) {
    clearSaasToken();
    throw new Error('SESSION_EXPIRED');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { message?: string }).message || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export interface MerchantMetric {
  count: number;
  terminals: number;
}

export interface SaaSMetrics {
  totalMerchants: {
    value: number;
    growth: number;
    trend: number[]; // para el mini-chart
  };
  quickService: MerchantMetric;
  fullRestaurant: MerchantMetric;
  enterprise: MerchantMetric;
}

export interface RevenueData {
  amount: string;
  growthVsPrevYear: string;
  labels: string[];
  values: number[];
}

export interface RecentMerchant {
  id: string;
  name: string;
  joinedText: string;
  type: 'Quick Service' | 'Full Restaurant' | 'Enterprise';
  logoUrl?: string;
}

export interface ServiceHealth {
  status: 'operational' | 'degraded' | 'downtime';
  latency: number; // en ms
  authUptime: string; // ej "99.998%"
  paymentBridge: 'Stable' | 'Degraded' | 'Down';
  cloudNodes: {
    active: number;
    total: number;
  };
  subServices: {
    apiLatency: 'operational' | 'degraded' | 'downtime';
    authUptime: 'operational' | 'degraded' | 'downtime';
    paymentBridge: 'operational' | 'degraded' | 'downtime';
    cloudNodes: 'operational' | 'degraded' | 'downtime';
  };
}

// Bandera global para simular fallos en las pruebas
let simulateApiFailure = false;

export const setSimulateApiFailure = (fail: boolean) => {
  simulateApiFailure = fail;
};

export const getSimulateApiFailure = () => simulateApiFailure;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const saasService = {
  async getMetrics(): Promise<SaaSMetrics> {
    await delay(600); // simular retraso de red
    if (simulateApiFailure) {
      throw new Error('Failed to fetch SaaS metrics');
    }
    return {
      totalMerchants: {
        value: 2842,
        growth: 12.5,
        trend: [2100, 2250, 2400, 2350, 2600, 2750, 2842],
      },
      quickService: {
        count: 1120,
        terminals: 4480,
      },
      fullRestaurant: {
        count: 942,
        terminals: 7536,
      },
      enterprise: {
        count: 780,
        terminals: 15600,
      },
    };
  },

  async getRevenue(period: '1M' | '6M' | '1Y'): Promise<RevenueData> {
    await delay(500);
    if (simulateApiFailure) {
      throw new Error('Failed to fetch revenue data');
    }

    // Retornar datos dinámicos según el período
    switch (period) {
      case '1M':
        return {
          amount: '$410K',
          growthVsPrevYear: '+14.2% vs prev. month',
          labels: ['W1', 'W2', 'W3', 'W4'],
          values: [95000, 102000, 105000, 108000],
        };
      case '1Y':
        return {
          amount: '$8.4M',
          growthVsPrevYear: '+22.5% vs prev. year',
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
          values: [550000, 580000, 620000, 680000, 710000, 750000, 780000, 810000, 830000, 850000, 880000, 920000],
        };
      case '6M':
      default:
        return {
          amount: '$4.2M',
          growthVsPrevYear: '+18.2% vs prev. year',
          labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
          values: [580000, 620000, 680000, 710000, 750000, 860000],
        };
    }
  },

  async getRecentMerchants(): Promise<RecentMerchant[]> {
    await delay(400);
    if (simulateApiFailure) {
      throw new Error('Failed to fetch recent merchants');
    }
    return [
      {
        id: '1',
        name: 'The Copper Whisk',
        joinedText: 'Joined: 2 hours ago',
        type: 'Quick Service',
      },
      {
        id: '2',
        name: 'Lumière Bistro',
        joinedText: 'Joined: 5 hours ago',
        type: 'Full Restaurant',
      },
      {
        id: '3',
        name: 'Global Dining Group',
        joinedText: 'Joined: Yesterday',
        type: 'Enterprise',
        // Imagen real de restaurant para reemplazar placeholders de googleusercontent
        logoUrl: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=80&h=80&fit=crop&crop=faces&q=80',
      },
      {
        id: '4',
        name: 'Roast & Steam',
        joinedText: 'Joined: Yesterday',
        type: 'Quick Service',
      },
      {
        id: '5',
        name: 'Urban Bites HQ',
        joinedText: 'Joined: 2 days ago',
        type: 'Full Restaurant',
      },
    ];
  },

  async getHealthStatus(): Promise<ServiceHealth> {
    await delay(300);
    if (simulateApiFailure) {
      return {
        status: 'downtime',
        latency: 0,
        authUptime: '0.00%',
        paymentBridge: 'Down',
        cloudNodes: { active: 0, total: 142 },
        subServices: {
          apiLatency: 'downtime',
          authUptime: 'downtime',
          paymentBridge: 'downtime',
          cloudNodes: 'downtime',
        },
      };
    }

    // Simular degradación aleatoria muy esporádica o controlada para visualizar el punto amarillo/rojo
    // Para propósitos prácticos de demo, dejemos que esté operacional a menos que se fuerce el fallo.
    return {
      status: 'operational',
      latency: 24,
      authUptime: '99.998%',
      paymentBridge: 'Stable',
      cloudNodes: { active: 142, total: 142 },
      subServices: {
        apiLatency: 'operational',
        authUptime: 'operational',
        paymentBridge: 'operational',
        cloudNodes: 'operational',
      },
    };
  },

  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    const response = await saasApiFetch<{
      data: SubscriptionPlan[];
      pagination: { total: number; page: number; limit: number; totalPages: number };
    }>('subscription-plan');
    return response.data.map((plan) => ({ ...plan, price: Number(plan.price) }));
  },

  async createSubscriptionPlan(dto: CreateSubscriptionPlanDto): Promise<SubscriptionPlan> {
    const response = await saasApiFetch<{ data: SubscriptionPlan }>('subscription-plan', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
    return { ...response.data, price: Number(response.data.price) };
  },

  async updateSubscriptionPlan(id: number, dto: UpdateSubscriptionPlanDto): Promise<SubscriptionPlan> {
    const response = await saasApiFetch<{ data: SubscriptionPlan }>(
      `subscription-plan/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(dto),
      },
    );
    return { ...response.data, price: Number(response.data.price) };
  },

  async deleteSubscriptionPlan(id: number): Promise<SubscriptionPlan> {
    const response = await saasApiFetch<{ data: SubscriptionPlan }>(
      `subscription-plan/${id}`,
      { method: 'DELETE' },
    );
    return { ...response.data, price: Number(response.data.price) };
  },
};
