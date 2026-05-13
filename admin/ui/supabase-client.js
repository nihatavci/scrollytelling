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

  // ── Internals ─────────────────────────────────────────

  async function getUser() {
    if (_user) return _user;
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) throw new Error('Not authenticated');
    _user = user;
    return user;
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
        options: { data: { display_name: displayName } },
      });
      if (error) throw new Error(error.message);
      // If email confirmation is off, user is immediately logged in
      _user = data.user;
      _profile = null;
      return { ok: true, needsConfirmation: !data.session };
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
      const user = await getUser();
      const { data, error } = await client
        .from('pages')
        .select('id, slug, title, published, version, updated_at')
        .eq('user_id', user.id)
        .order('created_at');
      if (error) throw new Error(error.message);
      // Return shape: { pages: [...slugs], pageRows: [...full rows] }
      return { pages: data.map(p => p.slug), pageRows: data };
    },

    async getPage(slug) {
      const row = await getPageRow(slug);
      // Return the content JSONB — same shape as old `GET /admin/api/pages/:id`
      const doc = row.content || { blocks: [] };
      doc.version = row.version;
      doc.id = row.slug;
      doc.lang = row.lang || doc.lang || 'de';
      doc.meta = row.meta || doc.meta || {};
      return doc;
    },

    async saveDraft(slug, doc) {
      const user = await getUser();
      const row = await getPageRow(slug);

      // Snapshot current version to history
      await client.from('page_history').insert({
        page_id: row.id,
        content: row.content,
        version: row.version,
      });

      // Bump version and save
      const newVersion = (row.version || 0) + 1;
      doc.version = newVersion;

      const { error } = await client
        .from('pages')
        .update({
          content: doc,
          version: newVersion,
          lang: doc.lang || 'de',
          meta: doc.meta || {},
          title: doc.meta?.title || doc.title || row.title,
          published: true,
          published_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);

      if (error) throw new Error(error.message);
      return { ok: true, version: newVersion };
    },

    async createPage(slug, title) {
      const user = await getUser();
      const content = {
        id: slug,
        version: 1,
        lang: 'de',
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
        .select('id, version, created_at')
        .eq('page_id', row.id)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw new Error(error.message);
      return {
        snapshots: data.map(h => ({
          id: h.id,
          ts: h.created_at,
          file: h.id,   // compat: old UI used `s.file` to restore
          version: h.version,
        })),
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

      // Snapshot current state first
      await client.from('page_history').insert({
        page_id: row.id,
        content: row.content,
        version: row.version,
      });

      // Restore
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

    async uploadImage(file) {
      const user = await getUser();
      // Hash-based filename (same logic as old server)
      const buf = await file.arrayBuffer();
      const hashArray = await crypto.subtle.digest('SHA-256', buf);
      const hash = Array.from(new Uint8Array(hashArray)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
      const ext = (file.name.match(/\.[a-z0-9]+$/i) || ['.bin'])[0].toLowerCase();
      const path = `${user.id}/${hash}${ext}`;

      const { error } = await client.storage
        .from('page-images')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw new Error(error.message);

      const { data: { publicUrl } } = client.storage
        .from('page-images')
        .getPublicUrl(path);

      return { ok: true, url: publicUrl, size: file.size, mime: file.type };
    },

    async listImages() {
      const user = await getUser();
      const { data, error } = await client.storage
        .from('page-images')
        .list(user.id, { limit: 200, sortBy: { column: 'created_at', order: 'desc' } });
      if (error) throw new Error(error.message);

      const images = (data || [])
        .filter(f => /\.(png|jpe?g|webp|gif|svg)$/i.test(f.name))
        .map(f => {
          const { data: { publicUrl } } = client.storage
            .from('page-images')
            .getPublicUrl(`${user.id}/${f.name}`);
          return { url: publicUrl, size: f.metadata?.size || 0, name: f.name };
        });

      return { images };
    },

    // ─── Claude Generation (via Supabase Edge Function) ───

    async generate({ type, prompt, images, currentData, mode, pageId }) {
      const { data: { session } } = await client.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const res = await fetch(`${SUPABASE_URL}/functions/v1/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ type, prompt, images, currentData, mode, pageId }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Generation failed (${res.status})`);
      }
      return res.json();
    },
  };

  // ── Auth state listener ───────────────────────────────
  client.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') {
      _user = null;
      _profile = null;
    }
    if (event === 'SIGNED_IN' && session?.user) {
      _user = session.user;
    }
  });
})();
