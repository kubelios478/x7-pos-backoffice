# Edit Subscription Plan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow a SaaS admin to edit an existing subscription plan (name, description, price, billingCycle, status) from the SubscriptionPlansView table, firing a real PATCH to the backend and updating the row in-place with a success toast.

**Architecture:** Separate `EditPlanModal` component (Opción B — no mode-prop on `AddPlanModal`). Edit state lives in `SubscriptionPlansView`. Service method `updateSubscriptionPlan` follows the same `saasApiFetch` pattern as `createSubscriptionPlan`.

**Tech Stack:** React 19, TypeScript, Vitest + React Testing Library, Tailwind CSS v4, Material Symbols icons.

## Global Constraints

- Backend: `PATCH /api/subscription-plan/:id` requires all 5 fields (name, description, price, billingCycle, status) — NOT partial. Body is JSON.
- Auth: Bearer JWT stored in localStorage key `x7_saas_admin_token` via `getSaasToken()`. 401 response → throw `new Error('SESSION_EXPIRED')`.
- Response shape: `{ statusCode, message, data: SubscriptionPlan }` — normalize `price` with `Number()`.
- Price field value ≥ 0.01. Name maxLength 100. All fields required.
- Icons: `material-symbols-outlined` class (already in project). Use `edit` icon for edit button.
- Design tokens: `#ae001a` red, `#930015` hover, `#1d1c17` dark text, `#5f5e5e` muted, `#e8e2d8` border, `#fef9f1` input bg, `#222222` modal header.
- Toast auto-dismisses after 3000 ms (existing `useEffect` handles this).
- Tests mock `saasService` — never hit real network.
- Run tests with: `npx vitest run src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`

---

### Task 1: Add `UpdateSubscriptionPlanDto` to types

**Files:**
- Modify: `src/types/subscription.ts`

**Interfaces:**
- Produces: `UpdateSubscriptionPlanDto` — consumed by Task 2 (service) and Task 3 (component).

- [ ] **Step 1: Open the current file and locate insertion point**

  File: `src/types/subscription.ts` (currently 16 lines). Add after `CreateSubscriptionPlanDto`.

- [ ] **Step 2: Add the new type**

  Replace the full file content with:

  ```ts
  export interface SubscriptionPlan {
    id: number;
    name: string;
    description: string;
    price: number;
    billingCycle: 'daily' | 'weekly' | 'monthly' | 'yearly';
    status: 'active' | 'inactive';
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

- [ ] **Step 3: Verify TypeScript compiles**

  Run: `npx tsc --noEmit`
  Expected: no errors related to `subscription.ts`.

- [ ] **Step 4: Commit**

  ```bash
  git add src/types/subscription.ts
  git commit -m "feat: add UpdateSubscriptionPlanDto to subscription types"
  ```

---

### Task 2: Add `updateSubscriptionPlan` to saasService

**Files:**
- Modify: `src/services/saasService.ts`

**Interfaces:**
- Consumes: `UpdateSubscriptionPlanDto` from Task 1.
- Produces: `saasService.updateSubscriptionPlan(id: number, dto: UpdateSubscriptionPlanDto): Promise<SubscriptionPlan>` — consumed by Task 3.

- [ ] **Step 1: Add the import for `UpdateSubscriptionPlanDto`**

  In `src/services/saasService.ts`, line 1:

  ```ts
  import type { SubscriptionPlan, CreateSubscriptionPlanDto, UpdateSubscriptionPlanDto } from '../types/subscription';
  ```

- [ ] **Step 2: Add the method to `saasService` object**

  After the closing brace of `createSubscriptionPlan`, add:

  ```ts
  async updateSubscriptionPlan(id: number, dto: UpdateSubscriptionPlanDto): Promise<SubscriptionPlan> {
    const response = await saasApiFetch<{ data: SubscriptionPlan }>(
      `subscription-plan/${id}`,
      {
        method: 'PATCH',
        body: JSON.stringify(dto),
      },
    );
    return { ...response.data, price: Number(response.data.price) };
  },
  ```

- [ ] **Step 3: Verify TypeScript compiles**

  Run: `npx tsc --noEmit`
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/services/saasService.ts
  git commit -m "feat: add updateSubscriptionPlan PATCH method to saasService"
  ```

