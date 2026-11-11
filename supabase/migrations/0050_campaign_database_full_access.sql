-- 0050_campaign_database_full_access.sql
-- The Database role gets full access to Campaign Operations: see every campaign, create and
-- manage campaigns and their members, upload and download databases, upload documents, and
-- approve databases uploaded by someone else.
--
-- Unchanged, and still enforced by the database (0049):
--   * nobody, Database role included, can approve a database version they uploaded;
--   * versions only move forward, nothing is deleted, file hashes never change.
-- Each grant can be taken back on the Roles page.
-- Safe to re-run.

with grants (role_key, permission_key) as (
  values
    ('DATABASE', 'co.campaign.view'),
    ('DATABASE', 'co.campaign.manage'),
    ('DATABASE', 'co.database.upload'),
    ('DATABASE', 'co.database.download'),
    ('DATABASE', 'co.database.approve'),
    ('DATABASE', 'co.documents.manage')
)
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from grants g
join public.roles r on r.role_key = g.role_key
join public.permissions p on p.permission_key = g.permission_key
on conflict do nothing;
