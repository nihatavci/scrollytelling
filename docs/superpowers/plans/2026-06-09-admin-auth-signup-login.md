# Admin Auth: Required Signup → Email Confirmation → Login — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin SPA require login, force new users through email confirmation before they can sign in, and add forgot-password and resend-confirmation flows.

**Architecture:** All auth UI already exists in `admin/ui/index.html` (`#auth` screen with login/signup tabs and a confirmation panel). The fixes are: (1) stop bypassing the gate in `checkSession()`, (2) wire signup/reset/resend/recovery to the Supabase JS client in `admin/ui/supabase-client.js`, and (3) add two small sub-forms to the auth card. The SPA talks directly to Supabase — no server changes.

**Tech Stack:** Vanilla JS browser SPA, `@supabase/supabase-js` v2 (loaded via CDN, exposed as `window.SB`), dev server `node dev-server.js` serving `http://localhost:4000/admin/`.

**Verification note:** This is browser DOM code wired to a live external auth provider; there is no DOM/Supabase test harness in the repo (`npm test` runs `node --test` over `tests/*.test.js`, none of which cover the SPA). Each task is therefore verified in the browser via the dev server + preview tools, not unit tests. Run `npm run dev` once and reload between tasks.

---

## Prerequisite (manual — do this first, in the Supabase dashboard)

These must be set or email confirmation and password reset will not work. The Supabase project ref is `dwdwrmdqdqikiryhgqtm` (from `admin/ui/index.html`).

- **Authentication → Sign In / Providers → Email**: set **Confirm email = ON**.
- **Authentication → URL Configuration → Redirect URLs**: add `http://localhost:4000/admin` (add the production admin URL later).
- Built-in email is rate-limited (~2–4/hour). Fine for testing; add SMTP before real users.

The code tasks below can be written before this is done, but end-to-end verification (Task 7) requires it.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `admin/ui/supabase-client.js` | Supabase API layer (`window.SB`) | `emailRedirectTo` in signup; new `requestPasswordReset`, `updatePassword`, `resendConfirmation`; `PASSWORD_RECOVERY` handling; wrap `createPage` in `withRetry` |
| `admin/ui/index.html` | Auth screen markup | Forgot-password link + email sub-form; set-new-password sub-form; resend button in `#auth-success` |
| `admin/ui/app.js` | SPA controller / event wiring | Enforce gate via `showAuth()`; remove inline-bar fns; signup email retention; forgot/reset/resend/recovery handlers; clearer login error |

---

## Task 1: Enforce the login gate

Stop revealing the editor to logged-out users. `checkSession()` currently calls `showAppWithAuth()` (inline bar). Replace with `showAuth()` (full-screen gate) and remove the now-dead inline-bar functions.

**Files:**
- Modify: `admin/ui/app.js:2059-2125` (`checkSession`, `showApp`, `showAppWithAuth`, `showInlineAuth`, `dismissInlineAuth`)

- [ ] **Step 1: Point `checkSession()` at the full gate**

Replace the body of `checkSession()` (currently `admin/ui/app.js:2059-2066`):

```javascript
async function checkSession() {
  // Password-recovery links land on /admin with a recovery token in the URL hash.
  // Don't auto-enter the editor — let the recovery handler show the set-password form.
  if (location.hash.includes('type=recovery')) {
    showAuth();
    return;
  }
  try {
    const { loggedIn } = await SB.checkSession();
    if (loggedIn) { showApp(); return; }
  } catch { /* ignore */ }
  // Not logged in — show the full-screen auth gate.
  showAuth();
}
```

- [ ] **Step 2: Remove the `dismissInlineAuth()` call from `showApp()`**

In `showApp()` (currently `admin/ui/app.js:2071-2076`), delete the `dismissInlineAuth();` line:

```javascript
function showApp() {
  document.getElementById('auth').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  loadPages();
}
```

- [ ] **Step 3: Delete the dead inline-bar functions**

Delete `showAppWithAuth()`, `showInlineAuth()`, and `dismissInlineAuth()` entirely (currently `admin/ui/app.js:2077-2125`). Leave `showAuth()` (2067-2070) intact.

- [ ] **Step 4: Verify no remaining references**

Run: `grep -n "showAppWithAuth\|showInlineAuth\|dismissInlineAuth" admin/ui/app.js`
Expected: no output (all references removed).