---

### Task 3: Wire edit button + add `EditPlanModal` to `SubscriptionPlansView`

**Files:**
- Modify: `src/components/SaaSDashboard/SubscriptionPlansView.tsx`

**Interfaces:**
- Consumes: `saasService.updateSubscriptionPlan` from Task 2, `UpdateSubscriptionPlanDto` from Task 1.
- Produces: UI changes visible in browser — edit button opens pre-filled modal, PATCH on submit, toast on success.

**Context — what exists today:**
- `SubscriptionPlansView` has `showModal`, `form`, `formError`, `submitting` for the *create* flow.
- `openModal()` / `closeModal()` / `handleSubmit()` handle create.
- Edit button already rendered at line ~334 with `opacity-40 group-hover:opacity-100` — needs `onClick` wired.
- `Toast` component already exists and is shown via `toast` state.
- `EMPTY_FORM = { name:'', description:'', price:'', billingCycle:'monthly' }`.

- [ ] **Step 1: Add edit state variables**

  In `SubscriptionPlansView`, after the existing toast state (around line 36), add:

  ```ts
  // Edit modal state
  const [editingPlan, setEditingPlan] = useState<SubscriptionPlan | null>(null);
  const [editForm, setEditForm] = useState({
    name: '',
    description: '',
    price: '',
    billingCycle: 'monthly' as CreateSubscriptionPlanDto['billingCycle'],
    status: 'active' as 'active' | 'inactive',
  });
  const [editFormError, setEditFormError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  ```

- [ ] **Step 2: Add `openEditModal` and `closeEditModal` helpers**

  After `closeModal()`:

  ```ts
  const openEditModal = (plan: SubscriptionPlan) => {
    setEditingPlan(plan);
    setEditForm({
      name: plan.name,
      description: plan.description,
      price: plan.price.toString(),
      billingCycle: plan.billingCycle,
      status: plan.status,
    });
    setEditFormError('');
  };

  const closeEditModal = () => {
    setEditingPlan(null);
    setEditFormError('');
  };
  ```

- [ ] **Step 3: Add `handleEditSubmit`**

  After `handleSubmit`:

  ```ts
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;

    const name = editForm.name.trim();
    const description = editForm.description.trim();
    const price = parseFloat(editForm.price);

    if (!name) return setEditFormError('Plan name is required');
    if (name.length > 100) return setEditFormError('Plan name must be 100 characters or less');
    if (!description) return setEditFormError('Description is required');
    if (!editForm.price || isNaN(price) || price <= 0) return setEditFormError('Price must be a positive number');

    setEditFormError('');
    setEditSubmitting(true);
    try {
      const updated = await saasService.updateSubscriptionPlan(editingPlan.id, {
        name,
        description,
        price,
        billingCycle: editForm.billingCycle,
        status: editForm.status,
      });
      setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      closeEditModal();
      setToast({ message: 'Subscription plan updated successfully', type: 'success' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update plan';
      if (msg === 'SESSION_EXPIRED') {
        closeEditModal();
        setToast({ message: 'Session expired. Please refresh the page to sign in again.', type: 'error' });
      } else {
        setEditFormError(msg);
      }
    } finally {
      setEditSubmitting(false);
    }
  };
  ```

- [ ] **Step 4: Wire the edit button `onClick`**

  Find the edit button (currently has no onClick, around line 334):

  ```tsx
  <button
    type="button"
    aria-label={`Edit ${plan.name}`}
    className="p-1 hover:text-[#ae001a] transition-colors"
  >
  ```

  Replace with:

  ```tsx
  <button
    type="button"
    aria-label={`Edit ${plan.name}`}
    onClick={() => openEditModal(plan)}
    className="p-1 hover:text-[#ae001a] transition-colors"
  >
  ```

