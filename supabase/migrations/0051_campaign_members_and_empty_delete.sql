-- 0051_campaign_members_and_empty_delete.sql
--
-- 1. People added to a campaign can see it.
--    co.campaign.view lets someone see only the campaigns they are a member of; managers see all.
--    Agent, Email Marketing and IT did not hold it, so a caller or QA person added to a campaign
--    still had no Campaign Operations menu. They get view only: no create, upload approval,
--    full-database download or member management.
--
-- 2. A campaign created by mistake can be deleted, but only while it is still empty: Draft or
--    Awaiting database, with no file, database version or lead row. Anything with data in it is
--    archived as before. The delete runs through one function, and it is in the audit log.
--
-- Safe to re-run.

with grants (role_key, permission_key) as (
  values
    ('AGENT', 'co.campaign.view'),
    ('EMAIL_MARKETING', 'co.campaign.view'),
    ('IT', 'co.campaign.view')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from grants g
join public.roles r on r.role_key = g.role_key
join public.permissions p on p.permission_key = g.permission_key
on conflict do nothing;

-- The no-delete rule (0049) now has one exception: the empty campaign named for this transaction.
create or replace function public.co_block_delete()
returns trigger
language plpgsql
as $$
declare
  deleting text := current_setting('worktrack.co_delete_campaign', true);
begin
  if deleting is not null and deleting <> '' then
    if tg_table_name = 'co_campaigns' and old.id::text = deleting then
      return old;
    end if;
    if tg_table_name = 'co_campaign_members' and old.campaign_id::text = deleting then
      return old;
    end if;
  end if;
  raise exception '% rows are archived, never deleted.', tg_table_name using errcode = 'insufficient_privilege';
end;
$$;

create or replace function public.co_delete_empty_campaign(p_campaign_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign_status text;
begin
  select status into campaign_status from public.co_campaigns where id = p_campaign_id for update;
  if campaign_status is null then
    raise exception 'Campaign not found.' using errcode = 'no_data_found';
  end if;
  if campaign_status not in ('DRAFT', 'AWAITING_DATABASE') then
    raise exception 'Only a campaign that has not started can be deleted. Archive this one instead.'
      using errcode = 'check_violation';
  end if;
  if exists (select 1 from public.co_files where campaign_id = p_campaign_id)
     or exists (select 1 from public.co_database_versions where campaign_id = p_campaign_id)
     or exists (select 1 from public.co_lead_records where campaign_id = p_campaign_id) then
    raise exception 'This campaign has files or data, so it is archived, not deleted.'
      using errcode = 'check_violation';
  end if;

  perform set_config('worktrack.co_delete_campaign', p_campaign_id::text, true);
  delete from public.co_campaign_members where campaign_id = p_campaign_id;
  delete from public.co_campaigns where id = p_campaign_id;
  perform set_config('worktrack.co_delete_campaign', '', true);
end;
$$;

revoke all on function public.co_delete_empty_campaign(uuid) from public, anon, authenticated;
grant execute on function public.co_delete_empty_campaign(uuid) to service_role;