- [ ] **Step 5: Verify the gate in the browser**

Start the dev server if not running: `npm run dev`
Open `http://localhost:4000/admin/` in a fresh/incognito window (no session).
Expected: only the ScrollyCMS auth card (Sign in / Create account) is visible. The editor, page selector, and "New page" button are NOT present.

- [ ] **Step 6: Commit**

```bash
git add admin/ui/app.js
git commit -m "fix(auth): require login — show full-screen gate, remove inline bypass"
```

---

## Task 2: Route signup through email confirmation

Add `emailRedirectTo` so the confirmation link returns to `/admin`, and retain the signup email in memory (needed by the resend button in Task 3).

**Files:**
- Modify: `admin/ui/supabase-client.js:135-146` (`signup`)
- Modify: `admin/ui/app.js:2156-2174` (signup form handler)

- [ ] **Step 1: Add `emailRedirectTo` to `signup()`**

Replace `signup()` (currently `admin/ui/supabase-client.js:135-146`):

```javascript
    async signup(email, password, displayName) {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: `${location.origin}/admin`,
        },
      });
      if (error) throw new Error(error.message);
      // With "Confirm email" ON, data.session is null until the user confirms.
      _user = data.session ? data.user : null;
      _profile = null;
      return { ok: true, needsConfirmation: !data.session };
    },
```

- [ ] **Step 2: Retain the signup email for resend**

In the signup form handler (currently `admin/ui/app.js:2156-2174`), store the email on success so the resend button (Task 3) can use it. Replace the handler:

```javascript
// Signup
let _pendingConfirmEmail = '';
document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pwd = document.getElementById('signup-pwd').value;
  document.getElementById('signup-error').textContent = '';
  try {
    const r = await SB.signup(email, pwd, name);
    if (r.needsConfirmation) {
      _pendingConfirmEmail = email;
      document.getElementById('signup-form').classList.add('hidden');
      document.getElementById('auth-success').classList.remove('hidden');
    } else {
      showApp();
    }
  } catch (err) {
    document.getElementById('signup-error').textContent = err.message || 'Signup failed';
  }
});
```

- [ ] **Step 3: Verify signup shows the confirmation panel**

Reload `http://localhost:4000/admin/`. Click **Create account**. Enter a display name, a real email you can check, and a password (≥6 chars). Submit.
Expected (with "Confirm email" ON in Supabase): the form is replaced by the "Check your email for a confirmation link" panel — you are NOT dropped into the editor.

If "Confirm email" is still OFF in the dashboard, you'll be logged straight in instead — complete the prerequisite first to verify this properly.

- [ ] **Step 4: Commit**

```bash
git add admin/ui/supabase-client.js admin/ui/app.js
git commit -m "feat(auth): send confirmation email on signup, retain email for resend"
```

---

## Task 3: Resend confirmation email

Add a resend button to the existing `#auth-success` panel and an `SB.resendConfirmation()` method.

**Files:**
- Modify: `admin/ui/index.html:44-47` (`#auth-success` panel)
- Modify: `admin/ui/supabase-client.js` (add method near `signup`)
- Modify: `admin/ui/app.js` (wire the button, near the signup handler)

- [ ] **Step 1: Add the resend button to the success panel**

Replace the `#auth-success` block (currently `admin/ui/index.html:44-47`):

```html
    <div id="auth-success" class="auth-success hidden">
      <p>Check your email for a confirmation link, then sign in.</p>
      <button id="resend-confirm" class="small">Resend confirmation email</button>
      <p id="resend-msg" class="error" style="display:none;"></p>
      <button onclick="document.querySelector('[data-tab=login]').click()" class="small">Go to sign in</button>
    </div>
```

- [ ] **Step 2: Add `SB.resendConfirmation()`**

In `admin/ui/supabase-client.js`, add this method immediately after `signup()` (after the closing `},` of signup, before `logout()`):

```javascript
    async resendConfirmation(email) {
      const { error } = await client.auth.resend({ type: 'signup', email });
      if (error) throw new Error(error.message);
      return { ok: true };
    },
```

- [ ] **Step 3: Wire the resend button**

In `admin/ui/app.js`, immediately after the signup form handler from Task 2, add:

