# Change Plan Status (Soft Deactivation/Reactivation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the non-functional delete button in the SubscriptionPlansView Actions column with a bidirectional Change Status button that soft-deactivates or reactivates a plan via a confirmation dialog and a PATCH API call.

**Architecture:** A context-sensitive icon button (`block` for active plans, `check_circle` for inactive plans) replaces the delete placeholder. Clicking opens a `ChangeStatusDialog` sub-component that adapts its copy and Confirm button color to the action direction. The handler sends all 5 DTO fields to the existing `saasService.updateSubscriptionPlan`, only flipping the `status` field, then updates the row in-place without a re-fetch.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vitest + React Testing Library, Material Symbols icons

## Global Constraints

- Modal pattern: full-screen overlay `bg-black/50 z-[100]`, white card `shadow-2xl`, dark header `bg-[#222222]`
- Design tokens: accent red `#ae001a`, hover red `#930015`, muted text `#5f5e5e`, border `#e8e2d8`, warm bg `#f2ede5`
- All buttons: `text-[11px] font-bold uppercase tracking-widest`
- Spinner: `material-symbols-outlined` `progress_activity` + `animate-spin`
- Backend `UpdateSubscriptionPlanDto` is non-partial — always send all 5 fields: `name`, `description`, `price`, `billingCycle`, `status`
- Toast reuses existing `setToast` (3-second auto-dismiss already wired)
- Test command: `npx vitest run src/components/SaaSDashboard/SubscriptionPlansView.test.tsx --reporter=verbose`

---

### Task 1: Change Status button + ChangeStatusDialog UI

**Files:**
- Modify: `src/components/SaaSDashboard/SubscriptionPlansView.tsx`
- Modify: `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`

**Interfaces:**
- Produces:
  - State `changingStatusPlan: SubscriptionPlan | null` (controls dialog visibility)
  - State `changeStatusSubmitting: boolean`
  - `ChangeStatusDialog` props: `{ plan: SubscriptionPlan; submitting: boolean; onClose: () => void; onConfirm: () => void }`
  - Row button `aria-label`: `"Deactivate {plan.name}"` for active plans, `"Activate {plan.name}"` for inactive plans

- [ ] **Step 1: Write failing tests for button rendering and dialog content**

Append this `describe` block at the end of `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx` (after the last existing `describe` block, before the end of the file):

```tsx
describe('SubscriptionPlansView — change status button', () => {
  beforeEach(() => {
    vi.mocked(saasService.getSubscriptionPlans).mockResolvedValue(MOCK_PLANS);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders a Deactivate button for each active plan', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());
    const deactivateButtons = screen.getAllByRole('button', { name: /^Deactivate /i });
    expect(deactivateButtons).toHaveLength(3);
  });

  it('renders an Activate button for the inactive plan', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Legacy Basic')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Activate Legacy Basic' })).toBeInTheDocument();
  });

  it('clicking Deactivate Starter opens dialog with deactivation copy', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Deactivate Starter' }));

    expect(screen.getByText('DEACTIVATE PLAN')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Deactivating "Starter" will prevent new business accounts from purchasing this tier. All existing merchant subscriptions and historical analytics remain fully preserved.',
      ),
    ).toBeInTheDocument();
  });

  it('clicking Activate Legacy Basic opens dialog with reactivation copy', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Legacy Basic')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Activate Legacy Basic' }));

    expect(screen.getByText('REACTIVATE PLAN')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Reactivating "Legacy Basic" will make it available for new signups immediately.',
      ),
    ).toBeInTheDocument();
  });

  it('clicking Cancel closes the dialog', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Deactivate Starter' }));
    expect(screen.getByText('DEACTIVATE PLAN')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText('DEACTIVATE PLAN')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npx vitest run src/components/SaaSDashboard/SubscriptionPlansView.test.tsx --reporter=verbose
```

Expected: the 5 new tests fail — buttons not found, dialog not rendered.

- [ ] **Step 3: Add state and replace the delete button**

In `src/components/SaaSDashboard/SubscriptionPlansView.tsx`:

