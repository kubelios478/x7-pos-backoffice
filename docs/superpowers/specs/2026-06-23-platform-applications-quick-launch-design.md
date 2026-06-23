---
name: platform-applications-quick-launch
description: Quick Launch panel for PlatformApplicationsView — 4 navigation shortcuts at the bottom of the workspace layout
metadata:
  type: project
---

# Quick Launch Panel — Platform Applications View

## Context

`SubscriptionPlansView` already has a Quick Launch panel (lines 481–502) with the required styling. `PlatformApplicationsView` has no equivalent. This spec adds a matching panel to the applications view.

## Scope

Three files change:

| File | Change |
|------|--------|
| `PlatformApplicationsView.tsx` | Add `onNavigate` prop + Quick Launch panel block |
| `SaaSDashboard.tsx` | Pass `onNavigate` to `PlatformApplicationsView`; add `subscription-live-installs` stub |

No new files. No shared component extraction.

---

## 1. PlatformApplicationsView — Props

Add an optional prop to the component interface:

```ts
interface PlatformApplicationsViewProps {
  onNavigate?: (view: string) => void;
}
```

The component signature changes from `React.FC` to `React.FC<PlatformApplicationsViewProps>` with the prop destructured.

---

## 2. Quick Launch Panel — UI Spec

Inserted after the table card and before the FAB `<button>`, inside the main non-empty `return`. The empty-state early return does **not** get the panel (consistent with `SubscriptionPlansView` behavior).

```
┌─────────────────────────────────────────────────────────────────┐  bg-[#2a2a2a]
│  Quick Launch                    [SUBSCRIPTION PLANS] [FEATURE CATALOG INDEX] [ACTIVE LIVE INSTALLS] [EMERGENCY SUPPORT]
│  Navigation shortcuts for                                        │
│  platform management.                                            │
└─────────────────────────────────────────────────────────────────┘
```

### Panel wrapper
```
bg-[#2a2a2a] rounded-xl p-8 flex flex-col md:flex-row justify-between items-center gap-6
```

### Left column
- `h3`: "Quick Launch" — `!text-white font-bold text-base`
- `p`: "Navigation shortcuts for platform management." — `text-white/60 text-sm`

### Right column — button group
`flex flex-wrap gap-3` containing 4 buttons:

| # | Label | Style | Action |
|---|-------|-------|--------|
| 1 | SUBSCRIPTION PLANS | White | `onNavigate?.('subscription')` |
| 2 | FEATURE CATALOG INDEX | White | `onNavigate?.('subscription-features')` |
| 3 | ACTIVE LIVE INSTALLS | White | `onNavigate?.('subscription-live-installs')` |
| 4 | EMERGENCY SUPPORT | Red primary | stub (no-op / alert) |

**White button class** (buttons 1–3):
```
bg-white text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest px-6 py-3
border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-transform
```

**Red primary button class** (button 4):
```
bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest px-6 py-3
rounded hover:bg-[#930015] hover:-translate-y-0.5 transition-all
```

> `hover:-translate-y-0.5` = `translateY(-2px)`. `border-b-4 border-[#ae001a]` = `border-bottom: 4px solid #ae001a`. Both match AC2 exactly.

---

## 3. New Stub — `subscription-live-installs`

In `SaaSDashboard.tsx`, extend the existing `subscription-features / subscription-payments` stub block to include `subscription-live-installs`:

```ts
const subConfig = {
  'subscription-features': { icon: 'featured_play_list', title: 'Feature Catalog Map', desc: '...' },
  'subscription-payments': { icon: 'payments', title: 'Subscription Payments', desc: '...' },
  'subscription-live-installs': {
    icon: 'monitoring',
    title: 'Active Live Installs',
    desc: 'Deployment audit screen — monitor live merchant profiles mapped to individual applications.',
  },
}
```

The type assertion on `activeTab` must include the new key. The "Back" button on the stub navigates to `'subscription-applications'` (back to where the user came from).

---

## 4. Dashboard Wiring

In `SaaSDashboard.tsx`:

1. Pass prop to `PlatformApplicationsView`:
   ```tsx
   <PlatformApplicationsView onNavigate={handleNavigateView} />
   ```

2. Add header title/description for `subscription-live-installs` in the `h1` interpolation and the `p` description block (same pattern as existing sub-tabs).

3. Add breadcrumb entry for `subscription-live-installs` (same pattern as `subscription-applications`):
   ```
   SaaS Admin › Platform Architecture › Live Installs
   ```

---

## 5. What is NOT in scope

- No footer (copyright/links row) added to `PlatformApplicationsView` — AC does not require it.
- No EMERGENCY SUPPORT implementation — stub/no-op is acceptable.
- No extraction of shared `QuickLaunchPanel` component.
- No changes to `SubscriptionPlansView`.

---

## Acceptance Criteria Mapping

| AC | Covered by |
|----|-----------|
| AC1: `#2a2a2a` background | Panel wrapper class |
| AC2: 4 horizontal buttons, `translateY(-2px)` hover, `border-bottom: 4px solid #ae001a` | White button class |
| AC2: SUBSCRIPTION PLANS → subscription model screen | `onNavigate?.('subscription')` |
| AC2: FEATURE CATALOG INDEX → features matrix | `onNavigate?.('subscription-features')` |
| AC2: ACTIVE LIVE INSTALLS → deployment audit | `onNavigate?.('subscription-live-installs')` stub |
| AC2: EMERGENCY SUPPORT → red primary | Red button class |
