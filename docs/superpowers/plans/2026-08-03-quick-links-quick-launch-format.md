# Quick Links → Quick Launch Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert `RuleConfigQuickLinks` (Merchant Rules) and `LedgerQuickLinks` (Financial Engine) from their current plain white nav-bar look to the dark `QuickLaunchPanel` card format already used by 10 other MerchantFrame views, while keeping their "active view" indicator (which `QuickLaunchPanel` doesn't support today).

**Architecture:** Extend the shared `QuickLaunchPanel` component with an `active` flag on `QuickLaunchAction` (renders as non-interactive `aria-current="page"` text instead of a button). `RuleConfigQuickLinks` and `LedgerQuickLinks` become thin wrappers that build a `QuickLaunchAction[]` from their existing anchor lists and render `<QuickLaunchPanel>` inside their own `<nav aria-label="...">`. External props of both wrapper components are unchanged, so none of their 7 consuming views need edits.

**Tech Stack:** React 19 + TypeScript, Vitest + Testing Library (existing conventions, no new dependencies).

## Global Constraints

- Icons are dropped from both quick-links bars — buttons show label text only (per approved spec, decision #4).
- The active (current-view) action renders as solid red (`bg-[#ae001a]`, white text), non-interactive, `aria-current="page"` — not a `<button>` (decision #5, and matches today's existing non-clickable-active behavior).
- No `danger`/emergency action is added to either bar (decision #6).
- `QuickLaunchPanel`'s other 10 existing consumers (Merchant Directory, Company Profile, Suppliers, products-inventory views) must render identically — `active` defaults to falsy and is never passed by them.
- `RuleConfigQuickLinks` keeps its exact external props (`activeRule`, `onNavigate`); `LedgerQuickLinks` keeps its exact external props (`current` defaulting to `'ledger-accounts'`, `onNavigate`).
- Title/description text is fixed per family, not per individual view:
  - Merchant Rules: title `"Rule Configuration Shortcuts"`, description `"Pivot across Tax, Payroll, Overtime, and Tips rule modules without leaving merchant configuration context."`
  - Financial Engine: title `"Accounting Workspace Shortcuts"`, description `"Pivot across the Chart of Accounts, Journal Entries, and posting line items without leaving the financial engine context."`

Full design context: `docs/superpowers/specs/2026-08-03-quick-links-quick-launch-format-design.md`

---

### Task 1: Add `active` support to `QuickLaunchPanel`

**Files:**
- Modify: `src/components/MerchantFrame/shared/QuickLaunchPanel.tsx`
- Test: `src/components/MerchantFrame/shared/QuickLaunchPanel.test.tsx`

**Interfaces:**
- Consumes: nothing new (this is the base component).
- Produces: `QuickLaunchAction.active?: boolean`. When `true`, `QuickLaunchPanel` renders that action as a non-interactive `<span aria-current="page">` styled `bg-[#ae001a] text-white`, ignoring `variant` and never calling `onClick`. This is what Task 2 and Task 3 rely on.

- [x] **Step 1: Write the failing tests**

Add to the end of `src/components/MerchantFrame/shared/QuickLaunchPanel.test.tsx` (inside the existing `describe('QuickLaunchPanel', ...)` block, after the existing two `it(...)` blocks):

```tsx
  it('renders an active action as non-interactive text with aria-current, not a button', () => {
    const onActive = vi.fn();
    const onOther = vi.fn();

    render(
      <QuickLaunchPanel
        description="Test shortcuts."
        actions={[
          { id: 'current', label: 'CURRENT VIEW', onClick: onActive, active: true },
          { id: 'other', label: 'OTHER VIEW', onClick: onOther },
        ]}
      />,
    );

    const activeAnchor = screen.getByText('CURRENT VIEW');
    expect(activeAnchor).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: /current view/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /other view/i })).toBeInTheDocument();
  });

  it('does not fire onClick for an active action even when clicked', async () => {
    const user = userEvent.setup();
    const onActive = vi.fn();

    render(
      <QuickLaunchPanel
        description="Test shortcuts."
        actions={[{ label: 'CURRENT VIEW', onClick: onActive, active: true }]}
      />,
    );

    await user.click(screen.getByText('CURRENT VIEW'));
    expect(onActive).not.toHaveBeenCalled();
  });
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/components/MerchantFrame/shared/QuickLaunchPanel.test.tsx`
Expected: the two new tests FAIL (`active` is not a recognized prop yet, so both actions render as plain buttons — `queryByRole('button', { name: /current view/i })` finds one instead of `null`, and `toHaveAttribute('aria-current', 'page')` fails since no such attribute exists).

- [x] **Step 3: Implement `active` support**

Replace the full contents of `src/components/MerchantFrame/shared/QuickLaunchPanel.tsx` with:

```tsx
import React from 'react';

export type QuickLaunchAction = {
  id?: string;
  label: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
  active?: boolean;
};

type QuickLaunchPanelProps = {
  title?: string;
  description: string;
  actions: QuickLaunchAction[];
  className?: string;
};

export const QuickLaunchPanel: React.FC<QuickLaunchPanelProps> = ({
  title = 'Quick Launch',
  description,
  actions,
  className = '',
}) => {
  return (
    <div
      className={`bg-[#2a2a2a] rounded-xl p-8 flex flex-col md:flex-row justify-between items-center gap-6 ${className}`.trim()}
    >
      <div className="text-center md:text-left">
        <h3 className="!text-white font-bold text-lg">{title}</h3>
        <p className="text-white/60 text-body-sm mt-1 max-w-md">{description}</p>
      </div>

      <div className="flex flex-wrap justify-center md:justify-end gap-3">
        {actions.map((action) => {
          if (action.active) {
            return (
              <span
                key={action.id ?? action.label}
                aria-current="page"
                className="px-6 py-3 bg-[#ae001a] text-white font-bold text-label-caps cursor-default"
              >
                {action.label}
              </span>
            );
          }

          const isDanger = action.variant === 'danger';

          return (
            <button
              key={action.id ?? action.label}
              type="button"
              onClick={action.onClick}
              className={
                isDanger
                  ? 'px-6 py-3 bg-[#ae001a] text-white font-bold text-label-caps hover:bg-[#930015] hover:-translate-y-0.5 transition-all rounded'
                  : 'quick-launch-btn px-6 py-3 bg-white text-[#1d1c17] font-bold text-label-caps border-b-4 border-[#ae001a] hover:-translate-y-0.5 transition-all'
              }
            >
              {action.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/components/MerchantFrame/shared/QuickLaunchPanel.test.tsx`
Expected: all 4 tests PASS (the 2 pre-existing plus the 2 new ones).

- [x] **Step 5: Commit**

```bash
git add src/components/MerchantFrame/shared/QuickLaunchPanel.tsx src/components/MerchantFrame/shared/QuickLaunchPanel.test.tsx
git commit -m "feat(shared): add active state support to QuickLaunchPanel"
```

---

### Task 2: Convert `RuleConfigQuickLinks` to the Quick Launch format

**Files:**
- Modify: `src/components/MerchantFrame/views/RuleConfigQuickLinks.tsx`
- Modify: `src/components/MerchantFrame/views/TaxRulesView.test.tsx:605-619` (add one test)

**Interfaces:**
- Consumes: `QuickLaunchPanel` and `QuickLaunchAction` from Task 1 (`src/components/MerchantFrame/shared/QuickLaunchPanel.tsx`).
- Produces: `RuleConfigQuickLinks` keeps its existing exported signature — `React.FC<{ activeRule: 'tax' | 'payroll' | 'overtime' | 'tips'; onNavigate?: (view: string) => void }>` — so `TaxRulesView.tsx`, `PayrollRulesView.tsx`, `OvertimeRulesView.tsx`, and the Tips view do not need any changes.

- [x] **Step 1: Write the failing test**

In `src/components/MerchantFrame/views/TaxRulesView.test.tsx`, inside the `describe('TaxRulesView — cross-configuration quick links', ...)` block, add this test right after the existing `it('renders all four shortcut anchors', ...)` test (around line 619):

```tsx
  it('renders the Quick Launch panel title and description', async () => {
    render(<TaxRulesView />);
    await screen.findByText('State Sales Tax');

    const nav = screen.getByRole('navigation', { name: /related configuration shortcuts/i });
    expect(within(nav).getByText('Rule Configuration Shortcuts')).toBeInTheDocument();
    expect(
      within(nav).getByText(
        'Pivot across Tax, Payroll, Overtime, and Tips rule modules without leaving merchant configuration context.',
      ),
    ).toBeInTheDocument();
  });
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/MerchantFrame/views/TaxRulesView.test.tsx -t "Quick Launch panel"`
Expected: FAIL — the current `RuleConfigQuickLinks` renders neither "Rule Configuration Shortcuts" nor the description text.

- [x] **Step 3: Rewrite `RuleConfigQuickLinks.tsx`**

Replace the full contents of `src/components/MerchantFrame/views/RuleConfigQuickLinks.tsx` with:

```tsx
import React from 'react';
import { QuickLaunchPanel, type QuickLaunchAction } from '../shared/QuickLaunchPanel';

interface RuleConfigQuickLinksProps {
  activeRule: 'tax' | 'payroll' | 'overtime' | 'tips';
  onNavigate?: (view: string) => void;
}

const RULE_CONFIG_ANCHORS: Array<{
  key: 'tax' | 'payroll' | 'overtime' | 'tips';
  label: string;
  featureId: string;
}> = [
  { key: 'tax', label: 'TAX RULES', featureId: 'merchant-tax-rules' },
  { key: 'payroll', label: 'PAYROLL RULES', featureId: 'merchant-payroll-rules' },
  { key: 'overtime', label: 'OVERTIME RULES', featureId: 'merchant-overtime-rules' },
  { key: 'tips', label: 'TIPS MANAGEMENT', featureId: 'merchant-tips-rules' },
];

export const RuleConfigQuickLinks: React.FC<RuleConfigQuickLinksProps> = ({ activeRule, onNavigate }) => {
  const actions: QuickLaunchAction[] = RULE_CONFIG_ANCHORS.map((anchor) => ({
    id: anchor.key,
    label: anchor.label,
    active: anchor.key === activeRule,
    onClick: () => onNavigate?.(anchor.featureId),
  }));

  return (
    <nav aria-label="Related configuration shortcuts">
      <QuickLaunchPanel
        title="Rule Configuration Shortcuts"
        description="Pivot across Tax, Payroll, Overtime, and Tips rule modules without leaving merchant configuration context."
        actions={actions}
      />
    </nav>
  );
};

export default RuleConfigQuickLinks;
```

- [x] **Step 4: Run the affected test suites to verify everything passes**

Run: `npx vitest run src/components/MerchantFrame/views/TaxRulesView.test.tsx src/components/MerchantFrame/views/PayrollRulesView.test.tsx src/components/MerchantFrame/views/TipRulesView.test.tsx src/components/MerchantFrame/views/OvertimeRulesView.test.tsx`
Expected: all tests PASS, including the new one from Step 1 and every pre-existing quick-links test (anchor labels, active-anchor-not-a-button, `onNavigate` calls with the right feature id). None of these pre-existing tests assert on icons, so none should need edits — if any unexpectedly fail, read the failure output before changing test code; don't assume the test is wrong.

- [x] **Step 5: Commit**

```bash
git add src/components/MerchantFrame/views/RuleConfigQuickLinks.tsx src/components/MerchantFrame/views/TaxRulesView.test.tsx
git commit -m "feat(merchant-rules): convert RuleConfigQuickLinks to Quick Launch format"
```

---

### Task 3: Convert `LedgerQuickLinks` to the Quick Launch format

**Files:**
- Modify: `src/components/MerchantFrame/views/financial-engine/LedgerQuickLinks.tsx`
- Modify: `src/components/MerchantFrame/views/financial-engine/LedgerAccountsView.test.tsx:573-587`

**Interfaces:**
- Consumes: `QuickLaunchPanel` and `QuickLaunchAction` from Task 1.
- Produces: `LedgerQuickLinks` keeps its existing exported signature — `React.FC<{ current?: string; onNavigate?: (view: string) => void }>`, default `current = 'ledger-accounts'` — so `LedgerAccountsView.tsx`, `JournalEntriesView.tsx`, and `JournalEntryLinesView.tsx` do not need any changes.

- [x] **Step 1: Write the failing test (replace the icon-asserting test)**

In `src/components/MerchantFrame/views/financial-engine/LedgerAccountsView.test.tsx`, replace this existing test (lines 573-587):

```tsx
  it('renders all four accounting shortcut anchors with their labels and icons', async () => {
    mockFetchOnce([cashAccount]);
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');

    const nav = screen.getByRole('navigation', { name: /related accounting shortcuts/i });
    expect(within(nav).getByText('CHART OF ACCOUNTS')).toBeInTheDocument();
    expect(within(nav).getByText('JOURNAL ENTRIES')).toBeInTheDocument();
    expect(within(nav).getByText('JOURNAL LINE ITEMS')).toBeInTheDocument();
    expect(within(nav).getByText('TAX RULES CONFIGURATION')).toBeInTheDocument();
    expect(within(nav).getByText('account_balance')).toBeInTheDocument();
    expect(within(nav).getByText('menu_book')).toBeInTheDocument();
    expect(within(nav).getByText('receipt')).toBeInTheDocument();
    expect(within(nav).getByText('percent')).toBeInTheDocument();
  });
```

with:

```tsx
  it('renders all four accounting shortcut anchors with the panel title and description', async () => {
    mockFetchOnce([cashAccount]);
    render(<LedgerAccountsView />);
    await screen.findByText('Cash');

    const nav = screen.getByRole('navigation', { name: /related accounting shortcuts/i });
    expect(within(nav).getByText('CHART OF ACCOUNTS')).toBeInTheDocument();
    expect(within(nav).getByText('JOURNAL ENTRIES')).toBeInTheDocument();
    expect(within(nav).getByText('JOURNAL LINE ITEMS')).toBeInTheDocument();
    expect(within(nav).getByText('TAX RULES CONFIGURATION')).toBeInTheDocument();
    expect(within(nav).getByText('Accounting Workspace Shortcuts')).toBeInTheDocument();
    expect(
      within(nav).getByText(
        'Pivot across the Chart of Accounts, Journal Entries, and posting line items without leaving the financial engine context.',
      ),
    ).toBeInTheDocument();
  });
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/components/MerchantFrame/views/financial-engine/LedgerAccountsView.test.tsx -t "panel title and description"`
Expected: FAIL — the current `LedgerQuickLinks` renders neither "Accounting Workspace Shortcuts" nor the description text (and the old icon-ligature assertions are gone, so that part is moot).

- [x] **Step 3: Rewrite `LedgerQuickLinks.tsx`**

Replace the full contents of `src/components/MerchantFrame/views/financial-engine/LedgerQuickLinks.tsx` with:

```tsx
import React from 'react';
import { QuickLaunchPanel, type QuickLaunchAction } from '../../shared/QuickLaunchPanel';

interface LedgerQuickLinksProps {
  current?: string;
  onNavigate?: (view: string) => void;
}

interface LedgerQuickLinkAnchor {
  key: string;
  label: string;
  target: string;
}

const LEDGER_QUICK_LINKS: LedgerQuickLinkAnchor[] = [
  { key: 'chart-of-accounts', label: 'CHART OF ACCOUNTS', target: 'ledger-accounts' },
  { key: 'journal-entries', label: 'JOURNAL ENTRIES', target: 'journal-entries' },
  { key: 'journal-line-items', label: 'JOURNAL LINE ITEMS', target: 'journal-entries-lines' },
  { key: 'tax-rules', label: 'TAX RULES CONFIGURATION', target: 'merchant-tax-rules' },
];

export const LedgerQuickLinks: React.FC<LedgerQuickLinksProps> = ({
  current = 'ledger-accounts',
  onNavigate,
}) => {
  const actions: QuickLaunchAction[] = LEDGER_QUICK_LINKS.map((anchor) => ({
    id: anchor.key,
    label: anchor.label,
    active: anchor.target === current,
    onClick: () => onNavigate?.(anchor.target),
  }));

  return (
    <nav aria-label="Related accounting shortcuts">
      <QuickLaunchPanel
        title="Accounting Workspace Shortcuts"
        description="Pivot across the Chart of Accounts, Journal Entries, and posting line items without leaving the financial engine context."
        actions={actions}
      />
    </nav>
  );
};

export default LedgerQuickLinks;
```

- [x] **Step 4: Run the affected test suites to verify everything passes**

Run: `npx vitest run src/components/MerchantFrame/views/financial-engine/LedgerAccountsView.test.tsx src/components/MerchantFrame/views/financial-engine/JournalEntriesView.test.tsx src/components/MerchantFrame/views/financial-engine/JournalEntryLinesView.test.tsx`
Expected: all tests PASS, including the rewritten one from Step 1. `JournalEntriesView.test.tsx` and `JournalEntryLinesView.test.tsx` don't assert on icons today, so they should pass unmodified — if any unexpectedly fail, read the failure output before changing test code.

- [x] **Step 5: Commit**

```bash
git add src/components/MerchantFrame/views/financial-engine/LedgerQuickLinks.tsx src/components/MerchantFrame/views/financial-engine/LedgerAccountsView.test.tsx
git commit -m "feat(financial-engine): convert LedgerQuickLinks to Quick Launch format"
```

---

### Task 4: Full regression check

**Files:** none (verification only).

**Interfaces:**
- Consumes: the completed Task 1, 2, and 3 changes.
- Produces: nothing new — this is the final gate before calling the plan done.

- [x] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS, 0 failures. If any test outside the files touched in Tasks 1-3 fails, investigate before proceeding — do not assume it's unrelated flakiness without checking (see `reference-backend-known-test-failures`-style precedent: only pre-existing, already-documented flaky failures are acceptable to ignore, and only after confirming they're unrelated to this change).

- [x] **Step 2: Run the real TypeScript build check**

Run: `npx tsc --build --noEmit --force`

(Plain `tsc --noEmit` is a no-op in this repo due to project-reference caching — this exact command is the one that actually re-checks types.)

Expected: no output, exit code 0.

- [x] **Step 3: Manual visual smoke check**

Start the dev server (`npm run dev`) and open each of the 7 affected views (Tax/Payroll/Overtime/Tips Rules, Ledger Accounts/Journal Entries/Journal Entry Lines) in a real browser. Confirm: the panel renders as a dark card with title/description/buttons, the current view's button is solid red and not clickable, the other buttons navigate correctly, and nothing overlaps/wraps oddly at typical viewport widths. No subagent in this pipeline has browser access — this step is for the user to confirm, matching this project's established practice of not claiming a UI change "done" without a real-browser check.

- [x] **Step 4: Report status**

No commit for this task (verification only). If Steps 1-2 are clean and Step 3 is confirmed, the plan is complete.
