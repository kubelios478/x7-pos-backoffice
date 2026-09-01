import { getAccessToken } from '../lib/auth-storage';
import type {
  Tip,
  TipStatus,
  FetchTipsParams,
  TipsSummaryMetrics,
} from '../types/tips';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const MOCK_TIPS: Tip[] = [
  {
    id: 1001,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    order_id: 5012,
    payment_id: 8841,
    amount: 15.5,
    method: 'CARD',
    status: 'PENDING',
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 2).toISOString(),
    notes: 'Gratuity from Table 4 card payment',
    collaborator_name: 'Sofia Rodriguez',
  },
  {
    id: 1002,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    order_id: 5013,
    payment_id: null,
    amount: 5.0,
    method: 'CASH',
    status: 'PENDING',
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 3.5).toISOString(),
    notes: 'Independent cash tip at bar counter',
    collaborator_name: 'Mateo Hernandez',
  },
  {
    id: 1003,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    order_id: 5014,
    payment_id: 8843,
    amount: 22.75,
    method: 'ONLINE',
    status: 'ALLOCATED',
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 5).toISOString(),
    notes: 'App checkout digital tip',
    collaborator_name: 'Valeria Gomez',
  },
  {
    id: 1004,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    order_id: 5015,
    payment_id: 8844,
    amount: 12.0,
    method: 'QR_PAYMENT',
    status: 'SETTLED',
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 8).toISOString(),
    notes: 'Table QR code payment tip',
    collaborator_name: 'Carlos Mendoza',
  },
  {
    id: 1005,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    order_id: 5016,
    payment_id: 8845,
    amount: 8.5,
    method: 'CARD',
    status: 'PENDING',
    record_status: 'DELETED',
    created_at: new Date(Date.now() - 3600000 * 10).toISOString(),
    notes: 'Voided transaction tip adjustment',
    collaborator_name: 'Sofia Rodriguez',
  },
  {
    id: 1006,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    order_id: 5017,
    payment_id: 8846,
    amount: 18.0,
    method: 'CARD',
    status: 'ALLOCATED',
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    notes: 'Shift pool allocated tip',
    collaborator_name: 'Mateo Hernandez',
  },
  {
    id: 1007,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    order_id: 5018,
    payment_id: null,
    amount: 10.0,
    method: 'CASH',
    status: 'SETTLED',
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 16).toISOString(),
    notes: 'Settled shift tip payout',
    collaborator_name: 'Valeria Gomez',
  },
  {
    id: 1008,
    company_id: 'cmp-01',
    merchant_id: 'mch-01',
    order_id: 5019,
    payment_id: 8848,
    amount: 35.0,
    method: 'ONLINE',
    status: 'SETTLED',
    record_status: 'ACTIVE',
    created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
    notes: 'Catering order online tip',
    collaborator_name: 'Carlos Mendoza',
  },
];

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface FetchTipsResponse {
  data: Tip[];
  meta?: {
    total: number;
    company_id: string;
    merchant_id: string;
    indexes_used?: string[];
  };
}

export async function fetchTips(params: FetchTipsParams): Promise<Tip[]> {
  const query = new URLSearchParams();
  query.append('company_id', params.company_id);
  query.append('merchant_id', params.merchant_id);

  if (params.order_id !== undefined && params.order_id !== '') {
    query.append('order_id', String(params.order_id));
  }

  if (params.status) {
    if (Array.isArray(params.status)) {
      params.status.forEach((st) => query.append('status', st));
    } else if (params.status !== 'ALL') {
      query.append('status', params.status);
    }
  }

  if (params.method && params.method !== 'ALL') {
    query.append('method', params.method);
  }

  if (params.record_status && params.record_status !== 'ALL') {
    query.append('record_status', params.record_status);
  }

  if (params.search && params.search.trim() !== '') {
    query.append('search', params.search.trim());
  }

  if (params.date_from) {
    query.append('date_from', params.date_from);
  }

  if (params.date_to) {
    query.append('date_to', params.date_to);
  }

  const path = `/v1/tips?${query.toString()}`;

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}`);
    }

    const json = (await response.json()) as FetchTipsResponse | Tip[];
    let tips: Tip[] = [];

    if (Array.isArray(json)) {
      tips = json;
    } else if (json && Array.isArray(json.data)) {
      tips = json.data;
    }

    return tips.map(normalizeTip);
  } catch (err) {
    // Fallback for development / mock offline environment
    return filterMockTips(params);
  }
}

export interface PaymentOption {
  id: number;
  reference: string;
  method: string;
  amount: number;
}

export async function fetchPaymentOptionsForOrder(orderId: number): Promise<PaymentOption[]> {
  try {
    const response = await fetch(`${API_BASE}/v1/orders/${orderId}/payments`, {
      method: 'GET',
      headers: authHeaders(),
    });
    if (!response.ok) {
      throw new Error('Failed to fetch order payments');
    }
    const json = await response.json();
    return Array.isArray(json) ? json : json.data ?? [];
  } catch (err) {
    // Mock fallback options for development/testing
    return [
      { id: 8841, reference: '#PAY-8841', method: 'CARD', amount: 45.0 },
      { id: 8842, reference: '#PAY-8842', method: 'CARD', amount: 62.5 },
      { id: 8843, reference: '#PAY-8843', method: 'ONLINE', amount: 88.0 },
      { id: 8844, reference: '#PAY-8844', method: 'QR_PAYMENT', amount: 30.0 },
    ];
  }
}

export async function updateTip(id: number, payload: Partial<Tip>): Promise<Tip> {
  const existing = MOCK_TIPS.find((t) => t.id === id);
  if (existing && existing.status === 'SETTLED' && payload.amount !== undefined && payload.amount !== existing.amount) {
    throw new Error('Settled tips cannot be edited. Reverse the settlement transaction prior to modifying amount.');
  }

  try {
    const response = await fetch(`${API_BASE}/v1/tips/${id}`, {
      method: 'PATCH',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.message || `Failed to update tip entry (${response.status})`);
    }

    const json = await response.json();
    const updated = normalizeTip(json.data || json);
    updateMockTip(id, updated);
    return updated;
  } catch (err: any) {
    if (err.message && err.message.includes('Settled tips cannot be edited')) {
      throw err;
    }
    // Development / offline mock update fallback
    return updateMockTip(id, payload);
  }
}

export function updateMockTip(id: number, payload: Partial<Tip>): Tip {
  const index = MOCK_TIPS.findIndex((t) => t.id === id);
  if (index === -1) {
    throw new Error(`Tip entry #TIP-${id} not found.`);
  }

  const current = MOCK_TIPS[index];
  if (current.status === 'SETTLED' && payload.amount !== undefined && Number(payload.amount) !== current.amount) {
    throw new Error('Settled tips cannot be edited. Reverse the settlement transaction prior to modifying amount.');
  }

  const updated: Tip = normalizeTip({
    ...current,
    ...payload,
    amount: payload.amount !== undefined ? Number(payload.amount) : current.amount,
    updated_at: new Date().toISOString(),
  });

  MOCK_TIPS[index] = updated;
  return updated;
}

