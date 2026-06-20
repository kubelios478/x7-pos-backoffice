# Design Spec: Logical Delete for Subscription Plans

**Date:** 2026-06-19
**Branch:** rafaalejandro_subscription
**Story:** Replace the Change Status toggle mechanism with a logical delete (trash icon) that marks a plan as `deleted` via `DELETE /api/subscription-plan/:id`, keeps the row visible in the table, and permanently prevents the plan from being used in any new subscriptions.

---

## Context

The previous implementation added a bidirectional Change Status button (block/check_circle) to the Actions column. This is being replaced because status changes (active ↔ inactive) are already handled by the Edit modal. The new requirement is a distinct **logical delete** action, represented by a trash icon, that transitions a plan to a permanent `deleted` state.

Plans with `status: 'deleted'` are permanently unusable — they cannot be edited, reactivated, or assigned to new subscriptions. The record is retained in the database for historical analytics.

---

## Scope

**In scope:**
- Remove all Change Status code: `ChangeStatusDialog`, `handleChangeStatusConfirm`, `changingStatusPlan` state, `changeStatusSubmitting` state, both dialog mount points, and 11 related tests
- Add `'deleted'` to `SubscriptionPlan.status` type
- Add `saasService.deleteSubscriptionPlan(id)` calling `DELETE /api/subscription-plan/:id`
- Trash icon button in Actions column (replaces block/check_circle button)
- `DeletePlanDialog` confirmation sub-component
- "Deleted" badge in Status column (`bg-red-500/10 text-red-600`)
- Edit button disabled for deleted plans
- Trash button hidden for deleted plans
- `"deleted"` option added to the Status filter dropdown
- Row `opacity-75` for deleted plans (same as inactive)

**Out of scope:**
- Restoring/undeleting plans
- Bulk delete
- Any backend changes
- Filtering deleted plans out of the list by default

---

## Type Changes

`src/types/subscription.ts` — extend `status` union:

```ts
export interface SubscriptionPlan {
  id: number;
  name: string;
  description: string;
  price: number;
  billingCycle: 'daily' | 'weekly' | 'monthly' | 'yearly';
  status: 'active' | 'inactive' | 'deleted';
}
```

`CreateSubscriptionPlanDto.status` and `UpdateSubscriptionPlanDto.status` remain unchanged (you can only create `active` plans and edit to `active`/`inactive` — the `deleted` state is set exclusively via the DELETE endpoint).

---

## Service Change

`src/services/saasService.ts` — add one method:

```ts
async deleteSubscriptionPlan(id: number): Promise<SubscriptionPlan> {
  const response = await saasApiFetch<{ data: SubscriptionPlan }>(
    `subscription-plan/${id}`,
    { method: 'DELETE' },
  );
  return { ...response.data, price: Number(response.data.price) };
},
```

---

## Component Design

### Actions Column (per row)

| `plan.status` | Edit button (✏️) | Trash button (🗑️) |
|---|---|---|
| `active` | enabled, normal | visible — opens `DeletePlanDialog` |
| `inactive` | enabled, normal | visible — opens `DeletePlanDialog` |
| `deleted` | visible, `disabled` + `opacity-50` + `cursor-not-allowed` | not rendered |

Trash button hover color: `hover:text-red-600`  
Trash button `aria-label`: `"Delete {plan.name}"`

### New State in `SubscriptionPlansView`

```ts
const [deletingPlan, setDeletingPlan] = useState<SubscriptionPlan | null>(null);
const [deleteSubmitting, setDeleteSubmitting] = useState(false);
```

### `DeletePlanDialog` Sub-component

Follows the existing modal pattern: `fixed inset-0 bg-black/50 z-[100]`, white card `max-w-md shadow-2xl`, dark header `bg-[#222222]`.

**Props:**
```ts
interface DeletePlanDialogProps {
  plan: SubscriptionPlan;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}
```

