# Subscription Plans View — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `SubscriptionPlansView` component — a filterable data grid of subscription plans — and mount it inside `SaaSDashboard` at the existing `'subscription'` tab.

**Architecture:** New view component (`SubscriptionPlansView.tsx`) added to `src/components/SaaSDashboard/` following the established pattern of `ProductCategoriesView` inside `RestaurantDashboard`. All filter state is local via `useState` + `useMemo`. Mock data lives in `saasService.ts`. No new routes needed.

**Tech Stack:** React 19, TypeScript 6, Tailwind CSS 4, Vitest 4, React Testing Library 16, `@testing-library/user-event` 14, Material Symbols Outlined icons.

**Spec:** `docs/superpowers/specs/2026-06-17-subscription-plans-view-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/types/subscription.ts` | Create | `SubscriptionPlan` interface |
| `src/services/saasService.ts` | Modify | Add `getSubscriptionPlans()` mock |
| `src/services/saasService.test.ts` | Create | Tests for `getSubscriptionPlans()` |
| `src/components/SaaSDashboard/SubscriptionPlansView.tsx` | Create | Full view component |
| `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx` | Create | Component tests (table, filters, empty states) |
| `src/components/SaaSDashboard/SaaSDashboard.tsx` | Modify | Mount `SubscriptionPlansView` for `activeTab === 'subscription'` |

---

## Task 1 — SubscriptionPlan Type

**Files:**
- Create: `src/types/subscription.ts`

- [ ] **Step 1: Create the type file**

```typescript
// src/types/subscription.ts
export interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  billingCycle: string;
  status: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/subscription.ts
git commit -m "feat: add SubscriptionPlan type"
```

---

## Task 2 — `getSubscriptionPlans()` Service Function

**Files:**
- Modify: `src/services/saasService.ts`
- Create: `src/services/saasService.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/services/saasService.test.ts`:

```typescript
import { describe, expect, it, afterEach } from 'vitest';
import { saasService, setSimulateApiFailure } from './saasService';

describe('saasService.getSubscriptionPlans', () => {
  afterEach(() => {
    setSimulateApiFailure(false);
  });

  it('returns an array with at least one plan', async () => {
    const plans = await saasService.getSubscriptionPlans();
    expect(Array.isArray(plans)).toBe(true);
    expect(plans.length).toBeGreaterThan(0);
  });

  it('each plan has all required SubscriptionPlan fields', async () => {
    const plans = await saasService.getSubscriptionPlans();
    const plan = plans[0];
    expect(typeof plan.id).toBe('string');
    expect(typeof plan.name).toBe('string');
    expect(typeof plan.description).toBe('string');
    expect(typeof plan.price).toBe('number');
    expect(typeof plan.billingCycle).toBe('string');
    expect(typeof plan.status).toBe('string');
  });

  it('includes both active and inactive plans', async () => {
    const plans = await saasService.getSubscriptionPlans();
    expect(plans.some((p) => p.status === 'active')).toBe(true);
    expect(plans.some((p) => p.status === 'inactive')).toBe(true);
  });

  it('includes plans with more than one distinct billingCycle', async () => {
    const plans = await saasService.getSubscriptionPlans();
    const cycles = new Set(plans.map((p) => p.billingCycle));
    expect(cycles.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run the test — expect FAIL**

```bash
npm run test -- saasService.test
```

Expected output: `TypeError: saasService.getSubscriptionPlans is not a function`

- [ ] **Step 3: Add `getSubscriptionPlans` to `saasService.ts`**

Open `src/services/saasService.ts`. Add the import at the top and append the method inside the `saasService` object, after `getHealthStatus`:

First, add the import at the very top of the file (after existing imports, or at line 1):

```typescript
import type { SubscriptionPlan } from '../types/subscription';
```

Then, inside the `saasService` object (after the closing brace of `getHealthStatus`, before the final `};`), add:

```typescript
  async getSubscriptionPlans(): Promise<SubscriptionPlan[]> {
    await delay(600);
    return [
      {
        id: 'plan_starter_001',
        name: 'Starter',
        description: 'Entry-level plan for single-location quick service restaurants. Up to 2 POS terminals included.',
        price: 49.99,
        billingCycle: 'monthly',
        status: 'active',
      },
      {
        id: 'plan_pro_002',
        name: 'Professional',
        description: 'Multi-location support with advanced reporting, inventory management, and staff scheduling.',
        price: 129.99,
        billingCycle: 'monthly',
        status: 'active',
      },
      {
        id: 'plan_ent_003',
        name: 'Enterprise',
        description: 'Unlimited locations, white-label options, dedicated SLA, and custom integrations with ERP systems.',
        price: 1199.99,
        billingCycle: 'annual',
        status: 'active',
      },
      {
        id: 'plan_legacy_000',
        name: 'Legacy Basic',
        description: 'Deprecated legacy tier. No longer available for new merchants. Grandfathered accounts only.',
        price: 19.99,
        billingCycle: 'monthly',
        status: 'inactive',
      },
    ];
  },
