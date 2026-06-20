# Subscription Plans View — Design Spec
**Date:** 2026-06-17
**Author:** Rafael Cordero
**Status:** Approved

---

## 1. Overview

A read-only data grid view for SaaS Owner / Platform Super Administrators to browse, search, and filter all subscription tiers configured in the platform. The view surfaces plan pricing models, billing frequencies, and operational statuses at a glance.

This spec consolidates two user stories:
- **US-1:** View structured table of all subscription plans
- **US-2:** Search and filter plans by keyword, billing cycle, and status

---

## 2. User Stories

### US-1 — Subscription Master Plans Table
> As a SaaS Owner / Platform Super Administrator, I want to view a structured data table containing all subscription tiers configured in the system, so that I can track active pricing models, billing frequencies, and overarching plan tiers at a glance.

### US-2 — Search & Filter
> As a SaaS Owner, I want to run keyword queries and filter plans by billing cycles and operational statuses, so that I can instantly manage specific enterprise pricing models without reviewing the entire catalog.

---

## 3. Acceptance Criteria

| # | Criteria |
|---|----------|
| AC1 | Renders the platform shell: dark sidebar nav, top breadcrumb header (`SaaS Admin > Subscription Architecture`), and global footer |
| AC2 | Content area features a data grid card labeled **SUBSCRIPTION MASTER PLANS** with dark `#222222` structural title block |
| AC3-name | Displays `name` as bold primary text and `id` as a monospace `<code>` element |
| AC3-desc | Renders `description` as smaller muted secondary text beneath the name |
| AC3-price | Displays `price` formatted as currency (e.g., `$49.99`) alongside mapped `billingCycle` label (e.g., `/ monthly`) |
| AC3-status | Displays color badge per `status` string: green for `"active"`, grey for `"inactive"` |
| AC4 | If service returns zero records, hides the table and shows a centered empty-state panel with the message: *"No subscription plans have been provisioned yet. Click 'Add Plan' to initialize your platform's monetization model."* |
| AC5 (filter) | Distinct filter control strip rendered as a separate card directly above the table grid |
| AC6 (filter) | Search input performs case-insensitive substring match against `name` AND `description` |
| AC7 (filter) | "Billing Cycle" dropdown populated with unique `billingCycle` values from the data, plus an "All Cycles" default |
| AC8 (filter) | "Plan Status" dropdown with explicit tokens: `All Status`, `active`, `inactive` |
| AC9 (filter) | If combined filters yield zero results, the table body shows a single warning row: *"No subscription profiles match your search filters"* |

---

## 4. Architecture

### 4.1 Approach
New view component mounted inside the existing `SaaSDashboard`, following the established pattern of `ProductCategoriesView` inside `RestaurantDashboard`. No new route.

### 4.2 Files

| File | Change | Purpose |
|------|--------|---------|
| `src/types/subscription.ts` | **New** | `SubscriptionPlan` interface |
| `src/services/saasService.ts` | **Modified** | Add `getSubscriptionPlans()` mock function |
| `src/components/SaaSDashboard/SubscriptionPlansView.tsx` | **New** | Main view component |
| `src/components/SaaSDashboard/SaaSDashboard.tsx` | **Modified** | Mount `SubscriptionPlansView` as a navigable view |

### 4.3 Component Tree

```
SaaSDashboard
└── SubscriptionPlansView
    ├── FilterStrip (inline JSX — search input + 2 selects + ADD PLAN button)
    ├── PlanTable (inline JSX — header + tbody)
    │   ├── PlanRow × N
    │   └── EmptyFilterRow (when filtered results = 0)
    └── EmptyState (when raw data = 0)
```

No sub-components extracted — the view is simple enough to keep in one file. If it grows beyond ~300 lines, extract at that point.

---

## 5. Data Model

```typescript
// src/types/subscription.ts
export interface SubscriptionPlan {
  id: string;           // internal identifier, e.g. "plan_starter_001"
  name: string;         // display name, e.g. "Starter"
  description: string;  // free-text description
  price: number;        // numeric value, e.g. 49.99
  billingCycle: string; // "monthly" | "annual" | "one-time"
  status: string;       // "active" | "inactive"
}
```

### 5.1 Mock Data (saasService.ts)

Four plans covering all states and billing cycles:

| name | id | price | billingCycle | status |
|------|----|-------|--------------|--------|
| Starter | plan_starter_001 | 49.99 | monthly | active |
| Professional | plan_pro_002 | 129.99 | monthly | active |
| Enterprise | plan_ent_003 | 1199.99 | annual | active |
| Legacy Basic | plan_legacy_000 | 19.99 | monthly | inactive |