**3a.** Add two new state declarations after `editSubmitting` (around line 48):

```tsx
  const [changingStatusPlan, setChangingStatusPlan] = useState<SubscriptionPlan | null>(null);
  const [changeStatusSubmitting, setChangeStatusSubmitting] = useState(false);
```

**3b.** Find and replace the existing placeholder delete button in the table row (the `<button>` with `aria-label={`Delete ${plan.name}`}`). Replace it entirely with:

```tsx
                        <button
                          type="button"
                          aria-label={plan.status === 'active' ? `Deactivate ${plan.name}` : `Activate ${plan.name}`}
                          onClick={() => setChangingStatusPlan(plan)}
                          className={`p-1 transition-colors ${
                            plan.status === 'active' ? 'hover:text-[#ae001a]' : 'hover:text-green-600'
                          }`}
                        >
                          <span className="material-symbols-outlined text-xl">
                            {plan.status === 'active' ? 'block' : 'check_circle'}
                          </span>
                        </button>
```

**3c.** Mount the dialog in the **main `return`** branch. Add after the `{/* Edit Plan Modal */}` block and before `{/* Toast */}`:

```tsx
      {/* Change Status Dialog */}
      {changingStatusPlan && (
        <ChangeStatusDialog
          plan={changingStatusPlan}
          submitting={changeStatusSubmitting}
          onClose={() => setChangingStatusPlan(null)}
          onConfirm={() => {}}
        />
      )}
```

**3d.** Mount the same dialog in the **empty-state `return`** branch (the one that renders `data-testid="empty-state"`). Add it after the `EditPlanModal` mount and before `{toast && <Toast ...>}`:

```tsx
      {changingStatusPlan && (
        <ChangeStatusDialog
          plan={changingStatusPlan}
          submitting={changeStatusSubmitting}
          onClose={() => setChangingStatusPlan(null)}
          onConfirm={() => {}}
        />
      )}
```

Note: `onConfirm` is a no-op placeholder; Task 2 wires the real handler.

- [ ] **Step 4: Add the ChangeStatusDialog sub-component**

Append this component at the bottom of `src/components/SaaSDashboard/SubscriptionPlansView.tsx`, after the `Toast` component and before the `export default SubscriptionPlansView;` line:

```tsx
interface ChangeStatusDialogProps {
  plan: SubscriptionPlan;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ChangeStatusDialog: React.FC<ChangeStatusDialogProps> = ({
  plan,
  submitting,
  onClose,
  onConfirm,
}) => {
  const isDeactivating = plan.status === 'active';
  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-md shadow-2xl">
        <div className="bg-[#222222] px-6 py-4 flex justify-between items-center">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">
            {isDeactivating ? 'DEACTIVATE PLAN' : 'REACTIVATE PLAN'}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        <div className="p-6 space-y-5">
          <p className="text-sm text-[#1d1c17]">
            {isDeactivating
              ? `Deactivating "${plan.name}" will prevent new business accounts from purchasing this tier. All existing merchant subscriptions and historical analytics remain fully preserved.`
              : `Reactivating "${plan.name}" will make it available for new signups immediately.`}
          </p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2 border border-[#e8e2d8] text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={submitting}
              className={`px-5 py-2 text-white text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2 ${
                isDeactivating ? 'bg-[#ae001a] hover:bg-[#930015]' : 'bg-green-600 hover:bg-green-700'
              }`}
            >
              {submitting && (
                <span className="material-symbols-outlined text-base animate-spin">
                  progress_activity
                </span>
              )}
              {submitting ? 'Saving...' : isDeactivating ? 'Deactivate' : 'Reactivate'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
```

- [ ] **Step 5: Run tests to confirm they pass**

```
npx vitest run src/components/SaaSDashboard/SubscriptionPlansView.test.tsx --reporter=verbose
```

