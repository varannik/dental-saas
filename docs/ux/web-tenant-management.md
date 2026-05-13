# Web app tenant management — step-by-step plan

This document describes a **best-practice, phased** way to handle tenants in `apps/web`, aligned with how auth and the gateway work today. Use it as an implementation checklist; adjust order if product priorities change.

## How the platform behaves today (baseline)

Before changing the web app, these constraints matter:

- **JWT carries one `tenantId` per access token.** The API gateway reads `tenantId`, `userId`, and `roles` from the token (`apps/api-gateway/src/middleware/tenant-resolver.ts`). Many routes assume a **single active tenant** per session.
- **Login and register** require a `tenantId` in the body (`services/auth`). Login only succeeds if the user is linked to that tenant in `user_tenants`.
- **`POST /api/v1/tenants`** creates a row in `tenants` but does **not** add the current user to `user_tenants`. A follow-up step (or API) must link the user, or they cannot log in to that tenant.
- **`GET /auth/me`** returns `{ user: { userId, tenantId } }` derived from the token/session (`services/auth`). It does **not** today return the full list of tenants the user belongs to.
- The web app currently hard-codes **`DEMO_TENANT_ID`** and only persists the **access token** in storage, not the active tenant.

Any “manage tenants” design should either stay within **one tenant per session** (simplest) or plan for **tenant switching** (new token or new endpoint).

---

## Principles (best practice)

1. **Source of truth:** Database tables `tenants` and `user_tenants`. The UI must not invent tenant ids.
2. **Active tenant = JWT `tenantId`:** Anything security-sensitive should rely on the token, not only on client state.
3. **Client state mirrors token after login/switch:** Persist **active `tenantId`** next to the token (or derive it after hydration via `/auth/me`) so the UI stays consistent across refresh.
4. **Creating a tenant is an admin flow:** Separate from signup; requires an authenticated user and clear rules for who becomes `ADMIN` on the new tenant.
5. **Progressive delivery:** Ship storage + `/me` sync before building full org creation UI.

---

## Phase 0 — Align on product rules (short)

Decide and document:

- Who may **create** a tenant (any logged-in user vs role-gated).
- After **create tenant**, does the creator automatically get `user_tenants` with `ADMIN`?
- Is **multi-tenant membership** required at launch (same user, multiple practices)?
- If yes: is **tenant switch** done by **re-authenticating** (login/refresh with new `tenantId`) or a dedicated **switch-tenant** API that mints a new access token?

Until multi-membership is required, you can keep a **single active tenant** and simplify the UI.

---

## Phase 1 — Session model in the web app

**Goal:** After login or refresh, the client always knows **`accessToken` + `activeTenantId`** and they stay in sync with the server.

| Step | Task                                                                                                                                                                                                                                                        |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Extend auth storage (`apps/web/src/lib/auth-storage.ts` or equivalent) to persist **`tenantId`** alongside the token (or persist only token if you always derive tenant from `/me`).                                                                        |
| 1.2  | Update **`initAuthFromStorage`** (`apps/web/src/stores/auth.store.ts`) to restore **both** `accessToken` and `tenantId` when present.                                                                                                                       |
| 1.3  | After login/register success, set session from **server truth**: prefer calling **`GET /api/v1/auth/me`** with the new token and use `user.tenantId` instead of assuming `DEMO_TENANT_ID` for the stored value (demo id can remain fallback for bootstrap). |
| 1.4  | Replace or gate **`DEMO_TENANT_ID`**: use env `NEXT_PUBLIC_DEFAULT_TENANT_ID` for local demo only; avoid shipping hard-coded ids to production without config.                                                                                              |
| 1.5  | On **401** from API calls, clear session (token + tenant) and redirect to login.                                                                                                                                                                            |

**Acceptance:** Hard refresh keeps tenant context consistent; `/auth/me` matches `tenantId` in the store.

---

## Phase 2 — Read-only tenant awareness in the UI

**Goal:** Users see **which organization** they are in.

| Step | Task                                                                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 2.1  | Add **`GET /api/v1/tenants/:tenantId`** (already on users service) from the web app with `apiFetch(..., { accessToken })` to load **tenant name** for the dashboard header/settings. |
| 2.2  | Handle loading/error states (unknown or deleted tenant).                                                                                                                             |
| 2.3  | Optionally extend **`/auth/me`** in the future to include **`tenantName`** to avoid an extra round-trip (backend change).                                                            |

