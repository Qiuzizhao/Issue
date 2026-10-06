-- Upgrade existing Issue tables to the fields required by the current app.
-- Run with psql -v ON_ERROR_STOP=1. Existing records and policies are preserved.
begin;

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

update public.issue_items set status = 'done'
  where is_completed = true and (status is null or status = 'open');
update public.issue_items set status = 'open'
  where status is null or status in ('blocked', 'wontfix');

notify pgrst, 'reload schema';
commit;
