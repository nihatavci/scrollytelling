# Admin Auth: Required Signup → Email Confirmation → Login

**Date:** 2026-06-09
**Status:** Approved (pending spec review)

## Problem

The admin SPA (`/admin`) does not require login. On load, `checkSession()` calls
`showAppWithAuth()`, which reveals the entire editor behind only a small inline login
bar — no hard gate. A logged-out user can open "New page", fill the form, and only hits
a raw `SESSION_EXPIRED` error on submit (thrown by `getUser()` when
`client.auth.getSession()` returns null).

Separately, signup does not reliably go through email confirmation: `signup()` only shows
the "check your email" panel when `needsConfirmation` (`!data.session`) is true. With the
Supabase project's "Confirm email" setting OFF, signup returns a live session and the code
calls `showApp()` — dropping the user straight into the editor with no confirmation.

## Goal

A standard, secure auth flow:

1. Logged-out users see **only** the auth screen — no editor access.
2. New users **must** sign up, then **confirm their email** before they can log in.
3. After confirming, they return to `/admin`, log in, and get full editor access
   (including page creation).
4. Support **forgot password** (reset via email link) and **resend confirmation email**.

## What already exists (reused, not rebuilt)

- Full-screen `#auth` gate with Sign in / Create account tabs — `admin/ui/index.html:19-49`.
- `login-form`, `signup-form` (with display name), and an `#auth-success`
  "Check your email for a confirmation link" panel.
- `showAuth()` / `showApp()` toggles — `admin/ui/app.js:2067-2076`.
- `SB.login()`, `SB.signup()`, `SB.logout()`, `SB.checkSession()` — `admin/ui/supabase-client.js:122-153`.
- `onAuthStateChange` listener — `admin/ui/supabase-client.js:547`.

No new screens are needed. Changes are targeted wiring fixes + two small new sub-forms.

## Changes

### 1. Enforce the login gate (code)
- `admin/ui/app.js` `checkSession()`: when not logged in, call `showAuth()` (full-screen
  gate) instead of `showAppWithAuth()`.
- Retire the inline-login-bar path: remove `showAppWithAuth()` and `showInlineAuth()` /
  `dismissInlineAuth()` (and the `showApp()` call to `dismissInlineAuth()`), since the gate
  replaces them. Verify no other callers remain.

**Result:** logged-out users see only the auth card. No editor, no "New page", no raw
`SESSION_EXPIRED`.

### 2. Always route signup through confirmation (code + dashboard)
- `admin/ui/supabase-client.js` `signup()`: add
  `emailRedirectTo: \`${location.origin}/admin\`` to the `signUp` options.
- The existing signup form handler already shows `#auth-success` when `needsConfirmation`
  is true. With "Confirm email" ON, `data.session` is null → panel always shows.
- After the user clicks the confirmation link, they land on `/admin`, the gate shows, and
  they sign in.

### 3. Friendly auth errors (code, small)
- Wrap `createPage` (`admin/ui/supabase-client.js:289`) in `withRetry`, matching the other
  write methods, so a stale session attempts recovery and otherwise fires the existing
  `scrollycms:auth-expired` toast instead of dumping `SESSION_EXPIRED`.
- In the login form handler, surface Supabase's "Email not confirmed" error clearly so a
  user who tries to log in before confirming understands why.

### 4. Forgot password (code + small markup)
- Add a **"Forgot password?"** link on the login form. It reveals a small email-entry
  sub-form in the auth card (new markup, reusing auth-card styles).
- New `SB.requestPasswordReset(email)` →
  `client.auth.resetPasswordForEmail(email, { redirectTo: \`${location.origin}/admin\` })`.
  Always show a neutral "If that email exists, we sent a reset link" confirmation
  (no account enumeration).
- The reset link lands on `/admin` with a recovery token. The existing `onAuthStateChange`
  listener handles a new `PASSWORD_RECOVERY` event → dispatch a `scrollycms:password-recovery`
  custom event → app shows a **"Set a new password"** sub-form (new markup).
- New `SB.updatePassword(newPwd)` → `client.auth.updateUser({ password: newPwd })` →
  on success, proceed to the editor (the recovery event establishes a session).

### 5. Resend confirmation (code + small markup)
- Add a **"Resend confirmation email"** button to the `#auth-success` panel
  (`admin/ui/index.html:44`).
- Keep the signup email in memory after signup so resend has the address.
- New `SB.resendConfirmation(email)` → `client.auth.resend({ type: 'signup', email })`.
- Show a neutral confirmation after sending; debounce/disable the button briefly to respect
  Supabase rate limits.

### 6. Supabase dashboard (manual — performed by the user)
- **Authentication → Sign In / Providers → Email**: set **Confirm email = ON**.
- **Authentication → URL Configuration → Redirect URLs**: add `http://localhost:4000/admin`
  (and the production admin URL when deployed).
- Built-in email is rate-limited (~2–4/hour). Add SMTP before onboarding real users.

## New / changed surface

| Location | Change |
|---|---|
| `admin/ui/index.html` | Forgot-password sub-form, set-new-password sub-form, resend button in `#auth-success` |
| `admin/ui/app.js` | Gate via `showAuth()`; remove inline-bar fns; forgot/reset/resend handlers; `scrollycms:password-recovery` handling; clearer login error |
| `admin/ui/supabase-client.js` | `emailRedirectTo` in `signup()`; `requestPasswordReset()`, `updatePassword()`, `resendConfirmation()`; `PASSWORD_RECOVERY` in `onAuthStateChange`; wrap `createPage` in `withRetry` |
| Supabase dashboard | Confirm email ON; redirect URLs; (later) SMTP |

## Flows

**Signup:** Create account → "Check your email" (with Resend) → click link → `/admin` →
Sign in → editor.

**Login before confirming:** clear "Email not confirmed — check your inbox" message.

**Forgot password:** Sign in → "Forgot password?" → enter email → neutral confirmation →
click email link → `/admin` recovery → "Set a new password" → editor.

## Out of scope

- Social / OAuth providers.
- Invite-only or signup allowlist.
- Profile/account management beyond display name (already captured at signup).

## Testing

- Logged-out load shows only the auth card; no editor DOM is interactive.
- Signup with confirmation ON shows the success panel and does not log in.
- Confirmation link returns to `/admin` and login succeeds afterward.
- Login before confirmation shows the "not confirmed" message.
- Forgot-password sends a reset and the recovery link shows the set-password form.
- Resend confirmation succeeds and is rate-limit-safe.
- After login, page creation works (no `SESSION_EXPIRED`).
