// admin/ui/supabase-client.js
// Supabase-backed API layer for the admin SPA.
// Loaded after the Supabase CDN script (window.supabase.createClient available).
//
// Exposes window.SB with methods matching the old Express API response shapes,
// so app.js needs only call-site changes — not structural refactoring.

(function () {
  'use strict';

  // ── Config ────────────────────────────────────────────
  // Replaced at deploy time or set via <meta> tags.
  const SUPABASE_URL  = document.querySelector('meta[name="supabase-url"]')?.content  || '__SUPABASE_URL__';
  const SUPABASE_KEY  = document.querySelector('meta[name="supabase-key"]')?.content  || '__SUPABASE_ANON_KEY__';

  const { createClient } = window.supabase;
  const client = createClient(SUPABASE_URL, SUPABASE_KEY);

  let _user = null;    // cached auth.users row
  let _profile = null; // cached profiles row
  let _lastAuthCheck = 0;
  const AUTH_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes

  // ── Internals ─────────────────────────────────────────

  // Turn a raw upload XHR error into a friendly, actionable message.
  function _uploadError(err, file) {
    let msg = err.message || 'Upload failed';
    if (err.status === 413 || /exceeded|too large|maximum size|payload/i.test(msg)) {
      msg = `File too large for storage (${(file.size / 1024 / 1024).toFixed(0)} MB). Raise the "page-images" bucket file-size limit in Supabase → Storage → Buckets → page-images → Edit.`;
    }
    return new Error(msg);
  }

  async function getUser() {
    const now = Date.now();
    if (_user && (now - _lastAuthCheck) < AUTH_CHECK_INTERVAL) {
      return _user;
    }
    // Re-validate session
    const { data: { session } } = await client.auth.getSession();
    if (!session) {
      _user = null;
      _profile = null;
      throw new Error('SESSION_EXPIRED');
    }
    _user = session.user;
    _lastAuthCheck = now;
    return _user;
  }

  // ── Retry wrapper with auth recovery ──────────────────

  async function withRetry(fn, maxRetries = 2) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const isAuthError = err.message === 'SESSION_EXPIRED' ||
                            err.message === 'Not authenticated' ||
                            err.message?.includes('JWT expired') ||
                            err.message?.includes('Invalid token');
        const isNetworkError = err.message?.includes('Failed to fetch') ||
                               err.message?.includes('NetworkError') ||
                               err.message?.includes('Load failed');

        if (isAuthError && attempt < maxRetries) {
          // Try to refresh the session
          const { data: { session } } = await client.auth.getSession();
          if (session) {
            _user = session.user;
            _lastAuthCheck = Date.now();
            continue; // retry
          }
          // Session truly dead — notify UI
          window.dispatchEvent(new CustomEvent('scrollycms:auth-expired'));
          throw err;
        }
        if (isNetworkError && attempt < maxRetries) {
          // Exponential backoff
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
          continue;
        }
        throw err; // non-retryable or max retries exceeded
      }
    }
  }

  async function getProfile() {
    if (_profile) return _profile;
    const user = await getUser();
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();
    if (error) throw new Error(error.message);
    _profile = data;
    return data;
  }

  // Resolve page slug → pages row (owned by current user)
  async function getPageRow(slug) {
    const user = await getUser();
    const { data, error } = await client
      .from('pages')
      .select('*')
      .eq('user_id', user.id)
      .eq('slug', slug)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  // ── Public API ────────────────────────────────────────

  window.SB = {
    client,   // raw Supabase client for edge cases

    // ─── Auth ───

    async checkSession() {
      const { data: { session } } = await client.auth.getSession();
      return { loggedIn: !!session };
    },

    async login(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message);
      _user = data.user;
      _profile = null;  // force re-fetch
      return { ok: true };
    },

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

    async resendConfirmation(email) {
      const { error } = await client.auth.resend({ type: 'signup', email });
      if (error) throw new Error(error.message);
      return { ok: true };
    },

    async requestPasswordReset(email) {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/admin`,
      });
      if (error) throw new Error(error.message);
      return { ok: true };
    },

    async updatePassword(newPassword) {
      const { data, error } = await client.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      _user = data.user;
      return { ok: true };
    },

    async logout() {
      await client.auth.signOut();
      _user = null;
      _profile = null;
      return { ok: true };
    },

    async getProfile() { return getProfile(); },

    async updateProfile(updates) {
      const user = await getUser();
      const { data, error } = await client
        .from('profiles')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', user.id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      _profile = data;
      return data;
    },

    // ─── Pages CRUD ───

    async listPages() {
      return withRetry(async () => {
        const user = await getUser();
        const { data, error } = await client
          .from('pages')
          .select('id, slug, title, published, version, updated_at')
          .eq('user_id', user.id)
          .order('created_at');
        if (error) throw new Error(error.message);
        // Return shape: { pages: [...slugs], pageRows: [...full rows] }
        return { pages: data.map(p => p.slug), pageRows: data };
      });
    },

    async getPage(slug) {
      return withRetry(async () => {
        const row = await getPageRow(slug);
        // Return the content JSONB — same shape as old `GET /admin/api/pages/:id`
        const doc = row.content || { blocks: [] };
        doc.version = row.version;
        doc.id = row.slug;
        doc.lang = row.lang || doc.lang || 'de';
        doc.meta = row.meta || doc.meta || {};
        return doc;
      });
    },

    // Quiet autosave — saves content without publishing or creating history
    async autoSave(slug, doc) {
      return withRetry(async () => {
        const user = await getUser();
        const row = await getPageRow(slug);

        // Deep-clone the doc to avoid serialisation of live object references
        const payload = JSON.parse(JSON.stringify(doc));

        const { data, error } = await client
          .from('pages')
          .update({
            content: payload,
            lang: payload.lang || 'en',
            meta: payload.meta || {},
            // title column is managed exclusively by renamePage/createPage —
            // don't overwrite here or every autosave undoes a manual rename
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
          .select('id, version')
          .single();

        if (error) throw new Error(error.message);
        if (!data) throw new Error('Autosave failed — row not updated (RLS?)');
        console.debug('[autosave]', slug, 'blocks:', payload.blocks?.length);
        return { ok: true, version: doc.version || row.version };
      });
    },

    // Full publish — snapshots history, bumps version, sets published=true
    async saveDraft(slug, doc) {
      return withRetry(async () => {
        const user = await getUser();
        const row = await getPageRow(slug);

        // Snapshot current version to history (non-blocking — don't let history failure block publish)
        try {
          const { error: hErr } = await client.from('page_history').insert({
            page_id: row.id,
            content: row.content,
            version: row.version,
          });
          if (hErr) console.warn('[publish] History snapshot failed:', hErr.message);
        } catch (e) {
          console.warn('[publish] History snapshot error:', e.message);
        }

        // Prune history — keep only last 10 snapshots
        const { data: allHistory } = await client
          .from('page_history')
          .select('id, created_at')
          .eq('page_id', row.id)
          .order('created_at', { ascending: false });
        if (allHistory && allHistory.length > 10) {
          const toDelete = allHistory.slice(10).map(h => h.id);
          await client.from('page_history').delete().in('id', toDelete);
        }

        // Bump version and save
        const newVersion = (row.version || 0) + 1;
        doc.version = newVersion;

        // Deep-clone to avoid serialising live object references
        const payload = JSON.parse(JSON.stringify(doc));

        const { data, error } = await client
          .from('pages')
          .update({
            content: payload,
            version: newVersion,
            lang: payload.lang || 'en',
            meta: payload.meta || {},
            // title column is managed exclusively by renamePage/createPage —
            // don't overwrite here or every publish undoes a manual rename
            published: true,
            published_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', row.id)
          .select('id, version')
          .single();

        if (error) throw new Error(error.message);
        if (!data) throw new Error('Publish failed — row not updated (RLS?)');
        console.debug('[publish]', slug, 'v' + newVersion, 'blocks:', payload.blocks?.length);
        return { ok: true, version: newVersion };
      });
    },

    async createPage(slug, title, theme) {
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
    },

    async renamePage(slug, newTitle) {
      return withRetry(async () => {
        const row = await getPageRow(slug);
        const { error } = await client
          .from('pages')
          .update({ title: newTitle, updated_at: new Date().toISOString() })
          .eq('id', row.id);
        if (error) throw new Error(error.message);
        return { ok: true };
      });
    },

    async deletePage(slug) {
      const row = await getPageRow(slug);
      const { error } = await client.from('pages').delete().eq('id', row.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    },

    // ─── History ───

    async listHistory(slug) {
      const row = await getPageRow(slug);
      const { data, error } = await client
        .from('page_history')
        .select('id, version, created_at, content')
        .eq('page_id', row.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw new Error(error.message);
      return {
        snapshots: data.map(h => {
          const content = h.content || {};
          const blocks = content.blocks || [];
          const blockSummary = blocks.map(b => b.type).join(', ') || 'empty';
          return {
            id: h.id,
            ts: h.created_at,
            version: h.version,
            blockCount: blocks.length,
            blockSummary,
          };
        }),
      };
    },

    async restoreSnapshot(slug, historyId) {
      const row = await getPageRow(slug);

      // Get the history entry
      const { data: hist, error: hErr } = await client
        .from('page_history')
        .select('content, version')
        .eq('id', historyId)
        .single();
      if (hErr) throw new Error(hErr.message);

      // Restore (no pre-restore snapshot — restoring doesn't create a new history entry)
      const newVersion = (row.version || 0) + 1;
      const doc = hist.content;
      doc.version = newVersion;

      const { error } = await client
        .from('pages')
        .update({
          content: doc,
          version: newVersion,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      if (error) throw new Error(error.message);
      return { ok: true, version: newVersion };
    },

    // ─── Image Storage ───

    // uploadFile(file, onProgress?) — onProgress(percent 0-100) called during upload.
    // Uses raw XHR against the Storage REST endpoint so we get real upload progress
    // AND the server's actual error body (supabase-js swallows the 400 message).
    async uploadFile(file, onProgress) {
      const user = await getUser();
      const { data: { session } } = await client.auth.getSession();
      if (!session) throw new Error('SESSION_EXPIRED');

      // Hash-based filename (same logic as old server)
      const buf = await file.arrayBuffer();
      const hashArray = await crypto.subtle.digest('SHA-256', buf);
      const hash = Array.from(new Uint8Array(hashArray)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
      const ext = (file.name.match(/\.[a-z0-9]+$/i) || ['.bin'])[0].toLowerCase();
      const path = `${user.id}/${hash}${ext}`;

      const endpoint = `${SUPABASE_URL}/storage/v1/object/page-images/${path}`;

      // One XHR attempt with a given content-type. Resolves {ok} or rejects {status,msg}.
      const attempt = (contentType) => new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', endpoint, true);
        xhr.setRequestHeader('authorization', `Bearer ${session.access_token}`);
        xhr.setRequestHeader('apikey', SUPABASE_KEY);
        xhr.setRequestHeader('x-upsert', 'true');
        xhr.setRequestHeader('content-type', contentType);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && typeof onProgress === 'function') {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) { resolve(); return; }
          let msg = `HTTP ${xhr.status}`;
          try {
            const body = JSON.parse(xhr.responseText);
            msg = body.message || body.error || msg;
          } catch (_) { if (xhr.responseText) msg += ': ' + xhr.responseText.slice(0, 200); }
          const err = new Error(msg); err.status = xhr.status; reject(err);
        };
        xhr.onerror = () => { const e = new Error('network error'); e.status = 0; reject(e); };
        xhr.send(file);
      });

      // 3D models / unknown types: try octet-stream first.
      const is3D = /\.(glb|gltf|stl|obj|fbx|usdz)$/i.test(file.name);
      const primaryType = (is3D || !file.type) ? 'application/octet-stream' : file.type;
      try {
        await attempt(primaryType);
      } catch (e1) {
        // If the bucket's MIME allow-list rejected it, retry as an allow-listed type.
        // Loaders parse by bytes, so the stored content-type header is irrelevant.
        const mimeRejected = e1.status === 400 || e1.status === 415 || /mime|content.?type|not supported|not allowed/i.test(e1.message);
        if (mimeRejected) {
          try { await attempt('image/png'); }
          catch (e2) { throw _uploadError(e2, file); }
        } else {
          throw _uploadError(e1, file);
        }
      }

      // Try public URL first — works when the bucket is set to public
      const { data: { publicUrl } } = client.storage
        .from('page-images')
        .getPublicUrl(path);

      // Verify the public URL is reachable (HEAD request).
      // If the bucket isn't public, getPublicUrl() still returns a URL but it 400s/403s.
      let url = publicUrl;
      try {
        const check = await fetch(publicUrl, { method: 'HEAD', mode: 'cors' });
        if (!check.ok) throw new Error('not public');
      } catch (_) {
        // Bucket is not public — fall back to a signed URL (valid 1 year)
        const { data: signedData, error: signedErr } = await client.storage
          .from('page-images')
          .createSignedUrl(path, 60 * 60 * 24 * 365);
        if (!signedErr && signedData?.signedUrl) {
          url = signedData.signedUrl;
          console.warn('[upload] Bucket not public — using signed URL. Set page-images bucket to public for permanent URLs.');
        }
        // If signed URL also fails, fall back to the public URL anyway —
        // it may work in the rendered page context even if HEAD fails from admin
      }

      return { ok: true, url, path, size: file.size, mime: file.type };
    },

    // Alias for backward compat
    async uploadImage(file) { return this.uploadFile(file); },

    async listFiles(filter) {
      const user = await getUser();
      const { data, error } = await client.storage
        .from('page-images')
        .list(user.id, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
      if (error) throw new Error(error.message);

      const PATTERNS = {
        image: /\.(png|jpe?g|webp|gif|svg)$/i,
        audio: /\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i,
        video: /\.(mp4|webm|mov|avi)$/i,
        all:   /\.[a-z0-9]+$/i,
      };
      const regex = PATTERNS[filter] || PATTERNS.all;

      const files = (data || [])
        .filter(f => regex.test(f.name))
        .map(f => {
          const { data: { publicUrl } } = client.storage
            .from('page-images')
            .getPublicUrl(`${user.id}/${f.name}`);
          return { url: publicUrl, size: f.metadata?.size || 0, name: f.name };
        });

      return { files, images: files };
    },

    // Alias for backward compat
    async listImages() { return this.listFiles('image'); },

    // ─── AI Generation (via Cloudflare Workers AI — no API key needed) ───

    async generate({ type, prompt, images, currentData, mode, pageId, lang, direct }) {
      return withRetry(async () => {
        const { data: { session } } = await client.auth.getSession();
        if (!session) throw new Error('SESSION_EXPIRED');

        const payload = { type, prompt, images, currentData, mode, pageId, lang };
        if (direct) payload.direct = true;
        // Forward the workspace AI model preference (set in ⚙ Settings → AI Model)
        const preferredModel = localStorage.getItem('scrollycms_ai_model');
        if (preferredModel) payload.model = preferredModel;

        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Generation failed (${res.status})`);
        }
        return res.json();
      });
    },
  };

  // ── Auth state listener ───────────────────────────────
  client.auth.onAuthStateChange((event, session) => {
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
})();