**Acceptance:** Dashboard shows practice/tenant name for the active `tenantId`.

---

## Phase 3 — Create organization (tenant) flow

**Goal:** Authenticated user can create a **new** tenant and become able to work inside it.

Because **`POST /tenants`** does not attach the user, combine UI + API contract:

| Step | Task                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1  | **Backend (recommended):** Add a single atomic operation, e.g. `POST /tenants/with-membership` or extend `POST /tenants` with `addCreatorAsAdmin: true`, that: inserts `tenants`, inserts `user_tenants` `(current_user, new_tenant_id, 'ADMIN')`. Alternatively document two calls: `POST /tenants` then `POST /users` with the new id (weaker: second call may not map “self” cleanly). |
| 3.2  | **Web:** Settings or onboarding page: form fields aligned with **`createTenantSchema`** (`name`, `type`, optional locale fields).                                                                                                                                                                                                                                                         |
| 3.3  | On success, **obtain a token for the new tenant:** today, **`POST /auth/login`** with `tenantId: <newId>` (and same password) or implement **refresh/switch-tenant** if you add it. Update client session with new token + `tenantId`.                                                                                                                                                    |
| 3.4  | Redirect to dashboard scoped to the new tenant.                                                                                                                                                                                                                                                                                                                                           |

**Acceptance:** User ends in a session whose JWT `tenantId` is the new tenant and can call tenant-scoped APIs.

---

## Phase 4 — Multi-membership and tenant switcher (optional)

**Goal:** Same email belongs to multiple tenants; user picks active one.

| Step | Task                                                                                                                                                                                                       |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1  | **Backend:** Expose **list memberships** for the current user, e.g. `GET /users/me/tenants` or auth-side `GET /auth/tenants`, returning `{ tenantId, name?, userType }[]` from `user_tenants` + `tenants`. |
| 4.2  | **Switch tenant:** Either **login again** with selected `tenantId` (minimal change) or add **`POST /auth/switch-tenant`** that validates membership and returns a new **access token** (better UX).        |
| 4.3  | **Web:** Header dropdown listing tenants; on switch, replace token + `tenantId` in storage and invalidate React queries tied to the old tenant.                                                            |
| 4.4  | If register flow should attach users to **invited** tenants only, stop sending a global demo `tenantId` from the client without an invite code (product decision).                                         |

**Acceptance:** Switching preserves account; data loads match the new `tenantId` in the JWT.

---

## Phase 5 — Admin: members and invitations (later)

Not required for a first tenant-management milestone, but typical next steps:

- List users in tenant: existing **`GET /api/v1/users?tenantId=`** (requires admin-capable token).
- Invite flows (email link with tenant + role) and accept-invite registration path.
- Role management (`userType` / future RBAC).

---

## Security checklist (keep while implementing)

- Never trust client-supplied `tenantId` for **authorization**; gateway must keep deriving scope from **JWT** (and services should keep validating resource ownership).
- **CORS** and **cookie/storage**: tokens in `localStorage` are XSS-sensitive; consider httpOnly cookies in a later hardening pass if product requires it.
- **`POST /tenants`**: rate-limit and optionally restrict to trusted roles when you open registration to the public internet.

---

## Suggested implementation order for the team

1. Phase 1 (session + `/me` + persist tenant id)
2. Phase 2 (display tenant name)
3. Phase 3 (create org + backend membership + re-login or switch token)
4. Phase 4 only if multi-tenant membership is in scope
5. Phase 5 as product needs grow

---

## File map (where to touch in the repo)

| Area             | Likely files / services                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| Web auth session | `apps/web/src/stores/auth.store.ts`, `apps/web/src/lib/auth-storage.ts`, `apps/web/src/hooks/use-auth.ts` |
| Login/register   | `apps/web/src/app/(auth)/login/login-form.tsx`, `apps/web/src/app/(auth)/register/page.tsx`               |
| Constants        | `apps/web/src/lib/constants.ts`, `apps/web/.env.example`                                                  |
| Tenant UI        | `apps/web/src/app/(dashboard)/settings/page.tsx`, layout/shell components                                 |
| API              | Gateway proxies: `apps/api-gateway/src/routes/users.proxy.ts`, `auth.proxy.ts`                            |
| Backend gaps     | `services/users` (tenant create + membership), `services/auth` (me, optional switch)                      |

This doc is the intended **agreement** before coding; update it if backend contracts change during implementation.