```

- [ ] **Step 4: Run the tests — expect PASS**

```bash
npm run test -- saasService.test
```

Expected output: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add src/services/saasService.ts src/services/saasService.test.ts
git commit -m "feat: add getSubscriptionPlans mock to saasService"
```

---

## Task 3 — SubscriptionPlansView: Table Rendering

**Files:**
- Create: `src/components/SaaSDashboard/SubscriptionPlansView.tsx`
- Create: `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`:

```tsx
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SubscriptionPlansView } from './SubscriptionPlansView';
import { saasService } from '../../services/saasService';
import type { SubscriptionPlan } from '../../types/subscription';

vi.mock('../../services/saasService', () => ({
  saasService: {
    getSubscriptionPlans: vi.fn(),
  },
}));

const MOCK_PLANS: SubscriptionPlan[] = [
  {
    id: 'plan_starter_001',
    name: 'Starter',
    description: 'Entry-level plan for quick service restaurants.',
    price: 49.99,
    billingCycle: 'monthly',
    status: 'active',
  },
  {
    id: 'plan_pro_002',
    name: 'Professional',
    description: 'Multi-location support with advanced reporting.',
    price: 129.99,
    billingCycle: 'monthly',
    status: 'active',
  },
  {
    id: 'plan_ent_003',
    name: 'Enterprise',
    description: 'Unlimited locations with white-label options.',
    price: 1199.99,
    billingCycle: 'annual',
    status: 'active',
  },
  {
    id: 'plan_legacy_000',
    name: 'Legacy Basic',
    description: 'Deprecated legacy tier. Grandfathered accounts only.',
    price: 19.99,
    billingCycle: 'monthly',
    status: 'inactive',
  },
];

function renderView() {
  return render(<SubscriptionPlansView />);
}

describe('SubscriptionPlansView — table rendering', () => {
  beforeEach(() => {
    vi.mocked(saasService.getSubscriptionPlans).mockResolvedValue(MOCK_PLANS);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the SUBSCRIPTION MASTER PLANS heading', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('SUBSCRIPTION MASTER PLANS')).toBeInTheDocument();
    });
  });

  it('renders all plan names', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('Starter')).toBeInTheDocument();
      expect(screen.getByText('Professional')).toBeInTheDocument();
      expect(screen.getByText('Enterprise')).toBeInTheDocument();
      expect(screen.getByText('Legacy Basic')).toBeInTheDocument();
    });
  });

  it('renders each plan id inside a <code> element', async () => {
    renderView();
    await waitFor(() => {
      const codeEl = screen.getByText('plan_starter_001');
      expect(codeEl.tagName).toBe('CODE');
    });
  });

  it('renders plan descriptions', async () => {
    renderView();
    await waitFor(() => {
      expect(
        screen.getByText('Entry-level plan for quick service restaurants.'),
      ).toBeInTheDocument();
    });
  });

  it('renders price formatted with currency symbol and commas', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('$49.99')).toBeInTheDocument();
      expect(screen.getByText('$1,199.99')).toBeInTheDocument();
    });
  });

  it('renders billing cycle labels prefixed with /', async () => {
    renderView();
    await waitFor(() => {
      const monthlyLabels = screen.getAllByText('/ monthly');
      expect(monthlyLabels.length).toBeGreaterThan(0);
      expect(screen.getByText('/ annual')).toBeInTheDocument();
    });
  });

  it('renders active status badges', async () => {
    renderView();
    await waitFor(() => {
      const activeBadges = screen.getAllByText('active');
      expect(activeBadges.length).toBeGreaterThan(0);
    });
  });

  it('renders inactive status badge', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('inactive')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run the tests — expect FAIL**

```bash
npm run test -- SubscriptionPlansView.test
```

Expected output: `Cannot find module './SubscriptionPlansView'`

- [ ] **Step 3: Implement the component (table only, no filters)**

Create `src/components/SaaSDashboard/SubscriptionPlansView.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import { saasService } from '../../services/saasService';
import type { SubscriptionPlan } from '../../types/subscription';

