create table if not exists public.issue_projects (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_key text not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists issue_projects_user_project_key_idx
  on public.issue_projects(user_id, project_key);

create table if not exists public.issue_items (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_key text not null,
  title text not null,
  description text,
  is_completed boolean not null default false,
  completed_at timestamptz,
  due_date date,
  due_time text,
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists issue_items_user_project_key_idx
  on public.issue_items(user_id, project_key);

create table if not exists public.issue_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme_primary_color text not null default '#E03131',
  issue_projects_order jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.issue_projects enable row level security;
alter table public.issue_items enable row level security;
alter table public.issue_settings enable row level security;

drop policy if exists "issue_projects owner access" on public.issue_projects;
create policy "issue_projects owner access"
  on public.issue_projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "issue_items owner access" on public.issue_items;
create policy "issue_items owner access"
  on public.issue_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "issue_settings owner access" on public.issue_settings;
create policy "issue_settings owner access"
  on public.issue_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
