# Quick Links → Quick Launch Format — Design

**Date:** 2026-08-03
**Branch:** rafaalejandro_subscription
**Area:** MerchantFrame shared components + Merchant Rules + Financial Engine

## Context

Two feature families each have their own "jump to a sibling view" navigation bar:

- `RuleConfigQuickLinks.tsx` — used by `TaxRulesView`, `PayrollRulesView`, `OvertimeRulesView`,
  `TipRulesView` (Merchant Rules).
- `LedgerQuickLinks.tsx` — used by `LedgerAccountsView`, `JournalEntriesView`,
  `JournalEntryLinesView` (Financial Engine).

Both render the same plain pattern: a white `<nav>` bar, small uppercase text + material-symbols
icon per link, current view shown as a non-clickable underlined `<span aria-current="page">`.

Separately, `QuickLaunchPanel.tsx` (`MerchantFrame/shared/`) is a different, unrelated widget:
a dark card (`bg-[#2a2a2a]`, `rounded-xl`) with a title, description, and a row of white/red
action buttons. It's used in 10 views (Merchant Directory, Company Profile, Suppliers, and all of
products-inventory) to jump to **unrelated** areas of the app (global settings, other dashboards,
staff assignment, support) — never to navigate between siblings of the same feature family.

The user asked why the Merchant Rules / Financial Engine quick links don't look like
`QuickLaunchPanel`. Decision: convert both `RuleConfigQuickLinks` and `LedgerQuickLinks` to the
Quick Launch visual format, while keeping their "active view" indicator (which `QuickLaunchPanel`
doesn't have today).

## Scope decisions (confirmed with user)

1. Applies to **both** families: Merchant Rules (`RuleConfigQuickLinks`) and Financial Engine
   (`LedgerQuickLinks`).
2. The "active view" highlight is **kept**, not dropped — `QuickLaunchPanel` gains an `active`
   concept rather than losing this signal.
3. Title/description text is **fixed per family** (does not vary per individual view within that
   family).
4. Icons are **dropped** — buttons show label text only, matching `QuickLaunchPanel`'s existing
   buttons in its other 10 usages (confirmed via visual companion mockup, option "Sin íconos").
5. The active button renders as **solid red** (`bg-[#ae001a]`, white text) — same accent color
   already used for the `danger` variant elsewhere in `QuickLaunchPanel` (confirmed via visual
   companion mockup, option "A. Sólido rojo"). This is a deliberate accepted trade-off: the user
   was shown the risk that it could visually read as similar to a `danger`/destructive action and
   chose it anyway.
6. No `danger` button is added to either bar — all actions are plain navigation between sibling
   views; `variant: 'danger'` continues to exist only for `QuickLaunchPanel`'s other consumers.

## Component Changes

### `QuickLaunchPanel.tsx` (shared) — extend, don't fork

```ts
export type QuickLaunchAction = {
  id?: string;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
  active?: boolean; // new
};
```

Rendering change: when `action.active` is `true`, render a non-interactive `<span
aria-current="page">` instead of a `<button>` — `onClick` is not wired up, matching today's
behavior where the active anchor in `RuleConfigQuickLinks`/`LedgerQuickLinks` never navigates to
itself. Visual treatment: `bg-[#ae001a] text-white`, same padding/font-weight/uppercase/
letter-spacing as the other buttons, `cursor-default`, no hover-lift transform. `variant` is
ignored when `active` is `true` (active styling takes precedence).

This is the **only** change to `QuickLaunchPanel.tsx`. Its other 10 existing consumers never pass
`active`, so their rendering is unaffected (`active` defaults to falsy).

### `RuleConfigQuickLinks.tsx` — becomes a thin wrapper

Same external props (`activeRule`, `onNavigate`) — no consumer of this component changes. Keeps
its own `<nav aria-label="Related configuration shortcuts">` wrapper around a `<QuickLaunchPanel>`
(preserves the landmark; `QuickLaunchPanel` itself stays a plain `<div>` for its other consumers).
`RULE_CONFIG_ANCHORS` drops the `icon` field (no longer rendered). Each anchor maps to a
`QuickLaunchAction`: `{ label, onClick: () => onNavigate?.(featureId), active: key === activeRule
}`.

- Title: **"Rule Configuration Shortcuts"**
- Description: *"Pivot across Tax, Payroll, Overtime, and Tips rule modules without leaving
  merchant configuration context."*

### `LedgerQuickLinks.tsx` — same treatment

Same external props (`current`, `onNavigate`, default `current = 'ledger-accounts'` unchanged).
Own `<nav aria-label="Related accounting shortcuts">` wrapper around `<QuickLaunchPanel>`.
`LEDGER_QUICK_LINKS` drops the `icon` field.

- Title: **"Accounting Workspace Shortcuts"**
- Description: *"Pivot across the Chart of Accounts, Journal Entries, and posting line items
  without leaving the financial engine context."*

## Testing Plan

- `QuickLaunchPanel.test.tsx`: new cases for `active` — renders a non-interactive element with
  `aria-current="page"`, no `onClick` firing on click/keyboard activation, correct solid-red
  styling class applied; existing tests (non-active buttons, `danger` variant) unchanged.
- `RuleConfigQuickLinks` assertions (embedded in `TaxRulesView.test.tsx`,
  `PayrollRulesView.test.tsx`, `OvertimeRulesView.test.tsx`, and the Tips equivalent): update DOM
  queries from the old `<span aria-current="page">`-in-a-plain-nav pattern to the new
  `QuickLaunchPanel`-rendered structure; assertions on *behavior* (active view not clickable,
  other views call `onNavigate` with the right target) stay the same.
- `LedgerQuickLinks` assertions (embedded in `LedgerAccountsView.test.tsx`,
  `JournalEntriesView.test.tsx`, `JournalEntryLinesView.test.tsx`): same treatment.
- No new test file needed for the two wrapper components themselves beyond what's already
  embedded in their consuming views' test suites (matches existing convention — neither
  `RuleConfigQuickLinks.tsx` nor `LedgerQuickLinks.tsx` has ever had its own dedicated test file).

## Out of Scope

- Any other `QuickLaunchPanel` consumer (Merchant Directory, Company Profile, Suppliers,
  products-inventory views) — untouched, `active` prop unused there.
- Adding a `danger`/emergency action to either quick-links bar.
- Changing where these bars sit within their parent views (same position, only the rendered
  markup inside changes).
- Backend changes (none needed — this is presentation-only).