const formatPrice = (price: number): string =>
  `$${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const SubscriptionPlansView: React.FC = () => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    saasService
      .getSubscriptionPlans()
      .then(setPlans)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex flex-col gap-6">
      {/* Table Card */}
      <div className="bg-white border border-[#e8e2d8] overflow-hidden">
        <div className="px-4 py-3 bg-[#222222] flex justify-between items-center">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">
            SUBSCRIPTION MASTER PLANS
          </span>
          <span className="text-white/50 text-xs">{plans.length} plans</span>
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
              ) : (
                plans.map((plan) => (
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
                        <button className="p-1 hover:text-[#ae001a] transition-colors">
                          <span className="material-symbols-outlined text-xl">edit</span>
                        </button>
                        <button className="p-1 hover:text-[#ba1a1a] transition-colors">
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
          <button className="bg-white text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest px-6 py-3 border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-transform">
            BILLING OVERVIEW
          </button>
          <button className="bg-white text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest px-6 py-3 border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-transform">
            EXPORT PLANS
          </button>
          <button className="bg-white text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest px-6 py-3 border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-transform">
            RUN REVENUE REPORT
          </button>
          <button className="bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest px-6 py-3 rounded hover:bg-[#930015] transition-colors">
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
          <a
            href="#"
            className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] hover:text-[#ae001a] transition-colors underline"
          >
            Privacy Policy
          </a>
          <a
            href="#"
            className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] hover:text-[#ae001a] transition-colors underline"
          >
            Terms of Service
          </a>
          <a
            href="#"
            className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] hover:text-[#ae001a] transition-colors underline"
          >
            Help Center
          </a>
        </div>
      </footer>
    </div>
  );
};

export default SubscriptionPlansView;
```

- [ ] **Step 4: Run the tests — expect PASS**

```bash
npm run test -- SubscriptionPlansView.test
```

Expected output: `8 passed`

- [ ] **Step 5: Commit**

```bash
git add src/components/SaaSDashboard/SubscriptionPlansView.tsx src/components/SaaSDashboard/SubscriptionPlansView.test.tsx
git commit -m "feat: add SubscriptionPlansView with table rendering"
```

---

## Task 4 — Filter Strip + Filter Logic

**Files:**
- Modify: `src/components/SaaSDashboard/SubscriptionPlansView.tsx`
- Modify: `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`

- [ ] **Step 1: Add filter tests to the existing test file**

Append a new `describe` block at the bottom of `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx` (after the closing `});` of the first describe):