```javascript
// Resend confirmation
document.getElementById('resend-confirm').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  const msg = document.getElementById('resend-msg');
  if (!_pendingConfirmEmail) {
    msg.textContent = 'Sign up first, then resend.';
    msg.style.display = 'block';
    return;
  }
  btn.disabled = true;
  const original = btn.textContent;
  btn.textContent = 'Sending…';
  try {
    await SB.resendConfirmation(_pendingConfirmEmail);
    msg.style.color = '#1a7f37';
    msg.textContent = 'Sent. Check your inbox (and spam).';
  } catch (err) {
    msg.style.color = '';
    msg.textContent = err.message || 'Could not resend right now.';
  }
  msg.style.display = 'block';
  // Respect Supabase rate limits — re-enable after a short delay.
  setTimeout(() => { btn.disabled = false; btn.textContent = original; }, 20000);
});
```

- [ ] **Step 4: Verify in the browser**

Reload, sign up with a real email (as in Task 2), and on the success panel click **Resend confirmation email**.
Expected: button shows "Sending…", then a green "Sent. Check your inbox" message; a second confirmation email arrives. Button re-enables after ~20s.

- [ ] **Step 5: Commit**

```bash
git add admin/ui/index.html admin/ui/supabase-client.js admin/ui/app.js
git commit -m "feat(auth): resend confirmation email from the success panel"
```

---

## Task 4: Forgot password — request a reset

Add a "Forgot password?" link on the login form that reveals an email sub-form, and an `SB.requestPasswordReset()` method.

**Files:**
- Modify: `admin/ui/index.html:28-33` (login form — add link + reset-request sub-form)
- Modify: `admin/ui/supabase-client.js` (add method)
- Modify: `admin/ui/app.js` (wire link + sub-form, near login handler)

- [ ] **Step 1: Add the link and reset-request sub-form to the auth card**

Replace the login form block (currently `admin/ui/index.html:28-33`):

```html
    <!-- Login form -->
    <form id="login-form" class="auth-form">
      <input id="login-email" type="email" placeholder="Email" autocomplete="email" required>
      <input id="login-pwd" type="password" placeholder="Password" autocomplete="current-password" required>
      <button type="submit" class="primary">Sign in</button>
      <button type="button" id="forgot-link" class="small" style="background:none;border:none;cursor:pointer;text-decoration:underline;">Forgot password?</button>
      <div id="login-error" class="error"></div>
    </form>

    <!-- Forgot-password request form -->
    <form id="reset-request-form" class="auth-form hidden">
      <input id="reset-email" type="email" placeholder="Your account email" autocomplete="email" required>
      <button type="submit" class="primary">Send reset link</button>
      <button type="button" id="reset-cancel" class="small">Back to sign in</button>
      <div id="reset-request-msg" class="error"></div>
    </form>
```

- [ ] **Step 2: Add `SB.requestPasswordReset()`**

In `admin/ui/supabase-client.js`, add after `resendConfirmation()`:

```javascript
    async requestPasswordReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/admin`,
      });
      if (error) throw new Error(error.message);
      return { ok: true };
    },
