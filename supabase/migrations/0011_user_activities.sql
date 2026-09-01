-- Domain-level website activity from the Chrome extension.
-- Stores hostname only (no paths, query strings, passwords, or page content).

create table public.user_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_id uuid references public.employees(id) on delete cascade,
  domain text not null,
  started_at timestamptz not null,
  ended_at timestamptz,
  duration_seconds integer,
  created_at timestamptz not null default now(),
  constraint user_activities_domain_ok check (char_length(domain) between 1 and 253),
  constraint user_activities_duration_ok check (duration_seconds is null or duration_seconds >= 0)
);

create index idx_user_activities_user_started on public.user_activities (user_id, started_at desc);
create index idx_user_activities_employee_started on public.user_activities (employee_id, started_at desc);
create index idx_user_activities_domain on public.user_activities (domain);
create index idx_user_activities_created on public.user_activities (created_at desc);
create index idx_user_activities_started on public.user_activities (started_at desc);

create or replace function public.user_activities_prepare()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.user_id is null then
    new.user_id := auth.uid();
  end if;

  if new.user_id is distinct from auth.uid() and auth.uid() is not null then
    raise exception 'user_activities.user_id must match the signed-in user';
  end if;

  new.domain := lower(btrim(new.domain));
  new.domain := regexp_replace(new.domain, '^www\.', '');

  select e.id
    into new.employee_id
  from public.employees e
  where e.auth_user_id = new.user_id
  limit 1;

  if new.ended_at is not null then
    new.duration_seconds := greatest(
      0,
      floor(extract(epoch from (new.ended_at - new.started_at)))::int
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_user_activities_prepare on public.user_activities;
create trigger trg_user_activities_prepare
  before insert or update on public.user_activities
  for each row execute function public.user_activities_prepare();

alter table public.user_activities enable row level security;

drop policy if exists user_activities_self_select on public.user_activities;
create policy user_activities_self_select on public.user_activities
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists user_activities_admin_select on public.user_activities;
create policy user_activities_admin_select on public.user_activities
  for select to authenticated
  using (
    public.jwt_role_key() = any (
      array['SUPER_ADMIN', 'HR', 'AGENT', 'DATABASE', 'EMAIL_MARKETING']::text[]
    )
  );

drop policy if exists user_activities_self_insert on public.user_activities;
create policy user_activities_self_insert on public.user_activities
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists user_activities_self_update on public.user_activities;
create policy user_activities_self_update on public.user_activities
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update on public.user_activities to authenticated;
grant all on public.user_activities to service_role;

grant execute on function public.jwt_employee_id() to authenticated, anon, service_role;
grant execute on function public.jwt_role_key() to authenticated, anon, service_role;

notify pgrst, 'reload schema';