```tsx
import userEvent from '@testing-library/user-event';

describe('SubscriptionPlansView — filter strip', () => {
  beforeEach(() => {
    vi.mocked(saasService.getSubscriptionPlans).mockResolvedValue(MOCK_PLANS);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders the search input', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search plans...')).toBeInTheDocument();
    });
  });

  it('filters rows by plan name on search input', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Search plans...'), 'Pro');

    expect(screen.getByText('Professional')).toBeInTheDocument();
    expect(screen.queryByText('Starter')).not.toBeInTheDocument();
    expect(screen.queryByText('Enterprise')).not.toBeInTheDocument();
    expect(screen.queryByText('Legacy Basic')).not.toBeInTheDocument();
  });

  it('filters rows by plan description on search input', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Search plans...'), 'quick service');

    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.queryByText('Professional')).not.toBeInTheDocument();
  });

  it('filters rows by billing cycle dropdown', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Enterprise')).toBeInTheDocument());

    await user.selectOptions(
      screen.getByTestId('filter-billing-cycle'),
      'annual',
    );

    expect(screen.getByText('Enterprise')).toBeInTheDocument();
    expect(screen.queryByText('Starter')).not.toBeInTheDocument();
    expect(screen.queryByText('Professional')).not.toBeInTheDocument();
  });

  it('filters rows by status dropdown', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Legacy Basic')).toBeInTheDocument());

    await user.selectOptions(
      screen.getByTestId('filter-status'),
      'inactive',
    );

    expect(screen.getByText('Legacy Basic')).toBeInTheDocument();
    expect(screen.queryByText('Starter')).not.toBeInTheDocument();
  });

  it('shows warning row when filters yield no results', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Search plans...'), 'xyznotexist');

    expect(
      screen.getByText('No subscription profiles match your search filters'),
    ).toBeInTheDocument();
  });

  it('clears all filters when Clear filters is clicked', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('Search plans...'), 'xyznotexist');
    expect(
      screen.getByText('No subscription profiles match your search filters'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /clear filters/i }));

    expect(screen.getByText('Starter')).toBeInTheDocument();
    expect(screen.getByText('Professional')).toBeInTheDocument();
  });

  it('billing cycle dropdown includes unique values from data', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    const select = screen.getByTestId('filter-billing-cycle') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);

    expect(options).toContain('All Cycles');
    expect(options).toContain('monthly');
    expect(options).toContain('annual');
  });
});
```

**Important:** The `import userEvent from '@testing-library/user-event'` line must be added at the top of the file with the existing imports.

- [ ] **Step 2: Run the tests — expect FAIL on filter tests**

```bash
npm run test -- SubscriptionPlansView.test
```

Expected output: `8 passed, 7 failed` (the new filter tests fail)

- [ ] **Step 3: Update `SubscriptionPlansView.tsx` to add filter state + strip + filtered rendering**

Replace the entire content of `src/components/SaaSDashboard/SubscriptionPlansView.tsx` with:

```tsx
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
            className="px-3 py-2 bg-[#fef9f1] border border-[#e8e2d8] rounded-xl text-sm focus:border-[#ae001a] outline-none font-[Poppins]"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="All Status">All Status</option>
            <option value="active">active</option>
            <option value="inactive">inactive</option>
          </select>
          <button className="bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest px-4 py-2 rounded-xl flex items-center gap-1.5 hover:bg-[#930015] transition-colors ml-auto md:ml-0">
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
          <span className="text-white/50 text-xs">{filtered.length} plans</span>
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
                        <button className="p-1 hover:text-[#ae001a] transition-colors">
                          <span className="material-symbols-outlined text-xl">edit</span>
                        </button>
                        <button className="p-1 hover:text-[#ba1a1a] transition-colors">
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
          <button className="bg-white text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest px-6 py-3 border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-transform">
            BILLING OVERVIEW
          </button>
          <button className="bg-white text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest px-6 py-3 border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-transform">
            EXPORT PLANS
          </button>
          <button className="bg-white text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest px-6 py-3 border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-transform">
            RUN REVENUE REPORT
          </button>
          <button className="bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest px-6 py-3 rounded hover:bg-[#930015] transition-colors">
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
          <a
            href="#"
            className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] hover:text-[#ae001a] transition-colors underline"
          >
            Privacy Policy
          </a>
          <a
            href="#"
            className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] hover:text-[#ae001a] transition-colors underline"
          >
            Terms of Service
          </a>
          <a
            href="#"
            className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] hover:text-[#ae001a] transition-colors underline"
          >
            Help Center
          </a>
        </div>
      </footer>
    </div>
  );
};

export default SubscriptionPlansView;
```