```

- [ ] **Step 3: Wire the link and the reset-request form**

In `admin/ui/app.js`, immediately after the resend handler from Task 3, add:

```javascript
// Forgot password — toggle the request form
document.getElementById('forgot-link').addEventListener('click', () => {
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('reset-request-form').classList.remove('hidden');
  document.getElementById('reset-email').value =
    document.getElementById('login-email').value.trim();
  document.getElementById('reset-email').focus();
});
document.getElementById('reset-cancel').addEventListener('click', () => {
  document.getElementById('reset-request-form').classList.add('hidden');
  document.getElementById('login-form').classList.remove('hidden');
});
document.getElementById('reset-request-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('reset-email').value.trim();
  const msg = document.getElementById('reset-request-msg');
  try {
    await SB.requestPasswordReset(email);
  } catch { /* ignore — never reveal whether the account exists */ }
  // Neutral message regardless of outcome (no account enumeration).
  msg.style.color = '#1a7f37';
  msg.textContent = 'If that email has an account, we sent a reset link.';
});
```

- [ ] **Step 4: Verify in the browser**

Reload. On the Sign in tab, click **Forgot password?** — the email sub-form appears. Enter your account email, click **Send reset link**.
Expected: a green "If that email has an account, we sent a reset link." message, and a reset email arrives. **Back to sign in** returns to the login form.

- [ ] **Step 5: Commit**

```bash
git add admin/ui/index.html admin/ui/supabase-client.js admin/ui/app.js
git commit -m "feat(auth): forgot-password request flow"
```

---

## Task 5: Forgot password — set a new password (recovery)

When the user clicks the reset link, they land on `/admin` with a recovery token and Supabase fires a `PASSWORD_RECOVERY` event. Show a "Set a new password" form and call `SB.updatePassword()`.

**Files:**
- Modify: `admin/ui/index.html` (add set-new-password sub-form inside the auth card)
- Modify: `admin/ui/supabase-client.js:547-557` (`onAuthStateChange` — dispatch recovery event) and add `updatePassword()`
- Modify: `admin/ui/app.js` (recovery handler + form wiring)

- [ ] **Step 1: Add the set-new-password sub-form**

In `admin/ui/index.html`, add this block right after the `reset-request-form` added in Task 4 (still inside `.auth-card`):

```html
    <!-- Set a new password (shown on recovery link) -->
    <form id="set-password-form" class="auth-form hidden">
      <p style="font-size:13px;color:#57606a;">Choose a new password for your account.</p>
      <input id="new-pwd" type="password" placeholder="New password (min 6 chars)" autocomplete="new-password" minlength="6" required>
      <button type="submit" class="primary">Set password &amp; continue</button>
      <div id="set-password-error" class="error"></div>
    </form>
```

- [ ] **Step 2: Dispatch a recovery event from `onAuthStateChange`**

Replace the listener (currently `admin/ui/supabase-client.js:547-557`):

```javascript
  // ── Auth state listener ───────────────────────────────
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      _user = session?.user || null;
      window.dispatchEvent(new CustomEvent('scrollycms:password-recovery'));
      return;
    }
    if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
      _user = null;
      _profile = null;
      window.dispatchEvent(new CustomEvent('scrollycms:auth-expired'));
    }
    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
      _user = session.user;
      _lastAuthCheck = Date.now();
    }
  });
```

- [ ] **Step 3: Add `SB.updatePassword()`**

In `admin/ui/supabase-client.js`, add after `requestPasswordReset()`:

```javascript
    async updatePassword(newPassword) {
      const { data, error } = await client.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      _user = data.user;
      return { ok: true };
    },
```

- [ ] **Step 4: Handle the recovery event and wire the form**

In `admin/ui/app.js`, immediately after the reset-request handler from Task 4, add:

```javascript
// Password recovery — show the set-password form when the recovery link is used
window.addEventListener('scrollycms:password-recovery', () => {
  showAuth();
  document.getElementById('login-form').classList.add('hidden');
  document.getElementById('signup-form').classList.add('hidden');
  document.getElementById('reset-request-form').classList.add('hidden');
  document.getElementById('auth-success').classList.add('hidden');
  document.getElementById('set-password-form').classList.remove('hidden');
  document.getElementById('new-pwd').focus();
});
document.getElementById('set-password-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pwd = document.getElementById('new-pwd').value;
  document.getElementById('set-password-error').textContent = '';
  try {
    await SB.updatePassword(pwd);
    // Clear the recovery token from the URL, then enter the editor.
    history.replaceState(null, '', '/admin');
    document.getElementById('new-pwd').value = '';
    showApp();
  } catch (err) {
    document.getElementById('set-password-error').textContent = err.message || 'Could not update password.';
  }
});
```

- [ ] **Step 5: Verify the full reset round-trip in the browser**

Trigger a reset (Task 4) for a confirmed account, then open the reset link from the email — it opens `http://localhost:4000/admin/#...type=recovery...`.
Expected: the "Set a new password" form appears (not the editor, not the login form). Enter a new password, submit.
Expected: you land in the editor, and the URL hash is cleared. Sign out and sign back in with the new password to confirm it persisted.

- [ ] **Step 6: Commit**

```bash
git add admin/ui/index.html admin/ui/supabase-client.js admin/ui/app.js
git commit -m "feat(auth): set-new-password recovery flow"
```

---

## Task 6: Friendly auth errors

Make `createPage` recover/notify like other write methods, and make "email not confirmed" login failures clear.

**Files:**
- Modify: `admin/ui/supabase-client.js:289-316` (`createPage`)
- Modify: `admin/ui/app.js:2140-2154` (login form handler)

