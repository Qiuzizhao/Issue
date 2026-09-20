create table if not exists public.issue_projects (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  project_key text not null,
  name text not null,
  color text default '#3E63DD',
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
  number integer,
  type text not null default 'bug',
  priority text not null default 'P2',
  status text not null default 'open',
  labels jsonb not null default '[]'::jsonb,
  version text,
  title text not null,
  description text,
  is_completed boolean not null default false,
  completed_at timestamptz,
  due_date date,
  due_time text,
  -- 关联文件 / 模块（字段名沿用 location）
  location text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists issue_items_user_project_key_idx
  on public.issue_items(user_id, project_key);

create table if not exists public.issue_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme_primary_color text not null default '#3E63DD',
  issue_projects_order jsonb not null default '[]'::jsonb,
  default_project_key text default '',
  default_issue_type text default 'bug',
  inbox_first boolean default false,
  updated_at timestamptz not null default now()
);

-- 已有库升级（Console 改版 v2）：老表补列
alter table public.issue_projects add column if not exists color text default '#3E63DD';
alter table public.issue_items add column if not exists number integer;
alter table public.issue_items add column if not exists type text not null default 'bug';
alter table public.issue_items add column if not exists priority text not null default 'P2';
alter table public.issue_items add column if not exists status text not null default 'open';
alter table public.issue_items add column if not exists labels jsonb not null default '[]'::jsonb;
alter table public.issue_items add column if not exists version text;
alter table public.issue_settings add column if not exists default_project_key text default '';
alter table public.issue_settings add column if not exists default_issue_type text default 'bug';
alter table public.issue_settings add column if not exists inbox_first boolean default false;

-- 老数据回填：已完成 → status = done，未完成 → open
update public.issue_items set status = 'done'
  where is_completed = true and (status is null or status = 'open');
update public.issue_items set status = 'open'
  where is_completed = false and status is null;

-- 状态精简（2026-09-18）：blocked / wontfix 下线，只保留 open / in_progress / done
update public.issue_items set status = 'open'
  where status in ('blocked', 'wontfix');

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
