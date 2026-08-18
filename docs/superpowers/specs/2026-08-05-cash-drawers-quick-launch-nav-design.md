# Cash Drawers — Quick Launch Navigation Bar — Design

**Date:** 2026-08-05
**Branch:** rafaalejandro_subscription
**Area:** MerchantFrame / Restaurant Operations (Cash Drawer Management)

## Context

User story: as a Merchant Administrator or Shift Manager, I want a persistent shortcuts bar in
the Cash Drawer workspace so I can jump to the 5 sub-modules of Cash Drawer Management (Cash
Drawers, Cash Shifts, Cash Transactions, Drawer History, Drawer Movements) without losing the
workspace frame.

This app has no per-feature URL routing — `MerchantFrame.tsx` holds an `activeTab` string and
swaps view components in an if-chain; navigation between features is `onNavigate?.(view) =>
setActiveTab(view)`, not a router push. The ticket's `/cash-management/*` paths are business
language for these five modules, not literal routes.

Backend check (confirms scope): `cash-drawers`, `cash-shifts`, `cash-transactions`, and
`cash-drawer-history` all have real, registered `GET` list endpoints
(`x7-pos-back-end/src/restaurant-operations/cashdrawer/**`, wired into `CashdrawerModule` →
`RestaurantOperationsModule` → `AppModule`). `cash-movements` has **no standalone list endpoint** —
its controller (`@Controller('cash-shifts')`) only exposes `POST/GET :shiftId/expenses` and `POST
:shiftId/inflows`, nested under a shift. There is currently no frontend view for any of the four
sibling modules (`src/components/MerchantFrame/views/restaurant-operations/` only has
`CashDrawersView.tsx`).

**Confirmed with user:** this story is the navigation bar only. Building the four sibling views
(Cash Shifts, Cash Transactions, Drawer History, Drawer Movements) is out of scope and will be
separate future stories.

This app already has an established "Quick Launch" navigation pattern for jumping between sibling
views within a feature family, documented in
[2026-08-03-quick-links-quick-launch-format-design.md](2026-08-03-quick-links-quick-launch-format-design.md):
a thin per-family wrapper (`RuleConfigQuickLinks.tsx`, `LedgerQuickLinks.tsx`) around the shared
`QuickLaunchPanel.tsx`, with the current view rendered as a non-clickable solid-red
`aria-current="page"` block. This design reuses that exact pattern for Cash Drawer Management — no
changes to `QuickLaunchPanel.tsx` are needed, since it already supports `active`.

## Scope decisions (confirmed with user)

1. Only the navigation bar is built now — not the four target views themselves.
2. Bar sits in-flow at the end of `CashDrawersView`'s content, same as every other Quick Launch
   bar in this codebase (`RuleConfigQuickLinks`, `LedgerQuickLinks`, `SubscriptionPlansView`).
   There is no `position: fixed`/`sticky` convention anywhere in this app outside the FAB pattern;
   this design does not introduce one.
3. Active-anchor styling matches the existing Quick Launch format exactly: solid red
   (`bg-[#ae001a]`, white bold text) non-interactive block. No additional underline is added, even
   though the ticket's prose mentions one — the ticket also says "es el formato de Quick Launch,"
   and that format (already used across 3 other feature families) doesn't have an underline.
4. No icons on the bar's buttons — matches the 2026-08-03 decision to drop icons from this pattern
   (label text only).
5. Clicking a sibling link that has no real view yet must not break the workspace frame (AC:
   "Navigational Pipeline Responsiveness"). `MerchantFrame.tsx` already has a generic "Feature
   Coming Soon" stub renderer (currently used for `privacy-policy` / `terms-of-service` /
   `help-center`); this design generalizes it to also cover the four cash-management sibling ids
   instead of building throwaway placeholder view components.

## Component Changes

### `CashManagementQuickLinks.tsx` (new) — `src/components/MerchantFrame/views/restaurant-operations/`

Same shape as `RuleConfigQuickLinks.tsx`: thin wrapper around `QuickLaunchPanel`.