**Copy:**
- Header: `DELETE PLAN`
- Body: `Deleting "{plan.name}" will permanently prevent it from being used in any new subscriptions. The record is retained for historical analytics.`
- Cancel: neutral style (existing border pattern)
- Confirm: `bg-[#ae001a] hover:bg-[#930015]`, label `DELETE PLAN`
- Spinner: `progress_activity animate-spin` on confirm button while submitting, label changes to `Deleting...`

---

## Handler: `handleDeleteConfirm`

```
1. setDeleteSubmitting(true)
2. Call saasService.deleteSubscriptionPlan(deletingPlan.id)
3. On success:
   - setPlans(prev => prev.map(p => p.id === updated.id ? updated : p))
   - setDeletingPlan(null)
   - setToast({ message: 'Plan deleted successfully', type: 'success' })
4. On SESSION_EXPIRED:
   - setDeletingPlan(null)
   - setToast({ message: 'Session expired. Please refresh the page to sign in again.', type: 'error' })
5. On any other error:
   - setDeletingPlan(null)
   - setToast({ message: err.message || 'Failed to delete plan', type: 'error' })
6. finally: setDeleteSubmitting(false)
```

---

## Visual Adaptation

### Status badge (Status column)

```tsx
// active — existing, unchanged
<span className="bg-green-500/10 text-green-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
  active
</span>

// inactive — existing, unchanged
<span className="bg-[#5f5e5e]/20 text-[#5f5e5e] text-[10px] font-bold uppercase px-2 py-0.5 rounded">
  inactive
</span>

// deleted — new
<span className="bg-red-500/10 text-red-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
  deleted
</span>
```

### Table row opacity

```tsx
className={`group hover:bg-[#f8f3eb] transition-colors${plan.status !== 'active' ? ' opacity-75' : ''}`}
```

Both `inactive` and `deleted` rows render at `opacity-75`.

### Status filter dropdown

```tsx
<option value="All Status">All Status</option>
<option value="active">active</option>
<option value="inactive">inactive</option>
<option value="deleted">deleted</option>  {/* new */}
```

### Left accent bar (Plan Name column)

The `w-1 h-10` colored bar already switches to `bg-[#c8c6c5]` for non-active status — no change needed, deleted plans will naturally use the grey bar.

---

## Test Coverage

**Remove** the 11 tests in:
- `describe('SubscriptionPlansView — change status button', ...)`
- `describe('SubscriptionPlansView — change status confirm', ...)`

**Add** ~9 new tests under a new `describe('SubscriptionPlansView — delete plan', ...)` block:

| # | Test |
|---|---|
| 1 | Renders a Delete button for each active plan |
| 2 | Renders a Delete button for each inactive plan |
| 3 | Does NOT render a Delete button for deleted plans |
| 4 | Clicking "Delete Starter" opens `DeletePlanDialog` with correct copy |
| 5 | Clicking Cancel closes the dialog |
| 6 | Confirming delete calls `deleteSubscriptionPlan` with correct plan id |
| 7 | Successful delete updates the row in-place (shows "deleted" badge) and shows success toast |
| 8 | `SESSION_EXPIRED` closes dialog and shows session-expired toast |
| 9 | Edit button is disabled for deleted plans |

**Update** `MOCK_PLANS` to include one plan with `status: 'deleted'` for tests 3 and 9.

**Update** `vi.mock` to include `deleteSubscriptionPlan: vi.fn()`.

---

## Files Affected

| File | Change |
|---|---|
| `src/types/subscription.ts` | Add `'deleted'` to `SubscriptionPlan.status` union |
| `src/services/saasService.ts` | Add `deleteSubscriptionPlan(id)` method |
| `src/components/SaaSDashboard/SubscriptionPlansView.tsx` | Remove ChangeStatus code, add delete button + `DeletePlanDialog` + handler + visual updates |
| `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx` | Remove 11 ChangeStatus tests, add 9 delete tests, update mocks and MOCK_PLANS |
