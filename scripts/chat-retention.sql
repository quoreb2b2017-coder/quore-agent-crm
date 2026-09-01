-- Delete chat messages (and their files) automatically after 7 days.

create or replace function public.purge_old_chat()
returns integer
language plpgsql
security definer
set search_path = public, storage
as $$
declare
  deleted_count integer := 0;
begin
  delete from storage.objects o
  using public.chat_messages m
  where o.bucket_id = 'chat-attachments'
    and m.attachment_path is not null
    and o.name = m.attachment_path
    and m.created_at < now() - interval '7 days';

  delete from public.chat_messages
  where created_at < now() - interval '7 days';
  get diagnostics deleted_count = row_count;

  update public.chat_conversations c
  set
    last_message_at = coalesce(latest.created_at, c.created_at),
    last_message_preview = latest.preview
  from (
    select
      m.conversation_id,
      m.created_at,
      case
        when char_length(btrim(m.body)) > 0 then left(m.body, 140)
        when m.attachment_mime like 'image/%' then 'Photo'
        when m.attachment_mime like 'video/%' then 'Video'
        when m.attachment_mime like 'audio/%' then 'Audio'
        when m.attachment_name is not null then m.attachment_name
        else 'Attachment'
      end as preview
    from public.chat_messages m
    inner join (
      select conversation_id, max(created_at) as created_at
      from public.chat_messages
      group by conversation_id
    ) newest
      on newest.conversation_id = m.conversation_id
     and newest.created_at = m.created_at
  ) latest
  where c.id = latest.conversation_id;

  update public.chat_conversations c
  set
    last_message_preview = null,
    unread_a = 0,
    unread_b = 0
  where not exists (
    select 1 from public.chat_messages m where m.conversation_id = c.id
  );

  update public.chat_conversations c
  set
    unread_a = (
      select count(*)::integer
      from public.chat_messages m
      left join public.chat_reads r
        on r.conversation_id = c.id and r.employee_id = c.participant_a
      where m.conversation_id = c.id
        and m.sender_id is distinct from c.participant_a
        and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
    ),
    unread_b = (
      select count(*)::integer
      from public.chat_messages m
      left join public.chat_reads r
        on r.conversation_id = c.id and r.employee_id = c.participant_b
      where m.conversation_id = c.id
        and m.sender_id is distinct from c.participant_b
        and m.created_at > coalesce(r.last_read_at, 'epoch'::timestamptz)
    )
  where exists (
    select 1 from public.chat_messages m where m.conversation_id = c.id
  );

  return deleted_count;
end;
$$;

grant execute on function public.purge_old_chat() to service_role;

do $outer$
begin
  begin
    create extension if not exists pg_cron;
  exception when others then
    null;
  end;

  begin
    perform cron.unschedule('purge-old-chat');
  exception when others then
    null;
  end;

  begin
    perform cron.schedule('purge-old-chat', '20 3 * * *', 'select public.purge_old_chat()');
  exception when others then
    null;
  end;
end
$outer$;

notify pgrst, 'reload schema';