Expected: all 5 new tests pass. All pre-existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/SaaSDashboard/SubscriptionPlansView.tsx src/components/SaaSDashboard/SubscriptionPlansView.test.tsx
git commit -m "feat: add Change Status button and ChangeStatusDialog UI"
```

---

### Task 2: handleChangeStatusConfirm handler

**Files:**
- Modify: `src/components/SaaSDashboard/SubscriptionPlansView.tsx`
- Modify: `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`

**Interfaces:**
- Consumes: `changingStatusPlan`, `changeStatusSubmitting`, `setChangingStatusPlan`, `setChangeStatusSubmitting` (from Task 1); `saasService.updateSubscriptionPlan`; `setPlans`; `setToast`
- Produces: `handleChangeStatusConfirm: () => Promise<void>`

- [ ] **Step 1: Write failing tests for the confirm handler**

Append this `describe` block at the end of `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`:

```tsx
describe('SubscriptionPlansView — change status confirm', () => {
  beforeEach(() => {
    vi.mocked(saasService.getSubscriptionPlans).mockResolvedValue(MOCK_PLANS);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('confirming deactivation calls updateSubscriptionPlan with status inactive', async () => {
    const updatedPlan = { ...MOCK_PLANS[0], status: 'inactive' as const };
    vi.mocked(saasService.updateSubscriptionPlan).mockResolvedValue(updatedPlan);
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Deactivate Starter' }));
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));

    await waitFor(() => {
      expect(saasService.updateSubscriptionPlan).toHaveBeenCalledWith(1, {
        name: 'Starter',
        description: 'Entry-level plan for quick service restaurants.',
        price: 49.99,
        billingCycle: 'monthly',
        status: 'inactive',
      });
    });
  });

  it('confirming reactivation calls updateSubscriptionPlan with status active', async () => {
    const updatedPlan = { ...MOCK_PLANS[3], status: 'active' as const };
    vi.mocked(saasService.updateSubscriptionPlan).mockResolvedValue(updatedPlan);
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Legacy Basic')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Activate Legacy Basic' }));
    await user.click(screen.getByRole('button', { name: /^reactivate$/i }));

    await waitFor(() => {
      expect(saasService.updateSubscriptionPlan).toHaveBeenCalledWith(4, {
        name: 'Legacy Basic',
        description: 'Deprecated legacy tier. Grandfathered accounts only.',
        price: 19.99,
        billingCycle: 'monthly',
        status: 'active',
      });
    });
  });

  it('successful deactivation updates the row in-place and shows success toast', async () => {
    const updatedPlan = { ...MOCK_PLANS[0], status: 'inactive' as const };
    vi.mocked(saasService.updateSubscriptionPlan).mockResolvedValue(updatedPlan);
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Deactivate Starter' }));
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));

    await waitFor(() => {
      expect(screen.queryByText('DEACTIVATE PLAN')).not.toBeInTheDocument();
      expect(screen.getByText('Plan status updated successfully')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Activate Starter' })).toBeInTheDocument();
    });
  });

  it('SESSION_EXPIRED closes dialog and shows session-expired toast', async () => {
    vi.mocked(saasService.updateSubscriptionPlan).mockRejectedValue(new Error('SESSION_EXPIRED'));
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Deactivate Starter' }));
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));

    await waitFor(() => {
      expect(screen.queryByText('DEACTIVATE PLAN')).not.toBeInTheDocument();
      expect(
        screen.getByText('Session expired. Please refresh the page to sign in again.'),
      ).toBeInTheDocument();
    });
  });

  it('other API error closes dialog and shows error toast', async () => {
    vi.mocked(saasService.updateSubscriptionPlan).mockRejectedValue(
      new Error('Internal server error'),
    );
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Deactivate Starter' }));
    await user.click(screen.getByRole('button', { name: /^deactivate$/i }));

    await waitFor(() => {
      expect(screen.queryByText('DEACTIVATE PLAN')).not.toBeInTheDocument();
      expect(screen.getByText('Internal server error')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npx vitest run src/components/SaaSDashboard/SubscriptionPlansView.test.tsx --reporter=verbose
```

Expected: the 5 new tests fail — `onConfirm` is still a no-op, so no API call is made.

- [ ] **Step 3: Add the handleChangeStatusConfirm handler**

In `src/components/SaaSDashboard/SubscriptionPlansView.tsx`, add this handler after the `closeEditModal` function and before `handleEditSubmit`:

```tsx
  const handleChangeStatusConfirm = async () => {
    if (!changingStatusPlan) return;
    const newStatus: 'active' | 'inactive' =
      changingStatusPlan.status === 'active' ? 'inactive' : 'active';
    setChangeStatusSubmitting(true);
    try {
      const updated = await saasService.updateSubscriptionPlan(changingStatusPlan.id, {
        name: changingStatusPlan.name,
        description: changingStatusPlan.description,
        price: changingStatusPlan.price,
        billingCycle: changingStatusPlan.billingCycle,
        status: newStatus,
      } as UpdateSubscriptionPlanDto);
      setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setChangingStatusPlan(null);
      setToast({ message: 'Plan status updated successfully', type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update plan status';
      setChangingStatusPlan(null);
      if (msg === 'SESSION_EXPIRED') {
        setToast({ message: 'Session expired. Please refresh the page to sign in again.', type: 'error' });
      } else {
        setToast({ message: msg, type: 'error' });
      }
    } finally {
      setChangeStatusSubmitting(false);
    }
  };
```

- [ ] **Step 4: Wire the handler into both dialog mount sites**

Replace both `onConfirm={() => {}}` placeholders (in the main `return` and in the empty-state `return`) with:

```tsx
          onConfirm={handleChangeStatusConfirm}
```

- [ ] **Step 5: Run tests to confirm they pass**

```
npx vitest run src/components/SaaSDashboard/SubscriptionPlansView.test.tsx --reporter=verbose
```

Expected: all 5 new tests pass. All pre-existing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/SaaSDashboard/SubscriptionPlansView.tsx src/components/SaaSDashboard/SubscriptionPlansView.test.tsx
git commit -m "feat: implement Change Status confirm handler with PATCH and in-place update"
```

---

### Task 3: Inactive row visual adaptation (opacity-75)

**Files:**
- Modify: `src/components/SaaSDashboard/SubscriptionPlansView.tsx`
- Modify: `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`

**Interfaces:**
- Consumes: `plan.status` on each table `<tr>`
- Produces: `<tr>` carries class `opacity-75` when `plan.status === 'inactive'`

- [ ] **Step 1: Write the failing test**

Inside the existing `describe('SubscriptionPlansView — table rendering', ...)` block in `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`, add this test after the `'renders inactive status badge'` test:

```tsx
  it('inactive plan rows have opacity-75 class', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Legacy Basic')).toBeInTheDocument());

    const legacyCell = screen.getByText('Legacy Basic');
    const row = legacyCell.closest('tr');
    expect(row).toHaveClass('opacity-75');
  });
```

- [ ] **Step 2: Run the test to confirm it fails**

```
npx vitest run src/components/SaaSDashboard/SubscriptionPlansView.test.tsx --reporter=verbose
```

Expected: the new test fails — `opacity-75` class not present on the row.

- [ ] **Step 3: Apply opacity-75 to inactive rows**

In `src/components/SaaSDashboard/SubscriptionPlansView.tsx`, find the `<tr>` element inside `filtered.map(...)`. Change:

```tsx
                  <tr key={plan.id} className="group hover:bg-[#f8f3eb] transition-colors">
```

to:

```tsx
                  <tr
                    key={plan.id}
                    className={`group hover:bg-[#f8f3eb] transition-colors${plan.status === 'inactive' ? ' opacity-75' : ''}`}
                  >
```

- [ ] **Step 4: Run all tests to confirm they pass**

```
npx vitest run src/components/SaaSDashboard/SubscriptionPlansView.test.tsx --reporter=verbose
```

Expected: all tests pass, including the new `opacity-75` test. Final count should be 37 tests (27 original + 10 new).

- [ ] **Step 5: Commit**

```bash
git add src/components/SaaSDashboard/SubscriptionPlansView.tsx src/components/SaaSDashboard/SubscriptionPlansView.test.tsx
git commit -m "feat: apply opacity-75 to inactive plan rows (AC4)"
```
