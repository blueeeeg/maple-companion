-- 채팅은 24시간만 남긴다. Database → Extensions 에서 pg_cron 을 켠 뒤에 실행한다.
-- pg_cron 을 못 켜도 앱은 돌아간다. 24시간 지난 글은 정책에 막혀 안 보이고, 채팅창을 열 때 recent_chat() 이 지운다

create extension if not exists pg_cron;

-- 같은 이름으로 다시 실행하면 일정만 바뀐다
select cron.schedule(
  'maple-online-prune',
  '*/30 * * * *',
  $$
    delete from public.chat_messages where created_at < now() - interval '24 hours';
    delete from public.join_attempts where attempted_at < now() - interval '1 day';
  $$
);
