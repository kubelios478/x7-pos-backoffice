# Logical Delete for Subscription Plans — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Change Status toggle (block/check_circle button) with a trash icon that performs a logical delete via `DELETE /api/subscription-plan/:id`, keeps the deleted row visible in the table with a red "Deleted" badge, and disables the Edit button for deleted plans.

**Architecture:** Four-task sequence: (1) extend types + add service method, (2) remove all Change Status code and add Delete button + `DeletePlanDialog` UI, (3) wire the `handleDeleteConfirm` handler, (4) apply visual adaptations (badge, disabled edit, opacity, filter option). Each task has its own test cycle. The spec for this feature is at `docs/superpowers/specs/2026-06-19-logical-delete-plan-design.md`.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vitest + React Testing Library, Material Symbols icons

## Global Constraints

- Modal pattern: overlay `fixed inset-0 bg-black/50 z-[100]`, card `bg-white w-full max-w-md shadow-2xl`, header `bg-[#222222] px-6 py-4`
- Button style: `text-[11px] font-bold uppercase tracking-widest`
- Design tokens: accent red `#ae001a`, hover red `#930015`, border `#e8e2d8`, warm bg `#f2ede5`, muted `#5f5e5e`
- Status badge pattern — active: `bg-green-500/10 text-green-600`, inactive: `bg-[#5f5e5e]/20 text-[#5f5e5e]`, deleted (new): `bg-red-500/10 text-red-600`
- Spinner: `material-symbols-outlined` `progress_activity` + `animate-spin`
- Backend DELETE endpoint returns the updated `SubscriptionPlan` object with `status: 'deleted'` wrapped in `{ data: SubscriptionPlan }`
- `status: 'deleted'` is set ONLY via the DELETE endpoint — never via PATCH
- Plans with `status: 'deleted'` are permanently unusable: Edit button visible but `disabled`, trash button not rendered
- Test command: `npx vitest run src/components/SaaSDashboard/SubscriptionPlansView.test.tsx --reporter=verbose`

---

### Task 1: Extend types + add service method

**Files:**
- Modify: `src/types/subscription.ts`
- Modify: `src/services/saasService.ts`

**Interfaces:**
- Produces:
  - `SubscriptionPlan.status: 'active' | 'inactive' | 'deleted'`
  - `saasService.deleteSubscriptionPlan(id: number): Promise<SubscriptionPlan>`

- [ ] **Step 1: Extend SubscriptionPlan status union**

In `src/types/subscription.ts`, change the `status` field of `SubscriptionPlan`:

```ts
export interface SubscriptionPlan {
  id: number;
  name: string;
  description: string;
  price: number;
  billingCycle: 'daily' | 'weekly' | 'monthly' | 'yearly';
  status: 'active' | 'inactive' | 'deleted';
}

export interface CreateSubscriptionPlanDto {
  name: string;
  description: string;
  price: number;
  billingCycle: 'daily' | 'weekly' | 'monthly' | 'yearly';
  status: 'active';
}

export interface UpdateSubscriptionPlanDto {
  name: string;
  description: string;
  price: number;
  billingCycle: 'daily' | 'weekly' | 'monthly' | 'yearly';
  status: 'active' | 'inactive';
}
```

Note: `UpdateSubscriptionPlanDto.status` stays `'active' | 'inactive'` — deleted is set only via DELETE.

- [ ] **Step 2: Add deleteSubscriptionPlan to saasService**

In `src/services/saasService.ts`, add this method inside the `saasService` object, after `updateSubscriptionPlan`:

```ts
  async deleteSubscriptionPlan(id: number): Promise<SubscriptionPlan> {
    const response = await saasApiFetch<{ data: SubscriptionPlan }>(
      `subscription-plan/${id}`,
      { method: 'DELETE' },
    );
    return { ...response.data, price: Number(response.data.price) };
  },
```

- [ ] **Step 3: Run the existing test suite to confirm nothing broke**

```
npx vitest run src/components/SaaSDashboard/SubscriptionPlansView.test.tsx --reporter=verbose
```

