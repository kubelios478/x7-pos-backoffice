import React, { useEffect, useState } from 'react';
import { getAccessToken, clearAuthSession } from '../../../../lib/auth-storage';
import type { CashDrawer } from '../../../../types/cash-drawer';

const API_BASE = import.meta.env.VITE_API_URL ?? '/api';

export const CashDrawersView: React.FC = () => {
  const [drawers, setDrawers] = useState<CashDrawer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCashDrawers = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = getAccessToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const params = new URLSearchParams({ limit: '100', sortBy: 'createdAt', sortOrder: 'DESC' });
      const res = await fetch(`${API_BASE}/cash-drawers?${params.toString()}`, { headers });

      if (res.status === 401) {
        clearAuthSession();
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        throw new Error('Error al cargar las sesiones de caja');
      }

      const json = await res.json();
      setDrawers(json.data ?? []);
    } catch (err) {
      console.error('Error fetching cash drawers:', err);
      setError('Failed to load cash drawer sessions. Please check if the backend is running.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCashDrawers();
  }, []);

  if (error) {
    return (
      <div className="border border-red-300 bg-red-50 p-8 text-center">
        <span className="material-symbols-outlined text-red-500 text-4xl" aria-hidden="true">
          error
        </span>
        <p className="mt-3 text-red-700 font-medium">{error}</p>
        <button
          type="button"
          onClick={fetchCashDrawers}
          className="mt-4 px-4 py-2 bg-[#222222] text-white font-bold text-[11px] uppercase tracking-widest hover:bg-[#ae001a] transition-colors"
        >
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 animate-fade-in text-left">
      {loading && <p>Loading...</p>}
    </div>
  );
};

export default CashDrawersView;
