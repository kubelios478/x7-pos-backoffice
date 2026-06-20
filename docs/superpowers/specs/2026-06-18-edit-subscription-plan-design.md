# Edit Subscription Plan — Design Spec
Date: 2026-06-18  
Branch: rafaalejandro_subscription

## User Story
As a SaaS Owner, I want to edit the text descriptions, names, and pricing values of an existing subscription plan, so that marketing updates or strategic pricing adjustments cascade correctly into the platform.

## Acceptance Criteria
- **AC1**: Each row hosts an Actions column with an "Edit" pencil icon that transitions to full visibility on row-hover.
- **AC2**: Clicking "Edit" launches a configuration modal with fields `name`, `description`, `price`, `billingCycle`, and `status` pre-filled from the database record.
- **AC3**: On confirm, the interface fires a PATCH payload, updates the row in real-time, and surfaces a modification notice banner (toast).

## Backend Contract
- **Endpoint**: `PATCH /api/subscription-plan/:id`
- **Auth**: Bearer JWT, role `PORTAL_ADMIN`, scope `ADMIN_PORTAL`
- **Body**: All 5 fields required (backend extends `CreateSubscriptionPlanDto`, all `@IsNotEmpty()`):
  ```json
  { "name": "...", "description": "...", "price": 49.99, "billingCycle": "monthly", "status": "active" }
  ```
- **Response**: `{ statusCode: 200, message: "...", data: SubscriptionPlan }`
- **Errors**: 401 SESSION_EXPIRED, 404 not found, 409 name conflict

## Architecture

### 1. Types — `src/types/subscription.ts`
Add `UpdateSubscriptionPlanDto` with `status: 'active' | 'inactive'` (unlike `CreateSubscriptionPlanDto` which hardcodes `status: 'active'`).

### 2. Service — `src/services/saasService.ts`
Add `updateSubscriptionPlan(id: number, dto: UpdateSubscriptionPlanDto): Promise<SubscriptionPlan>` using existing `saasApiFetch` helper with `method: 'PATCH'`. Normalize `price` with `Number()` on response.

### 3. Component — `src/components/SaaSDashboard/SubscriptionPlansView.tsx`

**State additions:**
- `editingPlan: SubscriptionPlan | null` — the plan being edited (null = modal closed)
- `editForm` — mirrors `EMPTY_FORM` shape plus `status` field
- `editFormError: string`
- `editSubmitting: boolean`

**Behavior:**
- AC1: Edit button already exists with `opacity-40 group-hover:opacity-100`. Wire `onClick={() => openEditModal(plan)}`.
- `openEditModal(plan)` — sets `editingPlan`, populates `editForm` from plan (price as string via `.toString()`), clears errors.
- `closeEditModal()` — clears `editingPlan` and errors.
- `handleEditSubmit` — validates same rules as create, calls `saasService.updateSubscriptionPlan(editingPlan.id, dto)`, on success: updates `plans` array in-place via `setPlans(prev => prev.map(p => p.id === id ? updated : p))`, closes modal, shows toast "Subscription plan updated successfully". Handles SESSION_EXPIRED same as create flow.

**New sub-component `EditPlanModal`:**
- Same visual structure as `AddPlanModal` (dark header, form, error display, footer buttons).
- Header: "EDIT SUBSCRIPTION PLAN".
- Fields: name (maxLength 100 + counter), description (textarea), price ($-prefixed number), billingCycle (select), **status (select: active / inactive)**.
- Submit button label: "Save Changes" / "Saving..." during submit.

### 4. Tests — `SubscriptionPlansView.test.tsx`
Add `updateSubscriptionPlan: vi.fn()` to the service mock.

New describe block **"SubscriptionPlansView — edit plan"**:
1. Edit button renders per row with correct `aria-label`.
2. Clicking edit opens modal pre-filled with plan's name, price, billingCycle.
3. Submitting with unchanged values calls `updateSubscriptionPlan` with correct `id` and all 5 fields.
4. Successful update patches the row in the table (name change visible without re-fetch).
5. Successful update shows toast "Subscription plan updated successfully".
6. SESSION_EXPIRED closes modal and shows error toast.
7. Server error (non-session) shows inline form error without closing modal.

## Data Flow
```
Edit btn click
  → openEditModal(plan)          [state: editingPlan = plan, editForm = plan values]
  → EditPlanModal renders        [pre-filled]
  → user edits fields
  → handleEditSubmit
      → validate frontend
      → saasService.updateSubscriptionPlan(id, dto)  [PATCH /api/subscription-plan/:id]
      → setPlans(prev.map(...))  [optimistic-style in-place update]
      → closeEditModal()
      → setToast({ message: 'Subscription plan updated successfully', type: 'success' })
```

## Out of Scope
- Optimistic UI (we update after confirmed server response, not before).
- Partial PATCH (backend requires all 5 fields).
- Pagination reset on edit.