Expected: 38 tests pass, 0 fail. (The type change doesn't break existing tests because `'active'` and `'inactive'` are still valid values in the extended union.)

- [ ] **Step 4: Commit**

```bash
git add src/types/subscription.ts src/services/saasService.ts
git commit -m "feat: extend SubscriptionPlan status with deleted and add deleteSubscriptionPlan"
```

---

### Task 2: Remove Change Status code + Add Delete button + DeletePlanDialog UI

**Files:**
- Modify: `src/components/SaaSDashboard/SubscriptionPlansView.tsx`
- Modify: `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`

**Interfaces:**
- Consumes: `SubscriptionPlan.status: 'active' | 'inactive' | 'deleted'` from Task 1
- Produces:
  - State `deletingPlan: SubscriptionPlan | null`
  - State `deleteSubmitting: boolean`
  - `DeletePlanDialog` props: `{ plan: SubscriptionPlan; submitting: boolean; onClose: () => void; onConfirm: () => void }`
  - Trash button `aria-label`: `"Delete {plan.name}"`

- [ ] **Step 1: Remove the two Change Status describe blocks from the test file**

In `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`, delete the entire `describe('SubscriptionPlansView — change status button', ...)` block and the entire `describe('SubscriptionPlansView — change status confirm', ...)` block. These are the last two describe blocks in the file.

After removal, run:

```
npx vitest run src/components/SaaSDashboard/SubscriptionPlansView.test.tsx --reporter=verbose
```

Expected: 28 tests pass, 0 fail.

- [ ] **Step 2: Add deleted plan to MOCK_PLANS and update vi.mock**

In `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`:

2a. Add `deleteSubscriptionPlan: vi.fn()` to the `vi.mock` factory (inside the `saasService` object):

```ts
vi.mock('../../services/saasService', () => ({
  saasService: {
    getSubscriptionPlans: vi.fn(),
    createSubscriptionPlan: vi.fn(),
    updateSubscriptionPlan: vi.fn(),
    deleteSubscriptionPlan: vi.fn(),
  },
}));
```

2b. Add a fifth plan to `MOCK_PLANS` (after the existing 4):

```ts
  {
    id: 5,
    name: 'Archived Gold',
    description: 'Legacy gold tier, permanently discontinued.',
    price: 299.99,
    billingCycle: 'monthly',
    status: 'deleted',
  },
```

- [ ] **Step 3: Write 5 failing tests for the delete button UI**

Append this `describe` block at the end of `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`:

```tsx
describe('SubscriptionPlansView — delete plan', () => {
  beforeEach(() => {
    vi.mocked(saasService.getSubscriptionPlans).mockResolvedValue(MOCK_PLANS);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders a Delete button for each active plan', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());
    const deleteButtons = screen.getAllByRole('button', { name: /^Delete /i });
    expect(deleteButtons).toHaveLength(4); // 3 active + 1 inactive
  });

  it('does NOT render a Delete button for deleted plans', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Archived Gold')).toBeInTheDocument());
    expect(
      screen.queryByRole('button', { name: 'Delete Archived Gold' }),
    ).not.toBeInTheDocument();
  });

  it('clicking Delete Starter opens DeletePlanDialog with correct copy', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete Starter' }));

    expect(screen.getByText('DELETE PLAN')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Deleting "Starter" will permanently prevent it from being used in any new subscriptions. The record is retained for historical analytics.',
      ),
    ).toBeInTheDocument();
  });

  it('clicking Cancel closes the dialog', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete Starter' }));
    expect(screen.getByText('DELETE PLAN')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText('DELETE PLAN')).not.toBeInTheDocument();
  });

  it('edit button is disabled for deleted plans', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Archived Gold')).toBeInTheDocument());

    const editButton = screen.getByRole('button', { name: 'Edit Archived Gold' });
    expect(editButton).toBeDisabled();
  });
});
```

- [ ] **Step 4: Run tests to confirm the 5 new tests fail**

```
npx vitest run src/components/SaaSDashboard/SubscriptionPlansView.test.tsx --reporter=verbose
```

Expected: 28 pass, 5 fail (delete button not yet rendered).

- [ ] **Step 5: Remove Change Status code from SubscriptionPlansView.tsx**

In `src/components/SaaSDashboard/SubscriptionPlansView.tsx`:

5a. Remove the two state declarations:
```tsx
// DELETE these two lines:
const [changingStatusPlan, setChangingStatusPlan] = useState<SubscriptionPlan | null>(null);
const [changeStatusSubmitting, setChangeStatusSubmitting] = useState(false);
```

5b. Remove the `handleChangeStatusConfirm` async function entirely.

5c. Remove the `ChangeStatusDialog` sub-component and its `ChangeStatusDialogProps` interface from the bottom of the file.

5d. Remove both `{/* Change Status Dialog */}` mount blocks (one in the main return, one in the empty-state return):
```tsx
// DELETE both of these blocks:
{changingStatusPlan && (
  <ChangeStatusDialog
    plan={changingStatusPlan}
    submitting={changeStatusSubmitting}
    onClose={() => setChangingStatusPlan(null)}
    onConfirm={handleChangeStatusConfirm}
  />
)}
```

5e. In the table row Actions column, replace the block/check_circle button with the trash button. Find:
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

Replace with:
```tsx
                        {plan.status !== 'deleted' && (
                          <button
                            type="button"
                            aria-label={`Delete ${plan.name}`}
                            onClick={() => setDeletingPlan(plan)}
                            className="p-1 hover:text-red-600 transition-colors"
                          >
                            <span className="material-symbols-outlined text-xl">delete</span>
                          </button>
                        )}
```

5f. Update the edit button to be disabled for deleted plans. Find the edit button in the table row:
```tsx
                        <button
                          type="button"
                          aria-label={`Edit ${plan.name}`}
                          onClick={() => openEditModal(plan)}
                          className="p-1 hover:text-[#ae001a] transition-colors"
                        >
                          <span className="material-symbols-outlined text-xl">edit</span>
                        </button>
```

Replace with:
```tsx
                        <button
                          type="button"
                          aria-label={`Edit ${plan.name}`}
                          onClick={() => openEditModal(plan)}
                          disabled={plan.status === 'deleted'}
                          className={`p-1 transition-colors ${
                            plan.status === 'deleted'
                              ? 'opacity-50 cursor-not-allowed'
                              : 'hover:text-[#ae001a]'
                          }`}
                        >
                          <span className="material-symbols-outlined text-xl">edit</span>
                        </button>
```

- [ ] **Step 6: Add deletingPlan + deleteSubmitting state**

After the existing `editSubmitting` state declaration, add:

```tsx
  const [deletingPlan, setDeletingPlan] = useState<SubscriptionPlan | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
```

- [ ] **Step 7: Add DeletePlanDialog sub-component**

Append this component at the bottom of `src/components/SaaSDashboard/SubscriptionPlansView.tsx`, after the `Toast` component and before `export default SubscriptionPlansView;`:

```tsx
interface DeletePlanDialogProps {
  plan: SubscriptionPlan;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const DeletePlanDialog: React.FC<DeletePlanDialogProps> = ({
  plan,
  submitting,
  onClose,
  onConfirm,
}) => (
  <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
    <div className="bg-white w-full max-w-md shadow-2xl">
      <div className="bg-[#222222] px-6 py-4 flex justify-between items-center">
        <span className="text-[11px] font-bold uppercase tracking-widest text-white">
          DELETE PLAN
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
          {`Deleting "${plan.name}" will permanently prevent it from being used in any new subscriptions. The record is retained for historical analytics.`}
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
            className="px-5 py-2 bg-[#ae001a] hover:bg-[#930015] text-white text-[11px] font-bold uppercase tracking-widest transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && (
              <span className="material-symbols-outlined text-base animate-spin">
                progress_activity
              </span>
            )}
            {submitting ? 'Deleting...' : 'Delete Plan'}
          </button>
        </div>
      </div>
    </div>
  </div>
);
```

- [ ] **Step 8: Mount DeletePlanDialog in both return branches**

8a. In the **main return** branch, add after `{/* Edit Plan Modal */}` and before `{/* Toast */}`:

```tsx
      {/* Delete Plan Dialog */}
      {deletingPlan && (
        <DeletePlanDialog
          plan={deletingPlan}
          submitting={deleteSubmitting}
          onClose={() => setDeletingPlan(null)}
          onConfirm={() => {}}
        />
      )}
```

8b. In the **empty-state return** branch, add after the `EditPlanModal` mount and before `{toast && <Toast ...>}`:

```tsx
      {deletingPlan && (
        <DeletePlanDialog
          plan={deletingPlan}
          submitting={deleteSubmitting}
          onClose={() => setDeletingPlan(null)}
          onConfirm={() => {}}
        />
      )}
```

Note: `onConfirm={() => {}}` is a placeholder — Task 3 wires the real handler.

- [ ] **Step 9: Run tests to confirm all pass**

```
npx vitest run src/components/SaaSDashboard/SubscriptionPlansView.test.tsx --reporter=verbose
```

Expected: 33 tests pass (28 existing + 5 new delete UI tests), 0 fail.

- [ ] **Step 10: Commit**

```bash
git add src/components/SaaSDashboard/SubscriptionPlansView.tsx src/components/SaaSDashboard/SubscriptionPlansView.test.tsx
git commit -m "feat: remove Change Status, add logical delete button and DeletePlanDialog UI"
```

---

### Task 3: handleDeleteConfirm handler

**Files:**
- Modify: `src/components/SaaSDashboard/SubscriptionPlansView.tsx`
- Modify: `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`

**Interfaces:**
- Consumes: `deletingPlan`, `deleteSubmitting`, `setDeletingPlan`, `setDeleteSubmitting` from Task 2; `saasService.deleteSubscriptionPlan` from Task 1; `setPlans`; `setToast`
- Produces: `handleDeleteConfirm: () => Promise<void>`

- [ ] **Step 1: Write 4 failing tests for the confirm handler**

Append this `describe` block at the end of `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`:

```tsx
describe('SubscriptionPlansView — delete plan confirm', () => {
  beforeEach(() => {
    vi.mocked(saasService.getSubscriptionPlans).mockResolvedValue(MOCK_PLANS);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('confirming delete calls deleteSubscriptionPlan with the plan id', async () => {
    const deletedPlan = { ...MOCK_PLANS[0], status: 'deleted' as const };
    vi.mocked(saasService.deleteSubscriptionPlan).mockResolvedValue(deletedPlan);
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete Starter' }));
    await user.click(screen.getByRole('button', { name: /^delete plan$/i }));

    await waitFor(() => {
      expect(saasService.deleteSubscriptionPlan).toHaveBeenCalledWith(1);
    });
  });

  it('successful delete updates row in-place and shows success toast', async () => {
    const deletedPlan = { ...MOCK_PLANS[0], status: 'deleted' as const };
    vi.mocked(saasService.deleteSubscriptionPlan).mockResolvedValue(deletedPlan);
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete Starter' }));
    await user.click(screen.getByRole('button', { name: /^delete plan$/i }));

    await waitFor(() => {
      expect(screen.queryByText('DELETE PLAN')).not.toBeInTheDocument();
      expect(screen.getByText('Plan deleted successfully')).toBeInTheDocument();
    });
  });

  it('SESSION_EXPIRED closes dialog and shows session-expired toast', async () => {
    vi.mocked(saasService.deleteSubscriptionPlan).mockRejectedValue(
      new Error('SESSION_EXPIRED'),
    );
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete Starter' }));
    await user.click(screen.getByRole('button', { name: /^delete plan$/i }));

    await waitFor(() => {
      expect(screen.queryByText('DELETE PLAN')).not.toBeInTheDocument();
      expect(
        screen.getByText('Session expired. Please refresh the page to sign in again.'),
      ).toBeInTheDocument();
    });
  });

  it('other API error closes dialog and shows error toast', async () => {
    vi.mocked(saasService.deleteSubscriptionPlan).mockRejectedValue(
      new Error('Plan has active subscriptions'),
    );
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete Starter' }));
    await user.click(screen.getByRole('button', { name: /^delete plan$/i }));

    await waitFor(() => {
      expect(screen.queryByText('DELETE PLAN')).not.toBeInTheDocument();
      expect(screen.getByText('Plan has active subscriptions')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm the 4 new tests fail**

```
npx vitest run src/components/SaaSDashboard/SubscriptionPlansView.test.tsx --reporter=verbose
```

Expected: 33 pass, 4 fail (onConfirm is still a no-op).

- [ ] **Step 3: Add handleDeleteConfirm handler**

In `src/components/SaaSDashboard/SubscriptionPlansView.tsx`, add this handler after `closeEditModal` and before `handleEditSubmit`:

```tsx
  const handleDeleteConfirm = async () => {
    if (!deletingPlan) return;
    setDeleteSubmitting(true);
    try {
      const updated = await saasService.deleteSubscriptionPlan(deletingPlan.id);
      setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      setDeletingPlan(null);
      setToast({ message: 'Plan deleted successfully', type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to delete plan';
      setDeletingPlan(null);
      if (msg === 'SESSION_EXPIRED') {
        setToast({ message: 'Session expired. Please refresh the page to sign in again.', type: 'error' });
      } else {
        setToast({ message: msg, type: 'error' });
      }
    } finally {
      setDeleteSubmitting(false);
    }
  };
```

- [ ] **Step 4: Wire the handler into both dialog mount sites**

Replace both `onConfirm={() => {}}` placeholders with:

```tsx
          onConfirm={handleDeleteConfirm}
```

- [ ] **Step 5: Run tests to confirm all pass**

```
npx vitest run src/components/SaaSDashboard/SubscriptionPlansView.test.tsx --reporter=verbose
```

Expected: 37 tests pass, 0 fail.

- [ ] **Step 6: Commit**

```bash
git add src/components/SaaSDashboard/SubscriptionPlansView.tsx src/components/SaaSDashboard/SubscriptionPlansView.test.tsx
git commit -m "feat: implement handleDeleteConfirm with DELETE API call and in-place update"
```

---

### Task 4: Visual adaptation — badge, opacity, filter

**Files:**
- Modify: `src/components/SaaSDashboard/SubscriptionPlansView.tsx`
- Modify: `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`

**Interfaces:**
- Consumes: `plan.status: 'active' | 'inactive' | 'deleted'` on each row
- Produces:
  - Status column shows red "deleted" badge for deleted plans
  - `<tr>` carries `opacity-75` for both inactive and deleted plans
  - Status filter dropdown includes `"deleted"` option

- [ ] **Step 1: Write 3 failing tests**

4a. Add this test inside the existing `describe('SubscriptionPlansView — table rendering', ...)` block, after the `'renders inactive status badge'` test:

```tsx
  it('renders deleted status badge', async () => {
    renderView();
    await waitFor(() => {
      expect(screen.getByText('deleted')).toBeInTheDocument();
    });
  });

  it('deleted plan rows have opacity-75 class', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Archived Gold')).toBeInTheDocument());

    const deletedCell = screen.getByText('Archived Gold');
    const row = deletedCell.closest('tr');
    expect(row).toHaveClass('opacity-75');
  });
```

4b. Add this test inside the existing `describe('SubscriptionPlansView — filter strip', ...)` block, after the last test in that block:

```tsx
  it('status filter includes deleted option', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

    const select = screen.getByTestId('filter-status') as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain('deleted');
  });
```

- [ ] **Step 2: Run tests to confirm the 3 new tests fail**

```
npx vitest run src/components/SaaSDashboard/SubscriptionPlansView.test.tsx --reporter=verbose
```

Expected: 37 pass, 3 fail.

- [ ] **Step 3: Add "deleted" badge to the Status column**

In `src/components/SaaSDashboard/SubscriptionPlansView.tsx`, find the Status badge JSX in the table row (inside `<td className="px-6 py-4 text-center">`). Change from a ternary to a three-way condition:

```tsx
                    <td className="px-6 py-4 text-center">
                      {plan.status === 'active' ? (
                        <span className="bg-green-500/10 text-green-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                          active
                        </span>
                      ) : plan.status === 'inactive' ? (
                        <span className="bg-[#5f5e5e]/20 text-[#5f5e5e] text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                          inactive
                        </span>
                      ) : (
                        <span className="bg-red-500/10 text-red-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
                          deleted
                        </span>
                      )}
                    </td>
```

- [ ] **Step 4: Update row opacity to cover both inactive and deleted**

Find the `<tr>` inside `filtered.map(...)`. Change:

```tsx
                  <tr
                    key={plan.id}
                    className={`group hover:bg-[#f8f3eb] transition-colors${plan.status === 'inactive' ? ' opacity-75' : ''}`}
                  >
```

To:

```tsx
                  <tr
                    key={plan.id}
                    className={`group hover:bg-[#f8f3eb] transition-colors${plan.status !== 'active' ? ' opacity-75' : ''}`}
                  >
```

- [ ] **Step 5: Add "deleted" option to the Status filter dropdown**

Find the status filter `<select>` in the filter strip. Add the new option:

```tsx
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
            <option value="deleted">deleted</option>
          </select>
```

- [ ] **Step 6: Run all tests to confirm they pass**

```
npx vitest run src/components/SaaSDashboard/SubscriptionPlansView.test.tsx --reporter=verbose
```

Expected: 40 tests pass, 0 fail.

- [ ] **Step 7: Commit**

```bash
git add src/components/SaaSDashboard/SubscriptionPlansView.tsx src/components/SaaSDashboard/SubscriptionPlansView.test.tsx
git commit -m "feat: add deleted badge, opacity-75 for deleted rows, and deleted filter option"
```