- [ ] **Step 4: Run the tests — expect all PASS**

```bash
npm run test -- SubscriptionPlansView.test
```

Expected output: `15 passed`

- [ ] **Step 5: Commit**

```bash
git add src/components/SaaSDashboard/SubscriptionPlansView.tsx src/components/SaaSDashboard/SubscriptionPlansView.test.tsx
git commit -m "feat: add filter strip and filter logic to SubscriptionPlansView"
```

---

## Task 5 — Empty Data State

**Files:**
- Modify: `src/components/SaaSDashboard/SubscriptionPlansView.tsx`
- Modify: `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`

- [ ] **Step 1: Add the empty state test**

Append a new `describe` block at the bottom of `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`:

```tsx
describe('SubscriptionPlansView — empty data state', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows empty state panel when service returns no plans', async () => {
    vi.mocked(saasService.getSubscriptionPlans).mockResolvedValue([]);
    renderView();
    await waitFor(() => {
      expect(
        screen.getByText(
          "No subscription plans have been provisioned yet. Click 'Add Plan' to initialize your platform's monetization model.",
        ),
      ).toBeInTheDocument();
    });
  });

  it('hides the table when service returns no plans', async () => {
    vi.mocked(saasService.getSubscriptionPlans).mockResolvedValue([]);
    renderView();
    await waitFor(() => {
      expect(screen.queryByText('SUBSCRIPTION MASTER PLANS')).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run the tests — expect the 2 new empty-state tests to FAIL**

```bash
npm run test -- SubscriptionPlansView.test
```

Expected output: `15 passed, 2 failed`

- [ ] **Step 3: Add the empty state conditional to `SubscriptionPlansView.tsx`**

In `src/components/SaaSDashboard/SubscriptionPlansView.tsx`, add the following block directly after the `clearFilters` function definition and before the `return (` statement:

```tsx
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
        <button className="bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-[#930015] transition-colors">
          <span className="material-symbols-outlined text-lg">add</span>
          ADD PLAN
        </button>
      </div>
    );
  }
```

**Note on the test assertion:** The test checks for the text including escaped apostrophes. In TSX, use `&apos;` for apostrophes inside JSX text. The rendered text in the DOM will be: `No subscription plans have been provisioned yet. Click 'Add Plan' to initialize your platform's monetization model.`

- [ ] **Step 4: Run the tests — expect all PASS**

```bash
npm run test -- SubscriptionPlansView.test
```

Expected output: `17 passed`

- [ ] **Step 5: Commit**

```bash
git add src/components/SaaSDashboard/SubscriptionPlansView.tsx src/components/SaaSDashboard/SubscriptionPlansView.test.tsx
git commit -m "feat: add empty data state to SubscriptionPlansView"
```

---

## Task 6 — Wire into SaaSDashboard

**Files:**
- Modify: `src/components/SaaSDashboard/SaaSDashboard.tsx`

- [ ] **Step 1: Add the import**

In `src/components/SaaSDashboard/SaaSDashboard.tsx`, add this import after the existing imports (after line 3):

```tsx
import { SubscriptionPlansView } from './SubscriptionPlansView';
```

- [ ] **Step 2: Update `renderContent()` to handle the subscription tab**

Find the `renderContent` function in `SaaSDashboard.tsx`. Currently it reads:

```tsx
  const renderContent = () => {
    if (activeTab !== 'dashboard') {
      return (
        <div className="bg-white border border-[#e8e2d8] p-12 text-center rounded">
```

Replace the function body so the `'subscription'` tab returns `<SubscriptionPlansView />` before falling through to the generic placeholder:

```tsx
  const renderContent = () => {
    if (activeTab === 'subscription') {
      return <SubscriptionPlansView />;
    }

    if (activeTab !== 'dashboard') {
      return (
        <div className="bg-white border border-[#e8e2d8] p-12 text-center rounded">
          <span className="material-symbols-outlined text-[#d51f2c] text-6xl">
            {activeTab === 'companies' && 'corporate_fare'}
            {activeTab === 'merchants' && 'store'}
            {activeTab === 'users' && 'group'}
            {activeTab === 'reports' && 'description'}
          </span>
          <h2 className="text-h2 font-black text-[#222222] mt-4 uppercase">
            {activeTab === 'companies' && 'Companies Registry'}
            {activeTab === 'merchants' && 'Merchants Registry'}
            {activeTab === 'users' && 'Platform Users'}
            {activeTab === 'reports' && 'System Reports'}
          </h2>
          <p className="text-body-md text-[#666666] mt-2 max-w-md mx-auto">
            Esta sección virtual simula la ruta SPA para{' '}
            <strong className="text-[#d51f2c]">/{activeTab}</strong>. Toda la navegación se
            realiza reactivamente sin recargas de página físicas.
          </p>
          <button
            onClick={() => setActiveTab('dashboard')}
            className="mt-6 px-4 py-2 bg-[#222222] text-white font-bold text-label-caps hover:bg-[#d51f2c] transition-all"
          >
            Volver al Dashboard
          </button>
        </div>
      );
    }

    return (
      <SaasOverviewContent
        refreshTrigger={refreshTrigger}
        onNavigateToView={handleNavigateView}
      />
    );
  };
```

- [ ] **Step 3: Update the sidebar label for the subscription nav item**

In `SaaSDashboard.tsx`, find the nav items array (around line 134):

```tsx
{ id: 'subscription', label: 'Subscription System' },
```

Change `'Subscription System'` to `'Subscription Plans'`:

```tsx
{ id: 'subscription', label: 'Subscription Plans' },
```

- [ ] **Step 4: Run the full test suite — expect all PASS**

```bash
npm run test
```

Expected output: all tests pass (no failures across the entire suite)

- [ ] **Step 5: Commit**

```bash
git add src/components/SaaSDashboard/SaaSDashboard.tsx
git commit -m "feat: mount SubscriptionPlansView in SaaSDashboard for subscription tab"
```

---

## Self-Review Checklist

**Spec coverage:**
- AC1 (platform shell): Task 6 wires the view into the existing shell ✓
- AC2 (SUBSCRIPTION MASTER PLANS dark header): Task 3 renders it ✓
- AC3-name (bold name + monospace id): Task 3 renders `<p>` + `<code>` ✓
- AC3-desc (muted description): Task 3 renders description ✓
- AC3-price (currency format + billingCycle label): Task 3 renders `formatPrice` + `/ {billingCycle}` ✓
- AC3-status (color badge): Task 3 renders conditional badge ✓
- AC4 (empty state when no data): Task 5 ✓
- AC5/filter (distinct filter strip above table): Task 4 ✓
- AC6/filter (substring search on name + description): Task 4 ✓
- AC7/filter (billing cycle dropdown from data): Task 4 (`uniqueBillingCycles` useMemo) ✓
- AC8/filter (status dropdown): Task 4 ✓
- AC9/filter (warning row when filters yield zero): Task 4 ✓

**Type consistency:**
- `SubscriptionPlan` defined in Task 1, used identically in Tasks 2, 3, 4, 5 ✓
- `saasService.getSubscriptionPlans()` added in Task 2, mocked with same signature in Task 3 ✓
- `clearFilters` defined in Task 4, referenced by `Clear filters` button in same task ✓
- `formatPrice` defined in Task 3, kept in Task 4 rewrite ✓
- `data-testid="filter-billing-cycle"` set in Task 4 component, referenced by same id in Task 4 tests ✓
- `data-testid="filter-status"` set in Task 4 component, referenced by same id in Task 4 tests ✓
