# Register Application — Design Spec

**Date:** 2026-06-23  
**Feature:** Register new platform application from PlatformApplicationsView  
**Branch:** `rafaalejandro_subscription`

---

## Overview

SaaS Owner can register a new standalone application by filling a creation modal. The new record becomes immediately visible in the master directory grid and available for future bundling into subscription tiers.

---

## Entry Points (AC 1)

Two entry points open the same `RegisterAppDialog` modal:

1. **Primary button** — `"REGISTER APPLICATION"` red button (`bg-[#ae001a]`) in the filter strip control bar, to the right of "Clear filters".
2. **FAB** — `fixed bottom-8 right-8` inside `PlatformApplicationsView`, pencil/add icon, same visual style as the dashboard FAB in `SaaSDashboard.tsx`. Visible only when the component is mounted (i.e., when the tab is active).

---

## Modal: RegisterAppDialog (AC 2, AC 3)

### Header
Dark `#222222` bar with label `"REGISTER APPLICATION"` and close (`×`) button — identical pattern to `EditAppDialog` and `DeactivateAppDialog`.

### Form Fields

| Field | Type | Validation |
|---|---|---|
| `name` | `<input type="text">` | Required, max 100 characters. Character counter shown (e.g. `12/100`). |
| `description` | `<textarea>` | Required. No length cap. |
| `category` | `<input type="text">` | Required, max 50 characters. Character counter shown (e.g. `8/50`). Placeholder: `"e.g. POS Core, Utility, Kitchen Display"`. |
| `status` | `<select>` | Defaults to `"active"`. Options: `active`, `inactive`. |

### Validation Rules (client-side)
- Save button disabled while any required field is empty or any character limit is exceeded.
- Fields show a red border (`border-[#ae001a]`) when the limit is exceeded.
- No inline error labels needed — the disabled Save button and red border are sufficient feedback.

### Actions
- **Cancel** — closes modal, no state change.
- **Save Changes** — dispatches `createApplication`, shows spinner on button text while submitting.

---

## Service Layer

**New method in `saasService.ts`:**

```ts
async createApplication(dto: {
  name: string;
  description: string;
  category: string;
  status: 'active' | 'inactive';
}): Promise<Application>
```

- `POST /api/applications`
- Payload: `{ name, description, category, status }`
- Response: `{ data: Application }`
- Follows the same `saasApiFetch` wrapper used by all other service methods.
- Throws `SESSION_EXPIRED` on 401, generic error message on other failures.

---

## Success Flow (AC 4)

1. API responds with the created `Application` object.
2. Modal closes (`setIsCreating(false)`).
3. New row prepended to the grid: `setApplications(prev => [newApp, ...prev])`.
4. Toast: `"Application registered successfully"` (green, 3-second auto-dismiss — same pattern as edit/deactivate toasts).

---

## Error Flow

- `SESSION_EXPIRED` → toast: `"Session expired. Please refresh the page to sign in again."` (red).
- Other API error → toast with the error message (red).
- Modal closes in both cases.

---

## State Changes in PlatformApplicationsView

```ts
const [isCreating, setIsCreating] = useState(false);
const [createSubmitting, setCreateSubmitting] = useState(false);
```

`handleCreateSave` mirrors `handleEditSave` in structure.

---

## Component Isolation

`RegisterAppDialog` is a self-contained presentational component that owns its own form state (name, description, category, status). It receives:
- `submitting: boolean`
- `onClose: () => void`
- `onSave: (dto: { name, description, category, status }) => void`

No shared state with `EditAppDialog`.

---

## Out of Scope

- Image/icon upload for the application.
- Associating the new application to a plan at creation time.
- Duplicate name detection client-side (backend handles constraint violations).