- [ ] **Step 5: Mount `EditPlanModal` in JSX**

  In the main return (after the `{showModal && <AddPlanModal ... />}` line), add:

  ```tsx
  {editingPlan && (
    <EditPlanModal
      form={editForm}
      setForm={setEditForm}
      formError={editFormError}
      submitting={editSubmitting}
      onClose={closeEditModal}
      onSubmit={handleEditSubmit}
    />
  )}
  ```

  Do the same in the empty-state return block (after `{showModal && <AddPlanModal ... />}`).

- [ ] **Step 6: Add `EditPlanModal` sub-component**

  After the closing of `AddPlanModal`, add:

  ```tsx
  interface EditModalProps {
    form: {
      name: string;
      description: string;
      price: string;
      billingCycle: CreateSubscriptionPlanDto['billingCycle'];
      status: 'active' | 'inactive';
    };
    setForm: React.Dispatch<React.SetStateAction<EditModalProps['form']>>;
    formError: string;
    submitting: boolean;
    onClose: () => void;
    onSubmit: (e: React.FormEvent) => void;
  }

  const EditPlanModal: React.FC<EditModalProps> = ({
    form,
    setForm,
    formError,
    submitting,
    onClose,
    onSubmit,
  }) => (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-lg shadow-2xl">
        {/* Modal header */}
        <div className="bg-[#222222] px-6 py-4 flex justify-between items-center">
          <span className="text-[11px] font-bold uppercase tracking-widest text-white">
            EDIT SUBSCRIPTION PLAN
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-white/50 hover:text-white transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] block mb-1.5">
              Plan Name <span className="text-[#ae001a]">*</span>
            </label>
            <input
              type="text"
              maxLength={100}
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-4 py-2.5 border border-[#e8e2d8] bg-[#fef9f1] text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none transition-all"
              placeholder="e.g. Professional"
            />
            <p className="text-[10px] text-[#5f5e5e] mt-1 text-right">{form.name.length}/100</p>
          </div>

          {/* Description */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] block mb-1.5">
              Description <span className="text-[#ae001a]">*</span>
            </label>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full px-4 py-2.5 border border-[#e8e2d8] bg-[#fef9f1] text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none transition-all resize-none"
              placeholder="Describe what's included in this plan..."
            />
          </div>

          {/* Price + Billing Cycle */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] block mb-1.5">
                Price (USD) <span className="text-[#ae001a]">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5f5e5e] text-sm font-bold">
                  $
                </span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  className="w-full pl-7 pr-4 py-2.5 border border-[#e8e2d8] bg-[#fef9f1] text-sm focus:border-[#ae001a] focus:ring-1 focus:ring-[#ae001a] outline-none transition-all"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] block mb-1.5">
                Billing Cycle <span className="text-[#ae001a]">*</span>
              </label>
              <select
                value={form.billingCycle}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    billingCycle: e.target.value as CreateSubscriptionPlanDto['billingCycle'],
                  }))
                }
                className="w-full px-3 py-2.5 border border-[#e8e2d8] bg-[#fef9f1] text-sm focus:border-[#ae001a] outline-none"
              >
                {BILLING_CYCLES.map((c) => (
                  <option key={c} value={c}>
                    {c.charAt(0).toUpperCase() + c.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e] block mb-1.5">
              Status
            </label>
            <select
              value={form.status}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value as 'active' | 'inactive' }))
              }
              className="w-full px-3 py-2.5 border border-[#e8e2d8] bg-[#fef9f1] text-sm focus:border-[#ae001a] outline-none"
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          {/* Error */}
          {formError && (
            <div className="bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 flex items-center gap-2">
              <span className="material-symbols-outlined text-lg">error</span>
              {formError}
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-5 py-2 border border-[#e8e2d8] text-[#1d1c17] text-[11px] font-bold uppercase tracking-widest hover:bg-[#f2ede5] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 bg-[#ae001a] text-white text-[11px] font-bold uppercase tracking-widest hover:bg-[#930015] transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && (
                <span className="material-symbols-outlined text-base animate-spin">
                  progress_activity
                </span>
              )}
              {submitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
  ```

