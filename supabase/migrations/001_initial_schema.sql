-- ScrollyCMS multi-tenant schema
-- Apply via Supabase Dashboard > SQL Editor or MCP apply_migration

-- ══════════════════════════════════════
-- 1. Tables
-- ══════════════════════════════════════

-- Profiles (extends auth.users — one row per signup)
create table public.profiles (
  id         uuid references auth.users(id) on delete cascade primary key,
  email      text not null,
  display_name text not null default '',
  site_slug  text unique not null,           -- scrollycms.pages.dev/p/<site_slug>/
  avatar_url text,
  plan       text not null default 'free',   -- future: 'free','pro','enterprise'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Pages (each user owns many pages)
create table public.pages (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references public.profiles(id) on delete cascade not null,
  slug         text not null,
  title        text not null default 'Untitled',
  content      jsonb not null default '{"blocks":[]}',
  published    boolean not null default false,
  published_at timestamptz,
  version      integer not null default 1,
  lang         text not null default 'de',
  meta         jsonb not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique(user_id, slug)
);

-- Page version history (snapshots on every publish)
create table public.page_history (
  id         uuid primary key default gen_random_uuid(),
  page_id    uuid references public.pages(id) on delete cascade not null,
  content    jsonb not null,
  version    integer not null,
  created_at timestamptz not null default now()
);

-- Indexes for fast lookups
create index idx_profiles_site_slug on public.profiles(site_slug);
create index idx_pages_user_slug    on public.pages(user_id, slug);
create index idx_pages_published    on public.pages(published) where published = true;
create index idx_history_page       on public.page_history(page_id, created_at desc);

-- ══════════════════════════════════════
-- 2. Auto-create profile on signup
-- ══════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger as $$
declare
  base_slug text;
  final_slug text;
  suffix int := 0;
begin
  -- Derive slug from email prefix: nihat@example.com → nihat
  base_slug := lower(regexp_replace(split_part(new.email, '@', 1), '[^a-z0-9]', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  if base_slug = '' then base_slug := 'user'; end if;

  -- Ensure uniqueness: nihat, nihat-1, nihat-2, ...
  final_slug := base_slug;
  loop
    begin
      insert into public.profiles (id, email, display_name, site_slug)
      values (
        new.id,
        new.email,
        coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
        final_slug
      );
      exit;  -- success
    exception when unique_violation then
      suffix := suffix + 1;
      final_slug := base_slug || '-' || suffix;
    end;
  end loop;
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ══════════════════════════════════════
-- 3. Row Level Security
-- ══════════════════════════════════════

alter table public.profiles    enable row level security;
alter table public.pages       enable row level security;
alter table public.page_history enable row level security;

-- Profiles: users read/update their own; public can read (for slug lookup by CF Worker)
create policy "Users read own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users update own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "Public reads profiles by slug"
  on public.profiles for select
  using (true);

-- Pages: users CRUD their own; anyone reads published (for the public CF Worker)
create policy "Users manage own pages"
  on public.pages for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Public reads published pages"
  on public.pages for select
  using (published = true);

-- History: users read/insert their own
create policy "Users read own history"
  on public.page_history for select
  using (page_id in (select id from public.pages where user_id = auth.uid()));

create policy "Users insert own history"
  on public.page_history for insert
  with check (page_id in (select id from public.pages where user_id = auth.uid()));
