-- 온라인 특수판: 방 비밀번호·멤버·채팅·실시간 권한.
-- Supabase SQL Editor 에 통째로 붙여 한 번 실행한다. 다시 실행해도 같은 결과가 되게 짰다.
-- 비밀번호와 그 해시는 이 파일에 없다. 방 주인이 SQL Editor 에서 set_room_password 로 넣는다

create extension if not exists pgcrypto with schema extensions;

-- ── 테이블 ──────────────────────────────────────────────

-- 행 하나뿐인 방 비밀번호(bcrypt). 정책이 없어서 API 로는 아무도 못 읽는다
create table if not exists public.room_secret (
  id boolean primary key default true check (id),
  password_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.members (
  user_id uuid primary key references auth.users (id) on delete cascade,
  joined_at timestamptz not null default now()
);

-- 틀린 비밀번호 시도. 익명 계정마다 10분에 5번까지만 받는다
create table if not exists public.join_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index if not exists join_attempts_user_idx on public.join_attempts (user_id, attempted_at);

-- 이름은 캐릭터 이름(1~12자)뿐이다. 다른 개인정보는 받지 않는다
create table if not exists public.chat_messages (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 12),
  era text not null check (era in ('current', 'classic')),
  map_id integer not null check (map_id >= 0),
  text text not null check (char_length(text) between 1 and 120),
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_created_idx on public.chat_messages (created_at);
create index if not exists chat_messages_user_idx on public.chat_messages (user_id, created_at);

alter table public.room_secret enable row level security;
alter table public.members enable row level security;
alter table public.join_attempts enable row level security;
alter table public.chat_messages enable row level security;

-- Supabase 는 public 스키마 새 테이블에 anon·authenticated 권한을 기본으로 준다. RLS 와 별개로 필요한 것만 남긴다
revoke all on public.room_secret from anon, authenticated;
revoke all on public.join_attempts from anon, authenticated;
revoke all on public.members from anon, authenticated;
revoke all on public.chat_messages from anon, authenticated;
grant select on public.members to authenticated;
grant select, insert on public.chat_messages to authenticated;

-- ── 멤버 판정 ────────────────────────────────────────────

-- 정책 안에서 members 를 읽을 때 members 의 RLS 를 다시 타지 않게 definer 로 읽는다
create or replace function public.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.members where user_id = (select auth.uid()));
$$;

-- ── 정책 ────────────────────────────────────────────────

drop policy if exists members_select_own on public.members;
create policy members_select_own on public.members
  for select to authenticated
  using (user_id = (select auth.uid()));

-- pg_cron 이 아직 안 지웠어도 24시간 지난 글은 안 보인다
drop policy if exists chat_select_members on public.chat_messages;
create policy chat_select_members on public.chat_messages
  for select to authenticated
  using ((select public.is_member()) and created_at > now() - interval '24 hours');

drop policy if exists chat_insert_members on public.chat_messages;
create policy chat_insert_members on public.chat_messages
  for insert to authenticated
  with check ((select public.is_member()) and user_id = (select auth.uid()));

-- ── 채팅 트리거 ──────────────────────────────────────────

-- 보낸 사람·시각은 서버가 정한다. 같은 사람이 10초에 5개 넘게 보내면 거절한다
create or replace function public.chat_messages_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  recent integer;
begin
  new.user_id := auth.uid();
  new.created_at := now();
  new.text := btrim(new.text);
  new.name := btrim(new.name);
  if new.user_id is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  -- 같은 사람이 동시에 여러 개를 넣어도 세는 사이에 끼어들지 못하게 한다
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  select count(*) into recent
    from public.chat_messages
    where user_id = new.user_id and created_at > now() - interval '10 seconds';
  if recent >= 5 then
    raise exception 'rate_limited' using errcode = 'P0001', hint = '10초에 5개까지 보낼 수 있다';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_messages_guard on public.chat_messages;
create trigger chat_messages_guard
  before insert on public.chat_messages
  for each row execute function public.chat_messages_guard();

-- 저장된 글만 방 채널로 내보낸다. 클라이언트는 room:chat 에 직접 broadcast 할 수 없다(아래 실시간 정책)
create or replace function public.chat_messages_broadcast()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'id', new.id,
      'user_id', new.user_id,
      'name', new.name,
      'era', new.era,
      'map_id', new.map_id,
      'text', new.text,
      'created_at', new.created_at
    ),
    'message',
    'room:chat',
    true
  );
  return null;
