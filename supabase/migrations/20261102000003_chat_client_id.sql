-- 보낸 사람이 글을 먼저 화면에 띄운 뒤 방 채널로 돌아온 글과 짝짓는 값. 서버는 검사 없이 되돌려 보내기만 한다
alter table public.chat_messages add column if not exists client_id uuid;

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
      'created_at', new.created_at,
      'client_id', new.client_id
    ),
    'message',
    'room:chat',
    true
  );
  return null;
end;
$$;
