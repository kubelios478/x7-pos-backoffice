import React, { useState, useEffect, useMemo } from 'react';
import { saasService } from '../../services/saasService';
import type { SubscriptionPlan } from '../../types/subscription';

const formatPrice = (price: number): string =>
  `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const SubscriptionPlansView: React.FC = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [billingCycle, setBillingCycle] = useState('All Cycles');
  const [statusFilter, setStatusFilter] = useState('All Status');

  useEffect(() => {
    saasService
      .getSubscriptionPlans()
      .then(setPlans)
      .finally(() => setLoading(false));
  }, []);

  const uniqueBillingCycles = useMemo(
    () => ['All Cycles', ...Array.from(new Set(plans.map((p) => p.billingCycle)))],
    [plans],
  );

  const filtered = useMemo(
    () =>
      plans
        .filter(
          (p) =>
            searchTerm === '' ||
            p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.description.toLowerCase().includes(searchTerm.toLowerCase()),
        )
        .filter((p) => billingCycle === 'All Cycles' || p.billingCycle === billingCycle)
        .filter((p) => statusFilter === 'All Status' || p.status === statusFilter),
    [plans, searchTerm, billingCycle, statusFilter],
  );

  const clearFilters = () => {
    setSearchTerm('');
    setBillingCycle('All Cycles');
    setStatusFilter('All Status');
  };

  if (!loading && plans.length === 0) {
    return (
      <div
        data-testid="empty-state"
        className="flex flex-col items-center justify-center py-24 gap-6"
      >
        <span
          className="material-symbols-outlined text-[#5f5e5e]"
          style={{ fontSize: '72px' }}
        >
          inventory_2
        </span>
        <div className="text-center">
          <h3 className="text-xl font-bold text-[#1d1c17]">No Plans Configured</h3>
          <p className="text-sm text-[#5f5e5e] mt-2 max-w-md">
            No subscription plans have been provisioned yet. Click &apos;Add Plan&apos; to
            initialize your platform&apos;s monetization model.
          </p>
        </div>
        <button
          type="button"
          className="bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-[#930015] transition-colors"
        >
          <span className="material-symbols-outlined text-lg">add</span>
          ADD PLAN
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Filter Strip Card */}
      <div className="bg-white border border-[#e8e2d8] rounded-xl p-5 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="relative w-full md:w-96">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[#5f5e5e] text-lg">
            search
          </span>
          <input
            data-testid="filter-search"
            type="text"
            className="w-full pl-10 pr-4 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none transition-all font-[Poppins]"
            placeholder="Search plans..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3 w-full md:w-auto">
          <select
            data-testid="filter-billing-cycle"
            aria-label="Filter by billing cycle"
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl text-sm focus:border-[#ae001a] outline-none font-[Poppins]"
            value={billingCycle}
            onChange={(e) => setBillingCycle(e.target.value)}
          >
            {uniqueBillingCycles.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            data-testid="filter-status"
            aria-label="Filter by status"
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl text-sm focus:border-[#ae001a] outline-none font-[Poppins]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All Status">All Status</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
          <button
            type="button"
            className="bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl flex items-center gap-1.5 hover:bg-[#930015] transition-colors ml-auto md:ml-0"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            ADD PLAN
          </button>
        </div>
      </div>

      {/* Table Card */}
      <div className="bg-white border border-[#e8e2d8] overflow-hidden">
        <div className="px-4 py-3 bg-[#222222] flex justify-between items-center">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">
            SUBSCRIPTION MASTER PLANS
          </span>
          <span className="text-white/50 text-xs">
            {loading ? '...' : `${filtered.length} plans`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead className="bg-[#ece8e0] border-b border-[#e8e2d8]">
              <tr>
                <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                  Plan Name &amp; ID
                </th>
                <th className="px-6 py-3 text-left text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                  Description
                </th>
                <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                  Pricing &amp; Cadence
                </th>
                <th className="px-6 py-3 text-center text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e8e2d8]">
              {loading ? (
                [1, 2, 3].map((i) => (
                  <tr key={i}>
                    <td className="px-6 py-4">
                      <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-32" />
                    </td>
                    <td className="px-6 py-4">
                      <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-48" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-16 mx-auto" />
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="h-4 bg-[#ece8e0] rounded animate-pulse w-12 mx-auto" />
                    </td>
                    <td className="px-6 py-4" />
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-10 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <span className="material-symbols-outlined text-[#5f5e5e] text-4xl">
                        search_off
                      </span>
                      <p className="text-sm text-[#5f5e5e]">
                        No subscription profiles match your search filters
                      </p>
                      <button
                        type="button"
                        onClick={clearFilters}
                        className="text-[#ae001a] text-sm font-semibold hover:underline"
                      >
                        Clear filters
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((plan) => (
                  <tr key={plan.id} className="group hover:bg-[#f8f3eb] transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-1 h-10 rounded-full flex-shrink-0 ${
                            plan.status === 'active' ? 'bg-[#ae001a]' : 'bg-[#c8c6c5]'
                          }`}
                        />
                        <div>
                          <p className="font-bold text-[#1d1c17]">{plan.name}</p>
                          <code className="font-mono text-[11px] text-[#5f5e5e] bg-[#f2ede5] px-1.5 py-0.5 rounded">
                            {plan.id}
                          </code>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 max-w-[280px]">
                      <p className="text-sm text-[#5f5e5e] line-clamp-2">{plan.description}</p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-lg font-black text-[#1d1c17]">
                          {formatPrice(plan.price)}
                        </span>
                        <span className="text-[10px] font-bold uppercase text-[#5f5e5e] border border-[#e8e2d8] bg-[#f2ede5] px-2 py-0.5 rounded">
                          / {plan.billingCycle}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {plan.status === 'active' ? (
                        <span className="bg-green-500/10 text-green-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                          active
                        </span>
                      ) : (
                        <span className="bg-[#5f5e5e]/20 text-[#5f5e5e] text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                          inactive
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          aria-label={`Edit ${plan.name}`}
                          className="p-1 hover:text-[#ae001a] transition-colors"
                        >
                          <span className="material-symbols-outlined text-xl">edit</span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${plan.name}`}
                          className="p-1 hover:text-[#ba1a1a] transition-colors"
                        >
                          <span className="material-symbols-outlined text-xl">delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Quick Launch Footer */}
      <div className="bg-[#2a2a2a] rounded-xl p-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h3 className="text-white font-bold text-base">Quick Launch</h3>
          <p className="text-white/60 text-sm">
            Billing tools and instant platform management functions.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" className="bg-white text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest px-6 py-3 border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-transform">
            BILLING OVERVIEW
          </button>
          <button type="button" className="bg-white text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest px-6 py-3 border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-transform">
            EXPORT PLANS
          </button>
          <button type="button" className="bg-white text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest px-6 py-3 border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-transform">
            RUN REVENUE REPORT
          </button>
          <button type="button" className="bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest px-6 py-3 rounded hover:bg-[#930015] transition-colors">
            EMERGENCY SUPPORT
          </button>
        </div>
      </div>

      {/* Page Footer */}
      <footer className="flex flex-col md:flex-row justify-between items-center border-t border-[#e8e2d8] pt-5 mt-2 mb-8">
        <p className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]">
          © 2026 X7 Point of Sale. All rights reserved.
        </p>
        <div className="flex gap-6 mt-3 md:mt-0">
          <a href="#" className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] hover:text-[#ae001a] transition-colors underline">
            Privacy Policy
          </a>
          <a href="#" className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] hover:text-[#ae001a] transition-colors underline">
            Terms of Service
          </a>
          <a href="#" className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] hover:text-[#ae001a] transition-colors underline">
            Help Center
          </a>
        </div>
      </footer>
    </div>
  );
};

export default SubscriptionPlansView;