end;
$$;

drop trigger if exists chat_messages_broadcast on public.chat_messages;
create trigger chat_messages_broadcast
  after insert on public.chat_messages
  for each row execute function public.chat_messages_broadcast();

-- ── RPC ─────────────────────────────────────────────────

-- 방 비밀번호가 맞으면 부른 익명 계정을 멤버로 넣는다. 이미 멤버면 바로 true
create or replace function public.join_room(password text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  stored text;
  failures integer;
begin
  if uid is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  if exists (select 1 from public.members where user_id = uid) then
    return true;
  end if;
  delete from public.join_attempts where attempted_at < now() - interval '1 day';
  select count(*) into failures
    from public.join_attempts
    where user_id = uid and attempted_at > now() - interval '10 minutes';
  if failures >= 5 then
    raise exception 'too_many_attempts' using errcode = 'P0001';
  end if;
  select password_hash into stored from public.room_secret where id;
  if stored is null or password is null or extensions.crypt(password, stored) <> stored then
    insert into public.join_attempts (user_id) values (uid);
    return false;
  end if;
  insert into public.members (user_id) values (uid) on conflict do nothing;
  delete from public.join_attempts where user_id = uid;
  return true;
end;
$$;

-- 24시간 안 채팅을 최근 것부터 100개. pg_cron 을 못 켠 프로젝트에서는 여기서 지난 글을 지운다(읽을 때 지우기)
create or replace function public.recent_chat()
returns setof public.chat_messages
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_member() then
    raise exception 'not_member' using errcode = '42501';
  end if;
  delete from public.chat_messages where created_at < now() - interval '24 hours';
  return query
    select * from public.chat_messages
    where created_at > now() - interval '24 hours'
    order by created_at desc
    limit 100;
end;
$$;

-- 방 주인이 SQL Editor 에서만 부른다: select public.set_room_password('여기에 비밀번호');
-- 바꾸면 새로 들어오는 사람만 새 비밀번호를 쓴다. 이미 들어온 사람까지 내보내려면 delete from public.members;
create or replace function public.set_room_password(new_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new_password is null or char_length(new_password) < 4 then
    raise exception '비밀번호는 4자 이상으로 정해 주세요';
  end if;
  insert into public.room_secret (id, password_hash, updated_at)
    values (true, extensions.crypt(new_password, extensions.gen_salt('bf', 10)), now())
  on conflict (id) do update set password_hash = excluded.password_hash, updated_at = now();
end;
$$;

-- 함수는 기본으로 PUBLIC 에 실행 권한이 있고, Supabase 는 anon·authenticated 에도 준다. 쓸 사람에게만 다시 준다
revoke all on function public.is_member() from public, anon, authenticated;
revoke all on function public.join_room(text) from public, anon, authenticated;
revoke all on function public.recent_chat() from public, anon, authenticated;
revoke all on function public.set_room_password(text) from public, anon, authenticated;
revoke all on function public.chat_messages_guard() from public, anon, authenticated;
revoke all on function public.chat_messages_broadcast() from public, anon, authenticated;
grant execute on function public.is_member() to authenticated;
grant execute on function public.join_room(text) to authenticated;
grant execute on function public.recent_chat() to authenticated;
grant execute on function public.set_room_password(text) to service_role;

-- ── 실시간(Realtime Authorization) ───────────────────────

-- 멤버만 맵 채널(map:{시대}:{맵 ID})과 방 채널(room:chat)을 받는다
drop policy if exists online_members_receive on realtime.messages;
create policy online_members_receive on realtime.messages
  for select to authenticated
  using (
    (select public.is_member())
    and (realtime.topic() = 'room:chat' or realtime.topic() like 'map:%')
  );

-- 맵 채널에는 위치(broadcast)·접속(presence)을 보낸다. 방 채널에는 접속만 알리고 채팅은 위 트리거만 보낸다
drop policy if exists online_members_send on realtime.messages;
create policy online_members_send on realtime.messages
  for insert to authenticated
  with check (
    (select public.is_member())
    and (
      (realtime.topic() like 'map:%' and realtime.messages.extension in ('broadcast', 'presence'))
      or (realtime.topic() = 'room:chat' and realtime.messages.extension = 'presence')
    )
  );
