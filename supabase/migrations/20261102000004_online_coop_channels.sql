-- 같이 도전(보스 협동) 채널. 멤버만 쓴다.
-- room:events: 같이 도전 초대를 방 전체에 알린다(broadcast). room:chat 은 그대로 트리거만 채팅을 보낸다
-- boss:{초대 id}: 같이 싸우는 사람끼리 때린 몫·보스 HP(broadcast)와 누가 남았는지(presence)를 주고받는다
-- 받은 값은 앱이 모양·범위를 다시 확인하고, 보스 HP 는 방장(앱)이 한 사람 몫을 잘라 적용한다

drop policy if exists online_members_receive on realtime.messages;
create policy online_members_receive on realtime.messages
  for select to authenticated
  using (
    (select public.is_member())
    and (
      realtime.topic() in ('room:chat', 'room:events')
      or realtime.topic() like 'map:%'
      or realtime.topic() like 'boss:%'
    )
  );

drop policy if exists online_members_send on realtime.messages;
create policy online_members_send on realtime.messages
  for insert to authenticated
  with check (
    (select public.is_member())
    and (
      ((realtime.topic() like 'map:%' or realtime.topic() like 'boss:%') and realtime.messages.extension in ('broadcast', 'presence'))
      or (realtime.topic() = 'room:events' and realtime.messages.extension = 'broadcast')
      or (realtime.topic() = 'room:chat' and realtime.messages.extension = 'presence')
    )
  );