```ts
interface CashManagementQuickLinksProps {
  activeModule: 'cash-drawers' | 'cash-shifts' | 'cash-transactions' | 'cash-drawer-history' | 'cash-movements';
  onNavigate?: (view: string) => void;
}

const CASH_MANAGEMENT_ANCHORS: Array<{ key: CashManagementModule; label: string }> = [
  { key: 'cash-drawers', label: 'CASH DRAWERS' },
  { key: 'cash-shifts', label: 'CASH SHIFTS' },
  { key: 'cash-transactions', label: 'CASH TRANSACTIONS' },
  { key: 'cash-drawer-history', label: 'DRAWER HISTORY' },
  { key: 'cash-movements', label: 'DRAWER MOVEMENTS' },
];
```

- `key` values double as the `activeTab` id passed to `onNavigate`, matching the ids already
  registered in `public/Features.txt` for the two that exist there (`cash-drawer-history`,
  `cash-transactions`) — no new naming scheme invented.
- Title: **"Cash Management Shortcuts"**
- Description: *"Pivot across Cash Drawers, Shifts, Transactions, History, and Movements without
  leaving the cash management workspace context."*
- Wrapped in `<nav aria-label="Related cash management shortcuts">`, matching sibling wrappers.

### `CashDrawersView.tsx` — add `onNavigate` prop

- Add `interface CashDrawersViewProps { onNavigate?: (view: string) => void }`, default export
  signature becomes `React.FC<CashDrawersViewProps>`.
- Render `<CashManagementQuickLinks activeModule="cash-drawers" onNavigate={onNavigate} />` as the
  last element of the existing root `<div className="flex flex-col gap-6 ...">`, after the
  existing modals/toast block — same position convention as `TaxRulesView`'s
  `<RuleConfigQuickLinks .../>`.

### `MerchantFrame.tsx`

- Pass `onNavigate={(view) => setActiveTab(view)}` to `CashDrawersView` (line ~492), matching the
  existing `TaxRulesView`/`PayrollRulesView` call sites.
- Generalize the "Feature Coming Soon" stub block (currently `if (activeTab === 'privacy-policy'
  || ... )`) into a small lookup table keyed by `activeTab`, adding four entries:

  | id | title | icon | provisional route |
  |---|---|---|---|
  | `cash-shifts` | Cash Shifts | `schedule` | `/cash-management/shifts` |
  | `cash-transactions` | Cash Transactions | `payments` | `/cash-management/transactions` |
  | `cash-drawer-history` | Drawer History | `history` | `/cash-management/history` |
  | `cash-movements` | Drawer Movements | `moving` | `/cash-management/movements` |

  The existing three entries (`privacy-policy`, `terms-of-service`, `help-center`) move into the
  same table unchanged (same title/icon/route/copy) — this is a mechanical refactor of an
  already-hardcoded if-chain into data, not a behavior change for those three. The "Volver al
  Dashboard" button and overall markup/copy stay identical for all seven ids.

## Testing Plan

- `CashDrawersView.test.tsx`: new `describe('CashDrawersView — quick links', ...)` block
  (mirrors `PayrollRulesView.test.tsx:347`) asserting the bar renders with "CASH DRAWERS" visible
  and, per the 2026-08-03 convention, that clicking a non-active anchor calls `onNavigate` with the
  right id and the active anchor is non-interactive.
- No dedicated test file for `CashManagementQuickLinks.tsx` itself — matches the established
  convention that neither `RuleConfigQuickLinks` nor `LedgerQuickLinks` has its own test file;
  coverage lives in the consuming view's test file plus the already-tested `QuickLaunchPanel.test.tsx`.
- No test file exists today for `MerchantFrame.tsx`'s stub block (`privacy-policy` /
  `terms-of-service` / `help-center` currently have zero coverage). This design does not add one
  either — the lookup-table refactor is mechanical (same markup/copy, just data-driven), and
  adding the first test file for `MerchantFrame.tsx` is a larger undertaking out of proportion to
  this story. Flagged here for visibility, not silently skipped.

## Out of Scope

- Building `CashShiftsView`, `CashTransactionsView`, `DrawerHistoryView`, `DrawerMovementsView` or
  any real data-backed screen for the four sibling modules.
- Sidebar / `public/Applications.txt` / `public/Features.txt` registration for `cash-shifts` or
  `cash-movements` (they aren't registered today and this story doesn't add them — the quick-launch
  bar calls `onNavigate` directly, independent of the sidebar feature registry).
- Any backend change (none needed — this is presentation-only; the `cash-movements` list-endpoint
  gap is noted for awareness, not addressed here).
- Introducing a `position: fixed`/`sticky` bottom bar convention.
- Changes to `QuickLaunchPanel.tsx` itself (already supports everything this needs).