- [ ] **Step 7: Verify TypeScript compiles**

  Run: `npx tsc --noEmit`
  Expected: no errors.

- [ ] **Step 8: Commit**

  ```bash
  git add src/components/SaaSDashboard/SubscriptionPlansView.tsx
  git commit -m "feat: add EditPlanModal and wire edit button in SubscriptionPlansView"
  ```

---

### Task 4: Add tests for the edit flow

**Files:**
- Modify: `src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`

**Interfaces:**
- Consumes: `saasService.updateSubscriptionPlan` mock, `SubscriptionPlan` type.

**Context — what the test file does today:**
- Mocks `saasService` at the top with `vi.mock(...)`.
- Uses `MOCK_PLANS` array (4 plans: Starter id=1, Professional id=2, Enterprise id=3, Legacy Basic id=4).
- `renderView()` helper calls `render(<SubscriptionPlansView />)`.
- Each `describe` has `beforeEach` setting `getSubscriptionPlans` mock and `afterEach` calling `cleanup()` + `vi.clearAllMocks()`.

- [ ] **Step 1: Add `updateSubscriptionPlan` to the service mock**

  Find the `vi.mock` block at the top of the test file:

  ```ts
  vi.mock('../../services/saasService', () => ({
    saasService: {
      getSubscriptionPlans: vi.fn(),
      createSubscriptionPlan: vi.fn(),
    },
  }));
  ```

  Replace with:

  ```ts
  vi.mock('../../services/saasService', () => ({
    saasService: {
      getSubscriptionPlans: vi.fn(),
      createSubscriptionPlan: vi.fn(),
      updateSubscriptionPlan: vi.fn(),
    },
  }));
  ```

