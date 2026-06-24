# Applications Logical Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add logical delete (trash icon) to Platform Applications, add Status field to the Edit modal, and remove the now-redundant lock/deactivate button.

**Architecture:** Two sequential tasks — Task 1 handles everything delete-related (type, service, component, tests); Task 2 adds status editing to the Edit modal (service signature, component, tests). Task 2 depends on the `Application.status` type from Task 1.

**Tech Stack:** React 19, TypeScript, Tailwind v4, Vitest, React Testing Library.

## Global Constraints

- `Application.status` union after Task 1: `'active' | 'inactive' | 'deleted'`
- `deleted` status set ONLY via `DELETE /api/applications/:id` — never via edit or create
- "deleted" badge: `bg-red-500/10 text-red-600` (matches SubscriptionPlans pattern)
- Trash button hover: `hover:text-red-600`
- Dialog pattern: `fixed inset-0 bg-black/50 z-[100]`, white card `max-w-md shadow-2xl`, header `bg-[#222222]`
- Edit button disabled for deleted apps: `disabled` + `opacity-50 cursor-not-allowed`
- Trash button hidden (not rendered) for deleted apps
- Row `opacity-75` for `status !== 'active'` — already correct, no change needed
- Run tests with: `npx vitest run src/components/SaaSDashboard/PlatformApplicationsView.test.tsx`

---

## File Map

| File | Change |
|------|--------|
| `src/types/subscription.ts` | Add `'deleted'` to `Application.status` union |
| `src/services/saasService.ts` | Remove `toggleApplicationInactive`; add `deleteApplication`; extend `updateApplication` (Task 2) |
| `src/components/SaaSDashboard/PlatformApplicationsView.tsx` | Remove deactivate code; add delete code; add status badge; update filter; add status to Edit modal (Task 2) |
| `src/components/SaaSDashboard/PlatformApplicationsView.test.tsx` | Remove 7 deactivate tests; update mock; add MOCK_APP[3] deleted; add delete tests; add edit-status tests (Task 2) |

---

## Task 1: Logical delete — type, service, component, tests

**Files:**
- Modify: `src/types/subscription.ts`
- Modify: `src/services/saasService.ts`
- Modify: `src/components/SaaSDashboard/PlatformApplicationsView.tsx`
- Test: `src/components/SaaSDashboard/PlatformApplicationsView.test.tsx`

**Interfaces:**
- Produces: `Application.status` is `'active' | 'inactive' | 'deleted'`
- Produces: `saasService.deleteApplication(id: number): Promise<Application>`

---

- [ ] **Step 1: Add `'deleted'` to `Application.status` in types**

In `src/types/subscription.ts`, change line 7:

```ts
// BEFORE
export interface Application {
  id: number;
  name: string;
  description: string;
  category: string;
  status: 'active' | 'inactive';
}

// AFTER
export interface Application {
  id: number;
  name: string;
  description: string;
  category: string;
  status: 'active' | 'inactive' | 'deleted';
}
```

- [ ] **Step 2: Update saasService — remove `toggleApplicationInactive`, add `deleteApplication`**

In `src/services/saasService.ts`:

**Remove the entire `toggleApplicationInactive` method** (currently the method that PATCHes an app to `status: 'inactive'`). Find and delete it:

```ts
// REMOVE THIS ENTIRE METHOD:
async toggleApplicationInactive(app: Application): Promise<Application> {
  const response = await saasApiFetch<{ data: Application }>(
    `applications/${app.id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: app.name,
        description: app.description,
        category: app.category,
        status: 'inactive',
      }),
    },
  );
  return response.data;
},
```

**Add `deleteApplication` immediately after `updateApplication`:**

```ts
async deleteApplication(id: number): Promise<Application> {
  const response = await saasApiFetch<{ data: Application }>(
    `applications/${id}`,
    { method: 'DELETE' },
  );
  return response.data;
},
```

- [ ] **Step 3: Write the failing tests**

In `src/components/SaaSDashboard/PlatformApplicationsView.test.tsx`:

**3a. Remove the entire `describe('PlatformApplicationsView — toggle status action', ...)` block** (lines 221–348 — 7 tests). Delete from `describe('PlatformApplicationsView — toggle status action', {` through its closing `});`.

**3b. Update the `vi.mock` at the top of the file** — replace `toggleApplicationInactive` with `deleteApplication`:

```ts
vi.mock('../../services/saasService', () => ({
  saasService: {
    getApplications: vi.fn(),
    deleteApplication: vi.fn(),
    updateApplication: vi.fn(),
    createApplication: vi.fn(),
  },
}));
```

**3c. Add a 4th app to `MOCK_APPS`** with `status: 'deleted'`:

```ts
const MOCK_APPS: Application[] = [
  {
    id: 1,
    name: 'POS Terminal',
    description: 'Core point-of-sale terminal application.',
    category: 'Core',
    status: 'active',
  },
  {
    id: 2,
    name: 'Kitchen Display',
    description: 'Real-time kitchen order display system.',
    category: 'Operations',
    status: 'active',
  },
  {
    id: 3,
    name: 'Reporting Suite',
    description: 'Advanced reporting and analytics module.',
    category: 'Analytics',
    status: 'inactive',
  },
  {
    id: 4,
    name: 'Legacy Bridge',
    description: 'Deprecated legacy integration bridge.',
    category: 'Core',
    status: 'deleted',
  },
];
```

**3d. Add the new delete tests** — insert a new `describe` block after the `describe('PlatformApplicationsView — toggle status action', ...)` location (after line 348, before the Quick Launch describe):

```ts
describe('PlatformApplicationsView — delete application', () => {
  beforeEach(() => {
    vi.mocked(saasService.getApplications).mockResolvedValue(MOCK_APPS);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders a Delete button for each active app', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('POS Terminal')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Delete POS Terminal' })).toBeInTheDocument();
  });

  it('renders a Delete button for each inactive app', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Reporting Suite')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Delete Reporting Suite' })).toBeInTheDocument();
  });

  it('does NOT render a Delete button for deleted apps', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Legacy Bridge')).toBeInTheDocument());
    expect(
      screen.queryByRole('button', { name: 'Delete Legacy Bridge' }),
    ).not.toBeInTheDocument();
  });

  it('clicking Delete opens the confirmation dialog with correct copy', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('POS Terminal')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete POS Terminal' }));

    expect(screen.getByText('DELETE APPLICATION')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Deleting "POS Terminal" will permanently prevent it from being distributed to new subscribers. The record is retained for historical analytics.',
      ),
    ).toBeInTheDocument();
  });

  it('clicking Cancel closes the confirmation dialog', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('POS Terminal')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete POS Terminal' }));
    expect(screen.getByText('DELETE APPLICATION')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText('DELETE APPLICATION')).not.toBeInTheDocument();
  });

  it('confirming calls deleteApplication with the correct app id', async () => {
    const deleted = { ...MOCK_APPS[0], status: 'deleted' as const };
    vi.mocked(saasService.deleteApplication).mockResolvedValue(deleted);

    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('POS Terminal')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete POS Terminal' }));
    await user.click(screen.getByRole('button', { name: /delete application/i }));

    await waitFor(() => {
      expect(saasService.deleteApplication).toHaveBeenCalledWith(MOCK_APPS[0].id);
    });
  });

  it('successful delete updates row in-place to deleted badge and shows success toast', async () => {
    const deleted = { ...MOCK_APPS[0], status: 'deleted' as const };
    vi.mocked(saasService.deleteApplication).mockResolvedValue(deleted);

    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('POS Terminal')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete POS Terminal' }));
    await user.click(screen.getByRole('button', { name: /delete application/i }));

    await waitFor(() => {
      expect(screen.queryByText('DELETE APPLICATION')).not.toBeInTheDocument();
      expect(screen.getByText('Application deleted successfully')).toBeInTheDocument();
    });
  });

  it('SESSION_EXPIRED closes dialog and shows session-expired toast', async () => {
    vi.mocked(saasService.deleteApplication).mockRejectedValue(new Error('SESSION_EXPIRED'));

    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('POS Terminal')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Delete POS Terminal' }));
    await user.click(screen.getByRole('button', { name: /delete application/i }));

    await waitFor(() => {
      expect(screen.queryByText('DELETE APPLICATION')).not.toBeInTheDocument();
      expect(
        screen.getByText('Session expired. Please refresh the page to sign in again.'),
      ).toBeInTheDocument();
    });
  });

  it('Edit button is disabled for deleted apps', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Legacy Bridge')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Edit Legacy Bridge' })).toBeDisabled();
  });

  it('renders deleted status badge for deleted apps', async () => {
    renderView();
    await waitFor(() => expect(screen.getByText('Legacy Bridge')).toBeInTheDocument());
    expect(screen.getByText('deleted')).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run tests to confirm they fail**

```
npx vitest run src/components/SaaSDashboard/PlatformApplicationsView.test.tsx
```

Expected: the 9 new delete tests FAIL (component still has lock button, no trash, no DeleteAppDialog). The old deactivate tests are now removed so no `toggleApplicationInactive` failures.

- [ ] **Step 5: Implement component changes**

In `src/components/SaaSDashboard/PlatformApplicationsView.tsx`:

**5a. Remove `DeactivateAppDialog` sub-component** — delete the entire component (from `interface DeactivateAppDialogProps` through the closing of the component function).

**5b. Add `DeleteAppDialog` sub-component** — insert it in the same location (before `interface ToastProps`):

```tsx
interface DeleteAppDialogProps {
  app: Application;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const DeleteAppDialog: React.FC<DeleteAppDialogProps> = ({
  app,
  submitting,
  onClose,
  onConfirm,
}) => (
  <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4">
    <div className="bg-white w-full max-w-md shadow-2xl">
      <div className="bg-[#222222] px-6 py-4 flex justify-between items-center">
        <span className="text-[11px] font-bold uppercase tracking-widest text-white">
          DELETE APPLICATION
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
          {`Deleting "${app.name}" will permanently prevent it from being distributed to new subscribers. The record is retained for historical analytics.`}
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
            {submitting ? 'Deleting...' : 'Delete Application'}
          </button>
        </div>
      </div>
    </div>
  </div>
);
```

**5c. Update component state** — in `PlatformApplicationsView`:

```tsx
// REMOVE these two lines:
const [togglingApp, setTogglingApp] = useState<Application | null>(null);
const [toggleSubmitting, setToggleSubmitting] = useState(false);

// ADD these two lines in their place:
const [deletingApp, setDeletingApp] = useState<Application | null>(null);
const [deleteSubmitting, setDeleteSubmitting] = useState(false);
```

**5d. Remove `handleToggleConfirm`** — delete the entire handler.

**5e. Add `handleDeleteConfirm`** in its place:

```tsx
const handleDeleteConfirm = async () => {
  if (!deletingApp) return;
  setDeleteSubmitting(true);
  try {
    const updated = await saasService.deleteApplication(deletingApp.id);
    setApplications((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setDeletingApp(null);
    setToast({ message: 'Application deleted successfully', type: 'success' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to delete application';
    setDeletingApp(null);
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

**5f. Update the Actions column** — replace the lock button section with the trash button:

```tsx
<td className="px-6 py-4 text-right">
  <div className="flex justify-end gap-1 opacity-40 group-hover:opacity-100 transition-opacity">
    <button
      type="button"
      aria-label={`Edit ${app.name}`}
      onClick={() => setEditingApp(app)}
      disabled={app.status === 'deleted'}
      className={`p-1 transition-colors ${
        app.status === 'deleted'
          ? 'opacity-50 cursor-not-allowed'
          : 'hover:text-[#ae001a]'
      }`}
    >
      <span className="material-symbols-outlined text-xl">edit</span>
    </button>
    {app.status !== 'deleted' && (
      <button
        type="button"
        aria-label={`Delete ${app.name}`}
        onClick={() => setDeletingApp(app)}
        className="p-1 hover:text-red-600 transition-colors"
      >
        <span className="material-symbols-outlined text-xl">delete</span>
      </button>
    )}
  </div>
</td>
```

**5g. Update the Status badge** — change the `inactive` fallback to a ternary with `deleted`:

```tsx
{app.status === 'active' ? (
  <span className="bg-green-500/10 text-green-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
    active
  </span>
) : app.status === 'inactive' ? (
  <span className="bg-[#5f5e5e]/20 text-[#5f5e5e] text-[10px] font-bold uppercase px-2 py-0.5 rounded">
    inactive
  </span>
) : (
  <span className="bg-red-500/10 text-red-600 text-[10px] font-bold uppercase px-2 py-0.5 rounded">
    deleted
  </span>
)}
```

**5h. Add `deleted` option to Status filter dropdown**:

```tsx
<select
  data-testid="filter-status"
  aria-label="Filter applications by state"
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

**5i. Replace the dialog mount points** — find the old `{togglingApp && <DeactivateAppDialog ... />}` and replace with:

```tsx
{deletingApp && (
  <DeleteAppDialog
    app={deletingApp}
    submitting={deleteSubmitting}
    onClose={() => setDeletingApp(null)}
    onConfirm={handleDeleteConfirm}
  />
)}
```

- [ ] **Step 6: Run tests and confirm all pass**

```
npx vitest run src/components/SaaSDashboard/PlatformApplicationsView.test.tsx
```

Expected: all tests PASS. Count will be lower than before (removed 7 deactivate tests) plus 9 new delete tests.

- [ ] **Step 7: Commit**

```bash
git add src/types/subscription.ts src/services/saasService.ts src/components/SaaSDashboard/PlatformApplicationsView.tsx src/components/SaaSDashboard/PlatformApplicationsView.test.tsx
git commit -m "feat: add logical delete to platform applications, replace deactivate with trash icon"
```

---

## Task 2: Status field in Edit modal

**Files:**
- Modify: `src/services/saasService.ts`
- Modify: `src/components/SaaSDashboard/PlatformApplicationsView.tsx`
- Test: `src/components/SaaSDashboard/PlatformApplicationsView.test.tsx`

**Interfaces:**
- Consumes: `Application.status` is `'active' | 'inactive' | 'deleted'` (from Task 1)
- Produces: `updateApplication(app, updates: { name, description, category, status: 'active' | 'inactive' })`

---

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block at the end of `PlatformApplicationsView.test.tsx`:

```ts
describe('PlatformApplicationsView — edit application status', () => {
  beforeEach(() => {
    vi.mocked(saasService.getApplications).mockResolvedValue(MOCK_APPS);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('Edit modal renders a Status select pre-populated with the app current status', async () => {
    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Reporting Suite')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Edit Reporting Suite' }));

    const statusSelect = screen.getByRole('combobox', { name: /^status$/i });
    expect(statusSelect).toBeInTheDocument();
    expect((statusSelect as HTMLSelectElement).value).toBe('inactive');
  });

  it('saving the edit modal calls updateApplication with the selected status', async () => {
    const updated = { ...MOCK_APPS[2], status: 'active' as const };
    vi.mocked(saasService.updateApplication).mockResolvedValue(updated);

    const user = userEvent.setup();
    renderView();
    await waitFor(() => expect(screen.getByText('Reporting Suite')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Edit Reporting Suite' }));
    await user.selectOptions(screen.getByRole('combobox', { name: /^status$/i }), 'active');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(saasService.updateApplication).toHaveBeenCalledWith(
        MOCK_APPS[2],
        expect.objectContaining({ status: 'active' }),
      );
    });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```
npx vitest run src/components/SaaSDashboard/PlatformApplicationsView.test.tsx
```

Expected: 2 new tests FAIL (`Edit modal renders a Status select` and `saving the edit modal calls updateApplication with the selected status`).

- [ ] **Step 3: Update `updateApplication` in `saasService.ts`**

Find the `updateApplication` method and change its signature + body to include status:

```ts
// BEFORE
async updateApplication(
  app: Application,
  updates: { name: string; description: string; category: string },
): Promise<Application> {
  const response = await saasApiFetch<{ data: Application }>(
    `applications/${app.id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: updates.name,
        description: updates.description,
        category: updates.category,
        status: app.status,
      }),
    },
  );
  return response.data;
},

// AFTER
async updateApplication(
  app: Application,
  updates: { name: string; description: string; category: string; status: 'active' | 'inactive' },
): Promise<Application> {
  const response = await saasApiFetch<{ data: Application }>(
    `applications/${app.id}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: updates.name,
        description: updates.description,
        category: updates.category,
        status: updates.status,
      }),
    },
  );
  return response.data;
},
```

- [ ] **Step 4: Add Status field to `EditAppDialog` and update its `onSave` type**

In `PlatformApplicationsView.tsx`:

**4a. Update `EditAppDialogProps`:**

```tsx
interface EditAppDialogProps {
  app: Application;
  submitting: boolean;
  onClose: () => void;
  onSave: (updates: { name: string; description: string; category: string; status: 'active' | 'inactive' }) => void;
}
```

**4b. Add `status` state inside `EditAppDialog`:**

```tsx
const EditAppDialog: React.FC<EditAppDialogProps> = ({ app, submitting, onClose, onSave }) => {
  const [name, setName] = React.useState(app.name);
  const [description, setDescription] = React.useState(app.description);
  const [category, setCategory] = React.useState(app.category);
  const [status, setStatus] = React.useState<'active' | 'inactive'>(
    app.status === 'deleted' ? 'active' : app.status
  );

  const isValid = name.trim() !== '' && category.trim() !== '';
  // ...
```

**4c. Add Status select field** inside the form, after the Category field and before the action buttons:

```tsx
          <div className="space-y-1.5">
            <label
              htmlFor="edit-status"
              className="text-[11px] font-bold uppercase tracking-widest text-[#5f5e5e]"
            >
              Status
            </label>
            <select
              id="edit-status"
              aria-label="Status"
              value={status}
              onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
              className="w-full px-3 py-2 border border-[#e8e2d8] bg-[#fef9f1] text-sm text-[#1d1c17] focus:border-[#ae001a] outline-none transition-all"
            >
              <option value="active">active</option>
              <option value="inactive">inactive</option>
            </select>
          </div>
```

**4d. Update the `onSave` call** inside the Save Changes button to include `status`:

```tsx
onClick={() => onSave({ name: name.trim(), description: description.trim(), category: category.trim(), status })}
```

**4e. Update `handleEditSave` in `PlatformApplicationsView`** to accept the new signature:

```tsx
const handleEditSave = async (updates: { name: string; description: string; category: string; status: 'active' | 'inactive' }) => {
  if (!editingApp) return;
  setEditSubmitting(true);
  try {
    const updated = await saasService.updateApplication(editingApp, updates);
    setApplications((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    setEditingApp(null);
    setToast({ message: 'Application updated successfully', type: 'success' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to update application';
    setEditingApp(null);
    if (msg === 'SESSION_EXPIRED') {
      setToast({ message: 'Session expired. Please refresh the page to sign in again.', type: 'error' });
    } else {
      setToast({ message: msg, type: 'error' });
    }
  } finally {
    setEditSubmitting(false);
  }
};
```

- [ ] **Step 5: Run tests and confirm all pass**

```
npx vitest run src/components/SaaSDashboard/PlatformApplicationsView.test.tsx
```

Expected: all tests PASS including the 2 new edit-status tests.

- [ ] **Step 6: Commit**

```bash
git add src/services/saasService.ts src/components/SaaSDashboard/PlatformApplicationsView.tsx src/components/SaaSDashboard/PlatformApplicationsView.test.tsx
git commit -m "feat: add status field to edit application modal"
```