- [ ] **Step 1: Wrap `createPage` in `withRetry`**

Replace `createPage()` (currently `admin/ui/supabase-client.js:289-316`):

```javascript
    async createPage(slug, title, theme) {
      return withRetry(async () => {
        const user = await getUser();
        const content = {
          id: slug,
          version: 1,
          lang: 'de',
          theme: theme || 'dia',
          meta: { title: title || slug },
          blocks: [],
        };
        const { data, error } = await client
          .from('pages')
          .insert({
            user_id: user.id,
            slug,
            title: title || slug,
            content,
            lang: 'de',
            meta: { title: title || slug },
          })
          .select()
          .single();
        if (error) {
          if (error.code === '23505') throw new Error('A page with this URL already exists.');
          throw new Error(error.message);
        }
        return { ok: true, id: data.slug, version: 1 };
      });
    },
```

- [ ] **Step 2: Clarify the login error for unconfirmed accounts**

Replace the login form handler (currently `admin/ui/app.js:2140-2154`):

```javascript
// Login
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const pwd = document.getElementById('login-pwd').value;
  document.getElementById('login-error').textContent = '';
  try {
    await SB.login(email, pwd);
    localStorage.setItem('scrollycms_email', email);
    document.getElementById('login-email').value = '';
    document.getElementById('login-pwd').value = '';
    showApp();
  } catch (err) {
    const raw = err.message || 'Login failed';
    document.getElementById('login-error').textContent =
      /not confirmed|confirm/i.test(raw)
        ? 'Please confirm your email first — check your inbox for the confirmation link.'
        : raw;
  }
});
```

- [ ] **Step 3: Verify**

Browser: with a created-but-unconfirmed account, try to sign in.
Expected: the friendly "Please confirm your email first…" message (not a raw Supabase error).
Then confirm the account, sign in, and create a page — it succeeds with no `SESSION_EXPIRED`.

- [ ] **Step 4: Commit**

```bash
git add admin/ui/supabase-client.js admin/ui/app.js
git commit -m "fix(auth): friendlier createPage recovery and unconfirmed-login message"
```

---

## Task 7: End-to-end verification

Confirm the whole flow works against the configured Supabase project (prerequisite must be done).

**Files:** none (verification only)

- [ ] **Step 1: Confirm the Supabase prerequisite is applied**

In the Supabase dashboard, verify Email → "Confirm email" is ON and `http://localhost:4000/admin` is in the Redirect URLs allowlist.

- [ ] **Step 2: Full happy path**

In a fresh/incognito window at `http://localhost:4000/admin/`:
1. Only the auth card is visible (no editor). ✓
2. Create account → "Check your email" panel (no auto-login). ✓
3. Click the confirmation link → returns to `/admin`. ✓
4. Sign in → editor loads. ✓
5. Click "New page", create a page → success, no `SESSION_EXPIRED`. ✓

- [ ] **Step 3: Edge paths**

1. Sign in before confirming → friendly "confirm your email" message. ✓
2. Resend confirmation → second email arrives. ✓
3. Forgot password → reset email → set-new-password form → new password works on next sign-in. ✓
4. Log out → back to the auth gate; reloading does not expose the editor. ✓

- [ ] **Step 4: Capture proof and finish**

Use the preview tools to screenshot the gate (logged out) and the editor (after login) for the record. No commit needed (verification only).

---

## Self-Review Notes

- **Spec coverage:** gate (Task 1), signup confirmation (Task 2), resend (Task 3), forgot-password request (Task 4), recovery/set-password (Task 5), friendly errors + createPage (Task 6), dashboard prerequisite + E2E (prerequisite + Task 7). All spec sections mapped.
- **Type/name consistency:** new `SB` methods `resendConfirmation`, `requestPasswordReset`, `updatePassword` are defined in supabase-client.js and called by matching names in app.js. Events `scrollycms:password-recovery` (dispatched in client, handled in app) and existing `scrollycms:auth-expired` are consistent. Module variable `_pendingConfirmEmail` defined in Task 2, used in Task 3. Element IDs (`resend-confirm`, `reset-request-form`, `reset-email`, `set-password-form`, `new-pwd`, `forgot-link`, `reset-cancel`) are defined in index.html and referenced by the same IDs in app.js.
- **No placeholders:** every code step shows full code; every verification step states expected browser outcome.