- [ ] **Step 2: Write and run the failing tests first**

  Add this `describe` block at the end of the file:

  ```ts
  describe('SubscriptionPlansView — edit plan', () => {
    beforeEach(() => {
      vi.mocked(saasService.getSubscriptionPlans).mockResolvedValue(MOCK_PLANS);
    });

    afterEach(() => {
      cleanup();
      vi.clearAllMocks();
    });

    it('renders an edit button for each plan row', async () => {
      renderView();
      await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

      const editButtons = screen.getAllByRole('button', { name: /^Edit /i });
      expect(editButtons).toHaveLength(MOCK_PLANS.length);
    });

    it('edit button has correct aria-label', async () => {
      renderView();
      await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

      expect(screen.getByRole('button', { name: 'Edit Starter' })).toBeInTheDocument();
    });

    it('clicking edit opens modal pre-filled with plan name', async () => {
      const user = userEvent.setup();
      renderView();
      await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Edit Starter' }));

      expect(screen.getByText('EDIT SUBSCRIPTION PLAN')).toBeInTheDocument();
      const nameInput = screen.getByPlaceholderText('e.g. Professional') as HTMLInputElement;
      expect(nameInput.value).toBe('Starter');
    });

    it('clicking edit pre-fills price and billingCycle', async () => {
      const user = userEvent.setup();
      renderView();
      await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Edit Starter' }));

      const priceInput = screen.getByPlaceholderText('0.00') as HTMLInputElement;
      expect(priceInput.value).toBe('49.99');

      const billingSelect = screen.getByDisplayValue('Monthly') as HTMLSelectElement;
      expect(billingSelect.value).toBe('monthly');
    });

    it('submitting edit calls updateSubscriptionPlan with correct payload', async () => {
      const updatedPlan = { ...MOCK_PLANS[0], name: 'Starter Edited' };
      vi.mocked(saasService.updateSubscriptionPlan).mockResolvedValue(updatedPlan);

      const user = userEvent.setup();
      renderView();
      await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Edit Starter' }));

      const nameInput = screen.getByPlaceholderText('e.g. Professional');
      await user.clear(nameInput);
      await user.type(nameInput, 'Starter Edited');

      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(saasService.updateSubscriptionPlan).toHaveBeenCalledWith(1, {
          name: 'Starter Edited',
          description: 'Entry-level plan for quick service restaurants.',
          price: 49.99,
          billingCycle: 'monthly',
          status: 'active',
        });
      });
    });

    it('successful update patches the row in the table without re-fetch', async () => {
      const updatedPlan = { ...MOCK_PLANS[0], name: 'Starter Renamed' };
      vi.mocked(saasService.updateSubscriptionPlan).mockResolvedValue(updatedPlan);

      const user = userEvent.setup();
      renderView();
      await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Edit Starter' }));
      const nameInput = screen.getByPlaceholderText('e.g. Professional');
      await user.clear(nameInput);
      await user.type(nameInput, 'Starter Renamed');
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByText('Starter Renamed')).toBeInTheDocument();
        expect(screen.queryByText('Starter')).not.toBeInTheDocument();
      });
    });

    it('successful update shows success toast', async () => {
      const updatedPlan = { ...MOCK_PLANS[0] };
      vi.mocked(saasService.updateSubscriptionPlan).mockResolvedValue(updatedPlan);

      const user = userEvent.setup();
      renderView();
      await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Edit Starter' }));
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByText('Subscription plan updated successfully')).toBeInTheDocument();
      });
    });

    it('SESSION_EXPIRED closes modal and shows error toast', async () => {
      vi.mocked(saasService.updateSubscriptionPlan).mockRejectedValue(new Error('SESSION_EXPIRED'));

      const user = userEvent.setup();
      renderView();
      await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Edit Starter' }));
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.queryByText('EDIT SUBSCRIPTION PLAN')).not.toBeInTheDocument();
        expect(
          screen.getByText('Session expired. Please refresh the page to sign in again.'),
        ).toBeInTheDocument();
      });
    });

    it('server error shows inline form error and keeps modal open', async () => {
      vi.mocked(saasService.updateSubscriptionPlan).mockRejectedValue(
        new Error('A plan with this name already exists'),
      );

      const user = userEvent.setup();
      renderView();
      await waitFor(() => expect(screen.getByText('Starter')).toBeInTheDocument());

      await user.click(screen.getByRole('button', { name: 'Edit Starter' }));
      await user.click(screen.getByRole('button', { name: /save changes/i }));

      await waitFor(() => {
        expect(screen.getByText('EDIT SUBSCRIPTION PLAN')).toBeInTheDocument();
        expect(screen.getByText('A plan with this name already exists')).toBeInTheDocument();
      });
    });
  });
  ```

- [ ] **Step 3: Run tests — expect failures (TDD red)**

  Run: `npx vitest run src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`
  Expected: the 7 new tests FAIL (edit button has no onClick, modal doesn't open, etc.). Existing 18 tests pass.

- [ ] **Step 4: Implement Tasks 1–3 (types, service, component)**

  Follow Tasks 1, 2, 3 above. Once all changes are in place, run tests again.

- [ ] **Step 5: Run tests — all pass (TDD green)**

  Run: `npx vitest run src/components/SaaSDashboard/SubscriptionPlansView.test.tsx`
  Expected: all 25 tests PASS (18 existing + 7 new).

- [ ] **Step 6: Commit**

  ```bash
  git add src/components/SaaSDashboard/SubscriptionPlansView.test.tsx
  git commit -m "test: add 7 edit plan tests to SubscriptionPlansView"
  ```

---

### Task 5: Final verification

- [ ] **Step 1: Full test suite run**

  Run: `npx vitest run`
  Expected: all tests pass. No regressions.

- [ ] **Step 2: TypeScript check**

  Run: `npx tsc --noEmit`
  Expected: zero errors.

- [ ] **Step 3: Visual smoke test (optional — if dev server is running)**

  Open `http://localhost:5173/saas-admin`, go to Subscription Plans tab, hover a row — pencil icon becomes visible. Click it — modal opens pre-filled. Change a field, click Save — row updates in-place and toast appears.

- [ ] **Step 4: Final commit if anything was fixed**

  ```bash
  git add -p
  git commit -m "fix: address any issues found during final verification"
  ```