export function filterMockTips(params: FetchTipsParams): Tip[] {
  let list = [...MOCK_TIPS];

  if (params.order_id !== undefined && params.order_id !== '') {
    const targetOrder = String(params.order_id).toLowerCase().replace('#ord-', '');
    list = list.filter((t) => String(t.order_id).toLowerCase().includes(targetOrder));
  }

  if (params.status) {
    if (params.status === 'NON_SETTLED') {
      list = list.filter((t) => t.status === 'PENDING' || t.status === 'ALLOCATED');
    } else if (Array.isArray(params.status)) {
      list = list.filter((t) => (params.status as TipStatus[]).includes(t.status));
    } else if (params.status !== 'ALL') {
      list = list.filter((t) => t.status === params.status);
    }
  }

  if (params.method && params.method !== 'ALL') {
    list = list.filter((t) => t.method === params.method);
  }

  if (params.record_status && params.record_status !== 'ALL') {
    list = list.filter((t) => t.record_status === params.record_status);
  }

  if (params.search && params.search.trim() !== '') {
    const term = params.search.trim().toLowerCase();
    list = list.filter((t) => {
      const tipRef = `#tip-${t.id}`.toLowerCase();
      const orderRef = `#ord-${t.order_id}`.toLowerCase();
      const payRef = t.payment_id ? `#pay-${t.payment_id}`.toLowerCase() : '';
      return (
        tipRef.includes(term) ||
        orderRef.includes(term) ||
        payRef.includes(term) ||
        String(t.id).includes(term) ||
        String(t.order_id).includes(term) ||
        (t.payment_id !== null && String(t.payment_id).includes(term))
      );
    });
  }

  if (params.date_from) {
    const fromTime = new Date(params.date_from).getTime();
    if (!isNaN(fromTime)) {
      list = list.filter((t) => new Date(t.created_at).getTime() >= fromTime);
    }
  }

  if (params.date_to) {
    const toTime = new Date(params.date_to).getTime();
    if (!isNaN(toTime)) {
      list = list.filter((t) => new Date(t.created_at).getTime() <= toTime);
    }
  }

  return list.map(normalizeTip);
}

export function normalizeTip(raw: Tip): Tip {
  return {
    ...raw,
    amount: Number(raw.amount) || 0,
  };
}

export function formatTipCurrency(amount: number): string {
  return `$${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatTipDateTime(isoString: string): string {
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function calculateTipsSummaryMetrics(tips: Tip[]): TipsSummaryMetrics {
  const activeTips = tips.filter((t) => t.record_status === 'ACTIVE');
  const deletedTips = tips.filter((t) => t.record_status === 'DELETED');

  const totalAmount = activeTips.reduce((acc, t) => acc + t.amount, 0);

  const pendingTips = activeTips.filter((t) => t.status === 'PENDING');
  const pendingCount = pendingTips.length;
  const pendingAmount = pendingTips.reduce((acc, t) => acc + t.amount, 0);

  const allocatedAmount = activeTips
    .filter((t) => t.status === 'ALLOCATED')
    .reduce((acc, t) => acc + t.amount, 0);

  const settledAmount = activeTips
    .filter((t) => t.status === 'SETTLED')
    .reduce((acc, t) => acc + t.amount, 0);

  return {
    totalAmount,
    pendingCount,
    pendingAmount,
    allocatedAmount,
    settledAmount,
    activeCount: activeTips.length,
    deletedCount: deletedTips.length,
  };
}
