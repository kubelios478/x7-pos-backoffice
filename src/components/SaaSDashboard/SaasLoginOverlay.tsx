import React, { useState } from 'react';
import { saveSaasToken } from '../../lib/saas-auth-storage';

interface Props {
  onSuccess: () => void;
}

export const SaasLoginOverlay: React.FC<Props> = ({ onSuccess }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Invalid credentials');
      }
      if (data.user?.role !== 'portal_admin') {
        throw new Error('Access restricted to Platform Administrators');
      }
      saveSaasToken(data.access_token);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#f1ece4] z-[100] flex items-center justify-center">
      <div className="w-full max-w-md bg-white border border-[#e8e2d8] p-10 shadow-lg">
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-6">
            <span className="font-black text-xl text-[#222]">X7</span>
            <span className="text-[#d51f2c] font-black text-xl">·</span>
            <span className="text-[11px] font-bold uppercase tracking-widest text-[#666]">
              Platform SaaS
            </span>
          </div>
          <h1 className="text-2xl font-black text-[#222] uppercase tracking-tight">
            Admin Access
          </h1>
          <p className="text-sm text-[#666] mt-1">
            Sign in with your Platform Administrator account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-[#666] block mb-1.5">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full px-4 py-2.5 border border-[#e8e2d8] bg-[#fef9f1] text-sm focus:border-[#222] outline-none transition-colors"
              placeholder="admin@platform.com"
            />
          </div>
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-[#666] block mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-2.5 border border-[#e8e2d8] bg-[#fef9f1] text-sm focus:border-[#222] outline-none transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">error</span>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#d51f2c] text-white font-bold text-[11px] uppercase tracking-widest py-3 hover:bg-[#b01a24] transition-colors disabled:opacity-50 mt-2"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
};
