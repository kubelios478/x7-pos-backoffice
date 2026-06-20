# Design Spec: Change Plan Status (Soft Deactivation / Reactivation)

**Date:** 2026-06-18  
**Branch:** rafaalejandro_subscription  
**Story:** As a SaaS Owner, I want to transition a plan's status to "inactive" (or back to "active") rather than deleting its database entry, so I can block new signups while preserving merchant-subscription history and analytics.

---

## Acceptance Criteria

| # | Requirement |
|---|---|
| AC1 | Replace the placeholder `delete` icon in the Actions column with a "Change Status" button whose icon reflects the available action for that row. |
| AC2 | Clicking the button opens a confirmation dialog that warns the admin of the consequence before executing. |
| AC3 | Confirming executes a `PATCH /api/subscription-plan/:id` with `status: "inactive"` (deactivate) or `status: "active"` (reactivate). |
| AC4 | Inactive rows render at `opacity-75` and display a neutral grey "Inactive" badge. |

---

## Scope

**In scope:**
- Replace the non-functional `delete` button with a contextual Change Status button
- New `ChangeStatusDialog` confirmation sub-component
- Row visual adaptation for inactive plans (`opacity-75`)
- Bidirectional: active → inactive (deactivate) and inactive → active (reactivate)
- Both directions require explicit confirmation
- In-place row update after success (no re-fetch)
- Toast feedback on success or error

**Out of scope:**
- Hard delete of plans
- Bulk status changes
- Pagination changes
- Any backend changes (API already supports PATCH with status field)

---

## Component Design

### Actions Column Button (replaces `delete` placeholder)

The button is context-sensitive based on `plan.status`:

| `plan.status` | Icon | Hover color | `aria-label` |
|---|---|---|---|
| `active` | `block` | `text-[#ae001a]` | `"Deactivate {plan.name}"` |
| `inactive` | `check_circle` | `text-green-600` | `"Activate {plan.name}"` |

The button inherits the existing `opacity-40 group-hover:opacity-100` visibility pattern of the Actions column.

### New State in `SubscriptionPlansView`

```ts
const [changingStatusPlan, setChangingStatusPlan] = useState<SubscriptionPlan | null>(null);
const [changeStatusSubmitting, setChangeStatusSubmitting] = useState(false);
```

### `ChangeStatusDialog` Sub-component

Follows the existing modal pattern: full-screen overlay (`bg-black/50 z-[100]`), white card (`max-w-md`), dark header (`bg-[#222222]`). No form — just informational text and two action buttons.

**Props:**
```ts
interface ChangeStatusDialogProps {
  plan: SubscriptionPlan;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}
```

**Dialog copy (deactivation — active → inactive):**
- Header: `DEACTIVATE PLAN`
- Body: `Deactivating "{plan.name}" will prevent new business accounts from purchasing this tier. All existing merchant subscriptions and historical analytics remain fully preserved.`
- Cancel button: neutral style (existing border pattern)
- Confirm button: red (`bg-[#ae001a]`), label `DEACTIVATE`

**Dialog copy (reactivation — inactive → active):**
- Header: `REACTIVATE PLAN`
- Body: `Reactivating "{plan.name}" will make it available for new signups immediately.`
- Cancel button: neutral style
- Confirm button: green (`bg-green-600`), label `REACTIVATE`

Both directions show a spinner icon (`progress_activity animate-spin`) on the Confirm button while submitting.

---

## Data Flow

### Handler: `handleChangeStatusConfirm`

```
1. Determine newStatus = plan.status === 'active' ? 'inactive' : 'active'
2. Call saasService.updateSubscriptionPlan(plan.id, {
     name: plan.name,
     description: plan.description,
     price: plan.price,
     billingCycle: plan.billingCycle,
     status: newStatus,
   })
   — All 5 fields required (backend DTO is non-partial)
3. On success:
   - setPlans(prev => prev.map(p => p.id === updated.id ? updated : p))
   - setChangingStatusPlan(null)
   - setToast({ message: 'Plan status updated successfully', type: 'success' })
4. On SESSION_EXPIRED:
   - setChangingStatusPlan(null)
   - setToast({ message: 'Session expired. Please refresh the page to sign in again.', type: 'error' })
5. On any other error:
   - setToast({ message: err.message || 'Failed to update plan status', type: 'error' })
   - Keep dialog open? No — close and show toast (it's not a form, no inline error needed)
```

---

## Visual Adaptation (AC4)

### Table row

Add conditional class on `<tr>`:
```
className={`group hover:bg-[#f8f3eb] transition-colors ${plan.status === 'inactive' ? 'opacity-75' : ''}`}
```

### Status badge

Already implemented in the existing codebase:
- `active`: `bg-green-500/10 text-green-600` badge
- `inactive`: `bg-[#5f5e5e]/20 text-[#5f5e5e]` badge — no change needed

---

## Test Coverage

New tests to add in `SubscriptionPlansView.test.tsx` under a new `describe` block:

| # | Test |
|---|---|
| 1 | Renders a "Deactivate" button for each active plan row |
| 2 | Renders an "Activate" button for each inactive plan row |
| 3 | Clicking "Deactivate Starter" opens the dialog with deactivation copy |
| 4 | Clicking "Activate Legacy Basic" opens the dialog with reactivation copy |
| 5 | Confirming deactivation calls `updateSubscriptionPlan` with `status: 'inactive'` and all other fields unchanged |
| 6 | Confirming reactivation calls `updateSubscriptionPlan` with `status: 'active'` |
| 7 | Successful status change updates the row in-place (no re-fetch) |
| 8 | Successful status change shows success toast |
| 9 | `SESSION_EXPIRED` closes the dialog and shows the session-expired error toast |
| 10 | Inactive plan rows have `opacity-75` class applied |

---

## Files Affected

| File | Change |
|---|---|
| `src/components/SaaSDashboard/SubscriptionPlansView.tsx` | Add `changingStatusPlan` + `changeStatusSubmitting` state, replace delete button with contextual Change Status button, add `ChangeStatusDialog` sub-component, add `opacity-75` to inactive rows |
| `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx` | Add ~10 new tests for the Change Status flow |
| `src/services/saasService.ts` | No changes needed |
| `src/types/subscription.ts` | No changes needed |