`getSubscriptionPlans()` returns a `Promise<SubscriptionPlan[]>` with a simulated 600ms delay, consistent with existing mock patterns in `saasService.ts`.

---

## 6. Filter Logic

All three filters combine with **AND** logic. Filtering happens in a `useMemo` on every render — no debounce, immediate reactivity.

```
filtered = plans
  .filter(p => searchTerm === "" || 
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.description.toLowerCase().includes(searchTerm.toLowerCase()))
  .filter(p => billingCycle === "All Cycles" || p.billingCycle === billingCycle)
  .filter(p => status === "All Status" || p.status === status)
```

**Dropdown options:**
- Billing Cycle: `["All Cycles", ...new Set(plans.map(p => p.billingCycle))]`
- Status: `["All Status", "active", "inactive"]` (static — finite domain)

---

## 7. Visual Design

Follows the established platform design language from `ProductCategoriesView` and the `Product Category.html` reference mockup.

### 7.1 Layout (top-to-bottom)
1. **Filter strip card** — white card, `border-border-subtle`, `rounded-xl`, contains search + 2 selects + ADD PLAN button
2. **Table card** — no border-radius on outer card (matches Product Categories pattern), dark `#222222` header bar labeled `SUBSCRIPTION MASTER PLANS`
3. **Quick Launch footer** — dark `#2a2a2a` panel with action buttons
4. **Global footer** — copyright + links
5. **FAB** — red `+` button, bottom-right, tooltip "New Plan"

### 7.2 Table Columns

| Column | Alignment | Content |
|--------|-----------|---------|
| Plan Name & ID | Left | Bold name + monospace `<code>` id below, red left-border accent for active; grey for inactive |
| Description | Left | `text-body-sm text-text-muted`, truncated to 2 lines |
| Pricing & Cadence | Center | Large bold price + small billing cycle pill below |
| Status | Center | Color badge: `active` → green, `inactive` → grey |
| Actions | Right | Edit + Delete icons, `opacity-40` at rest → `opacity-100` on row hover |

### 7.3 Status Badges

| Status value | Background | Text color |
|---|---|---|
| `active` | `bg-success/10` | `text-success` (`#10b981`) |
| `inactive` | `bg-text-muted/20` | `text-text-muted` |

### 7.4 Empty States

**No data (service returns []):**
Centered panel, replaces table entirely:
- Icon: `inventory_2` (Material Symbols, large, muted)
- Heading: "No Plans Configured"
- Body: "No subscription plans have been provisioned yet. Click 'Add Plan' to initialize your platform's monetization model."
- CTA button: `ADD PLAN` (primary red)

**No filter results:**
Single `<tr>` spanning all columns inside `<tbody>`:
- Warning icon + text: "No subscription profiles match your search filters"
- Secondary action: "Clear filters" link that resets all filter state

---

## 8. State Management

All state is local to `SubscriptionPlansView`. No global store needed.

```typescript
const [plans, setPlans] = useState<SubscriptionPlan[]>([])
const [loading, setLoading] = useState(true)
const [searchTerm, setSearchTerm] = useState("")
const [billingCycle, setBillingCycle] = useState("All Cycles")
const [status, setStatus] = useState("All Status")

const filtered = useMemo(() => /* filter logic */, [plans, searchTerm, billingCycle, status])
```

On mount: `useEffect` calls `getSubscriptionPlans()`, sets `plans` on resolve, sets `loading` to false.

Loading state: the table body shows 3 skeleton rows (grey animated placeholder lines) while the promise resolves.

---

## 9. Navigation Integration

`SaaSDashboard.tsx` already has `activeTab` state and a `'subscription'` nav item in the sidebar (currently renders a generic placeholder "Subscription System" block). The integration requires:

1. In `renderContent()`, add a branch before the generic placeholder block: `if (activeTab === 'subscription') return <SubscriptionPlansView />;`
2. No new nav item or state needed — the existing `'subscription'` tab drives the view.
3. The breadcrumb (`SaaS Admin > Subscription Architecture`) and page title live **inside** `SubscriptionPlansView`, rendered in the content area below the shared `<h1>` that SaaSDashboard already manages.
4. The sidebar label for the `'subscription'` item can be updated from "Subscription System" to "Subscription Plans" as part of this change.

---

## 10. Out of Scope

- Create / Edit / Delete plan functionality (ADD PLAN button is rendered but non-functional — placeholder for future user story)
- Pagination (4 mock records do not require it)
- Sorting by column
- Export functionality (Quick Launch buttons are rendered but non-functional)
- Real API integration (mock data only)
