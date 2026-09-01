-- Direct (1:1) employee chat. Pair is always stored with participant_a < participant_b.

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  participant_a uuid not null references public.employees(id) on delete cascade,
  participant_b uuid not null references public.employees(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  unread_a integer not null default 0,
  unread_b integer not null default 0,
  created_at timestamptz not null default now(),
  constraint chat_conversations_not_self check (participant_a <> participant_b),
  constraint chat_conversations_pair_ordered check (participant_a < participant_b),
  constraint chat_conversations_unread_a_ok check (unread_a >= 0),
  constraint chat_conversations_unread_b_ok check (unread_b >= 0),
  constraint chat_conversations_pair unique (participant_a, participant_b)
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  sender_id uuid not null references public.employees(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  constraint chat_messages_body_ok check (char_length(btrim(body)) between 1 and 4000)
);

create table public.chat_reads (
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, employee_id)
);

create index idx_chat_conversations_a_last on public.chat_conversations (participant_a, last_message_at desc);
create index idx_chat_conversations_b_last on public.chat_conversations (participant_b, last_message_at desc);
create index idx_chat_messages_conversation_created on public.chat_messages (conversation_id, created_at);
create index idx_chat_messages_sender on public.chat_messages (sender_id, created_at desc);

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
  new.body := btrim(new.body);
  if new.body is null or char_length(new.body) = 0 then
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

drop trigger if exists trg_chat_messages_before_insert on public.chat_messages;
create trigger trg_chat_messages_before_insert
  before insert on public.chat_messages
  for each row execute function public.chat_messages_before_insert();

create or replace function public.chat_messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_conversations
  set
    last_message_at = new.created_at,
    last_message_preview = left(new.body, 140),
    unread_a = case when new.sender_id = participant_a then unread_a else unread_a + 1 end,
    unread_b = case when new.sender_id = participant_b then unread_b else unread_b + 1 end
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists trg_chat_messages_after_insert on public.chat_messages;
create trigger trg_chat_messages_after_insert
  after insert on public.chat_messages
  for each row execute function public.chat_messages_after_insert();

alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reads enable row level security;

drop policy if exists chat_conversations_participant_select on public.chat_conversations;
create policy chat_conversations_participant_select on public.chat_conversations
  for select to authenticated
  using (
    participant_a = public.jwt_employee_id()
    or participant_b = public.jwt_employee_id()
  );

drop policy if exists chat_conversations_participant_insert on public.chat_conversations;
create policy chat_conversations_participant_insert on public.chat_conversations
  for insert to authenticated
  with check (
    participant_a = public.jwt_employee_id()
    or participant_b = public.jwt_employee_id()
  );

drop policy if exists chat_conversations_participant_update on public.chat_conversations;
create policy chat_conversations_participant_update on public.chat_conversations
  for update to authenticated
  using (
    participant_a = public.jwt_employee_id()
    or participant_b = public.jwt_employee_id()
  )
  with check (
    participant_a = public.jwt_employee_id()
    or participant_b = public.jwt_employee_id()
  );

drop policy if exists chat_messages_participant_select on public.chat_messages;
create policy chat_messages_participant_select on public.chat_messages
  for select to authenticated
  using (
    exists (
      select 1
      from public.chat_conversations c
      where c.id = conversation_id
        and (c.participant_a = public.jwt_employee_id() or c.participant_b = public.jwt_employee_id())
    )
  );

drop policy if exists chat_messages_self_insert on public.chat_messages;
create policy chat_messages_self_insert on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = public.jwt_employee_id()
    and exists (
      select 1
      from public.chat_conversations c
      where c.id = conversation_id
        and (c.participant_a = public.jwt_employee_id() or c.participant_b = public.jwt_employee_id())
    )
  );

drop policy if exists chat_reads_self_select on public.chat_reads;
create policy chat_reads_self_select on public.chat_reads
  for select to authenticated
  using (
    exists (
      select 1
      from public.chat_conversations c
      where c.id = conversation_id
        and (c.participant_a = public.jwt_employee_id() or c.participant_b = public.jwt_employee_id())
    )
  );

drop policy if exists chat_reads_self_write on public.chat_reads;
create policy chat_reads_self_write on public.chat_reads
  for all to authenticated
  using (employee_id = public.jwt_employee_id())
  with check (employee_id = public.jwt_employee_id());

grant select, insert, update, delete on public.chat_conversations to authenticated;
grant select, insert on public.chat_messages to authenticated;
grant select, insert, update, delete on public.chat_reads to authenticated;
grant all on public.chat_conversations to service_role;
grant all on public.chat_messages to service_role;
grant all on public.chat_reads to service_role;

notify pgrst, 'reload schema';
