-- Chat attachments (5 MB) + empty caption when a file is attached.

alter table public.chat_messages
  add column if not exists attachment_path text,
  add column if not exists attachment_name text,
  add column if not exists attachment_mime text,
  add column if not exists attachment_size integer;

alter table public.chat_messages
  drop constraint if exists chat_messages_body_ok;

alter table public.chat_messages
  alter column body set default '';

alter table public.chat_messages
  drop constraint if exists chat_messages_body_len;
alter table public.chat_messages
  add constraint chat_messages_body_len check (char_length(body) <= 4000);

alter table public.chat_messages
  drop constraint if exists chat_messages_attachment_size_ok;
alter table public.chat_messages
  add constraint chat_messages_attachment_size_ok
  check (attachment_size is null or (attachment_size > 0 and attachment_size <= 5242880));

alter table public.chat_messages
  drop constraint if exists chat_messages_attachment_shape;
alter table public.chat_messages
  add constraint chat_messages_attachment_shape check (
    (
      attachment_path is null
      and attachment_name is null
      and attachment_mime is null
      and attachment_size is null
    )
    or (
      attachment_path is not null
      and attachment_name is not null
      and attachment_mime is not null
      and attachment_size is not null
    )
  );

alter table public.chat_messages
  drop constraint if exists chat_messages_has_content;
alter table public.chat_messages
  add constraint chat_messages_has_content check (
    char_length(btrim(body)) > 0
    or attachment_path is not null
  );

create or replace function public.chat_messages_before_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  a uuid;
  b uuid;
begin
  new.body := coalesce(btrim(new.body), '');
  if char_length(new.body) = 0 and new.attachment_path is null then
    raise exception 'message cannot be empty';
  end if;

  select c.participant_a, c.participant_b
    into a, b
  from public.chat_conversations c
  where c.id = new.conversation_id;

  if a is null then
    raise exception 'conversation not found';
  end if;

  if new.sender_id is distinct from a and new.sender_id is distinct from b then
    raise exception 'sender is not a participant';
  end if;

  return new;
end;
$$;

create or replace function public.chat_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  preview text;
begin
  if char_length(btrim(new.body)) > 0 then
    preview := left(new.body, 140);
  elsif new.attachment_mime like 'image/%' then
    preview := 'Photo';
  elsif new.attachment_mime like 'video/%' then
    preview := 'Video';
  elsif new.attachment_mime like 'audio/%' then
    preview := 'Audio';
  elsif new.attachment_name is not null then
    preview := new.attachment_name;
  else
    preview := 'Attachment';
  end if;

  update public.chat_conversations
  set
    last_message_at = new.created_at,
    last_message_preview = preview,
    unread_a = case when new.sender_id = participant_a then unread_a else unread_a + 1 end,
    unread_b = case when new.sender_id = participant_b then unread_b else unread_b + 1 end
  where id = new.conversation_id;
  return new;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-attachments',
  'chat-attachments',
  false,
  5242880,
  array[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/bmp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/zip',
    'application/x-zip-compressed',
    'audio/mpeg',
    'audio/mp4',
    'audio/wav',
    'audio/webm',
    'audio/ogg',
    'video/mp4',
    'video/webm',
    'video/quicktime'
  ]::text[]
)
on conflict (id) do update
set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types,
  public = false;

drop policy if exists chat_attachments_select on storage.objects;
create policy chat_attachments_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1
      from public.chat_conversations c
      where c.id::text = split_part(name, '/', 1)
        and (c.participant_a = public.jwt_employee_id() or c.participant_b = public.jwt_employee_id())
    )
  );

drop policy if exists chat_attachments_insert on storage.objects;
create policy chat_attachments_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and exists (
      select 1
      from public.chat_conversations c
      where c.id::text = split_part(name, '/', 1)
        and (c.participant_a = public.jwt_employee_id() or c.participant_b = public.jwt_employee_id())
    )
  );

notify pgrst, 'reload schema';
