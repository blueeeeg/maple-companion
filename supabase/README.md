# 온라인 특수판 서버(Supabase) 준비

친구 몇 명이 같은 맵에서 서로를 보고 채팅하고 보스를 같이 잡는 온라인 특수판의 서버 쪽 준비 순서다. 방 주인이 한 번만 하면 된다.
앱 쪽 설명은 저장소 README 의 「온라인 특수판」 절에 있다.

> 2026-11-02 실제 프로젝트(eu-west-1)에 CLI 로 올려 두 창 입장·채팅·지난 글·속도 제한·비멤버 차단까지 확인했다.
> 대시보드로 해도 되고, 아래 「CLI 로 하기」를 따라도 된다.

## CLI 로 하기 (Supabase CLI 2.122)

DB 비밀번호 없이 된다. CLI 가 Management API 로 임시 로그인 역할을 만들어 쓴다.
service_role·secret 키는 어디에도 쓰지 않는다.

```bash
npx supabase login                                  # 브라우저로 한 번
npx supabase link --project-ref <프로젝트 ref>
npx supabase db push --linked --dry-run             # 올릴 migration 이름만 본다
npx supabase db push --linked                       # migrations 넷(테이블·함수·정책, pg_cron 과 정리 작업, client_id, 같이 도전 채널)
```

**익명 로그인 켜기 (CLI 로 된다)**
`config push` 는 config.toml 에 적힌 값을 원격에 덮어쓴다. `supabase init` 이 만든 기본값을 그대로 밀면 site_url·메일 확인·MFA 같은 다른 설정까지 바뀐다.
그래서 원격 설정을 먼저 받아 놓고 한 줄만 바꾼다. 저장소의 `config.toml` 은 이렇게 받은 것이다.

```bash
npx supabase config pull --yes          # 원격 설정을 config.toml 로
# config.toml [auth] enable_anonymous_sign_ins = true 로 바꾼다
npx supabase config diff                # auth.enable_anonymous_sign_ins 하나만 나와야 한다
npx supabase config push                # 바뀌는 묶음마다 diff 를 보여 주고 y/N 을 묻는다
```

**실시간 공개 접근 끄기 (대시보드에서만)**
CLI 2.122 의 config.toml 에는 이 설정이 없다. `[realtime] private_only` 를 적어도 diff·push 가 무시한다.
아래 3번대로 대시보드에서 끈다. 꺼져 있지 않아도 앱이 쓰는 비공개 채널은 정책이 막는다. 끄면 정책을 안 거치는 공개 채널을 아무도 못 연다.

**앱 키 넣기**
`npx supabase projects api-keys --project-ref <ref> -o json` 에서 `type` 이 `publishable` 인 키(`sb_publishable_...`)만 골라 `.env.local` 에 넣는다. 출력에는 secret 키도 같이 나오니 화면에 그대로 띄우지 말고 골라서 바로 파일로 쓴다.

**방 비밀번호**
아래 5번의 한 줄을 SQL Editor 에서 실행한다.
CLI 로 하려면 그 한 줄을 파일에 적어 `npx supabase db query --linked -f <파일>` 로 실행하고 파일을 지운다. 명령줄 인자로 넘기면 셸 기록에 남는다.

## 1. 프로젝트 만들기

1. <https://supabase.com/dashboard> 에서 **New project** 를 누른다
2. Region 은 **Northeast Asia (Seoul)** 을 고른다. 친구들과 가까울수록 채팅이 빨리 뜬다
   - eu-west-1 프로젝트를 한국에서 쟀을 때(2026-11-02): DB 를 거치는 REST 왕복 중앙값 약 350ms, 채팅이 상대 화면에 뜨기까지 약 0.9~1.1초, 위치 broadcast 왕복 중앙값 약 100~150ms
   - 위치·접속은 DB 를 안 거쳐서 지역 영향이 작다. 채팅·입장은 DB 를 거쳐서 지역 차이가 그대로 드러난다
3. Database password 는 비밀번호 관리자에 넣어 둔다. 앱에는 쓰지 않는다

## 2. 익명 로그인 켜기

앱에는 로그인 화면이 없다. 켤 때 몰래 익명 계정을 만들어 그 계정으로 RLS(`auth.uid()`)를 거친다.

1. **Authentication → Sign In / Providers** 에서 **Allow anonymous sign-ins** 를 켠다
2. (권장) **Authentication → Rate Limits** 에서 익명 로그인 한도(IP 당 시간 당)를 기본값(30) 그대로 둔다. 비밀번호를 마구 넣어 보는 것을 늦춘다

## 3. 실시간 채널을 비공개로만

**Realtime → Settings** 에서 **Allow public access** 를 끈다. 앱은 비공개 채널만 쓰고, 비공개 채널은 아래 SQL 의 정책(멤버만)을 거친다.

## 4. SQL 실행

1. **SQL Editor → New query** 를 연다
2. [`migrations/20261102000001_online_room.sql`](migrations/20261102000001_online_room.sql) 을 통째로 붙여 넣고 **Run** 을 누른다

만들어지는 것:

| 이름 | 뜻 |
|---|---|
| `room_secret` | 방 비밀번호의 bcrypt 해시(행 하나). 정책이 없어 앱에서는 못 읽는다 |
| `members` | 비밀번호를 맞힌 익명 계정. 앱은 자기 행만 읽는다 |
| `join_attempts` | 틀린 비밀번호 시도. 계정마다 10분에 5번까지 |
| `chat_messages` | 채팅. 이름(캐릭터 이름 12자까지)·시대·맵 ID·글(120자까지)·시각 |
| `join_room(password)` | 비밀번호가 맞으면 부른 계정을 `members` 에 넣는다 |
| `recent_chat()` | 24시간 안 채팅 100개. 부를 때 24시간 지난 글을 지운다 |
| `set_room_password(new_password)` | 방 비밀번호 정하기. SQL Editor(또는 service_role)에서만 부를 수 있다 |
| 채팅 트리거 | 보낸 사람·시각은 서버가 정하고, 10초에 5개 넘게 보내면 거절, 저장된 글만 `room:chat` 채널로 내보낸다 |
| 실시간 정책 | 멤버만 `room:chat`·`map:{시대}:{맵 ID}` 채널을 받는다. 맵 채널에는 위치·접속을 보내고, 방 채널에는 접속만 알린다(채팅은 트리거만 보낸다). 같이 도전 채널은 아래 「같이 도전 채널」 |

모든 테이블에 RLS 가 켜져 있다.

### 같이 도전 채널 (`20261102000004_online_coop_channels.sql`)

보스 도전 창 「같이 도전」이 쓰는 채널 둘을 멤버에게 연다. 실시간 정책 `online_members_receive`·`online_members_send` 를 이 migration 이 다시 만든다(테이블은 늘지 않는다).

**`room:events`**
같이 도전 초대와 초대 닫기를 방 전체에 알린다. 멤버가 broadcast 로 보내고 받는다. `room:chat` 은 그대로 멤버가 broadcast 할 수 없다.

**`boss:{초대 id}`**
같이 싸우는 사람끼리 쓴다. 누가 남았는지는 presence 로, 시작·때린 몫·보스 HP·처치·취소는 broadcast 로 주고받는다. 서버에 남는 것은 없다.

- 채널 권한은 「멤버인가」까지만 본다. broadcast 의 보낸 사람(`from`)은 보낸 쪽이 적는 값이라 서버가 보증하지 않는다. 앱이 받은 값의 모양·범위를 다시 보고, 보스 HP 는 방장(앱)이 한 사람이 한 번에·1초에 깎을 수 있는 양을 넘는 몫을 버린다
- 보상은 서버를 거치지 않고 사람마다 자기 기기에서 정산한다. 혼자 잡을 때와 같다
- 2026-11-02 `db push --dry-run` 으로 이 migration 하나만 올라가는 것을 본 뒤 올렸다. `pg_policies` 에서 두 정책이 `room:events`·`boss:%` 를 담은 것을 확인했다

## 5. 방 비밀번호 정하기

SQL Editor 에서 새 쿼리로 한 줄만 실행한다.

```sql
select public.set_room_password('여기에 비밀번호');
```

- 비밀번호와 해시는 저장소에 넣지 않는다. 친구들에게는 메신저로 따로 알려 준다
- SQL Editor 는 실행한 쿼리를 기록에 남긴다. 실행한 뒤 그 쿼리 탭을 지운다
- 바꾸고 싶으면 같은 줄을 다시 실행한다. 이미 들어온 친구는 그대로 남는다. 모두 다시 넣게 하려면 `delete from public.members;` 를 이어서 실행한다

## 6. 채팅 24시간 뒤 지우기 (pg_cron)

CLI 의 `db push` 로 올렸으면 이 절은 이미 끝났다. 두 번째 migration 이 pg_cron 을 켜고 작업을 등록한다.

1. **Database → Extensions** 에서 **pg_cron** 을 켠다
2. SQL Editor 에서 [`migrations/20261102000002_chat_retention_cron.sql`](migrations/20261102000002_chat_retention_cron.sql) 을 실행한다. 30분마다 24시간 지난 채팅을 지운다
3. 확인: `select jobname, schedule from cron.job;` 에 `maple-online-prune` 이 보이면 된다

pg_cron 을 켤 수 없으면 2번을 건너뛴다. 그래도 지난 글은 남지 않는다.

- 24시간 지난 글은 읽기 정책에 막혀 앱에 안 보인다
- 누군가 채팅창을 열 때 `recent_chat()` 이 지난 글을 지운다(읽을 때 지우기). 아무도 채팅창을 안 열면 그때까지 표에 남는다

## 7. 앱에 주소와 키 넣기

1. **Project Settings → API**(또는 **API Keys**)에서 **Project URL** 과 **anon public** 키(새 키 체계면 `sb_publishable_...`)를 복사한다
2. 저장소 루트에서 `.env.example` 을 `.env.local` 로 복사하고 두 값을 채운다

```bash
cp .env.example .env.local
# VITE_SUPABASE_URL=https://xxxx.supabase.co
# VITE_SUPABASE_ANON_KEY=eyJ... 또는 sb_publishable_...
```

- `.env.local` 은 `.gitignore` 에 있어 커밋되지 않는다
- anon 키는 앱 번들에 그대로 들어간다. 원래 공개해도 되는 키이고 권한은 RLS 가 막는다
- **service_role·secret 키는 어디에도 넣지 않는다.** 넣으면 앱이 알아보고 온라인 기능을 끈다

## 8. 온라인 특수판 빌드

`v*` 태그를 푸시하면 릴리스 CI 가 보통 판과 함께 온라인 특수판을 빌드해 같은 릴리스에 올린다. CI 는 아래 「GitHub Secrets 넣기」의 두 시크릿으로 주소와 키를 넣는다. 둘 중 하나라도 없으면 온라인 특수판만 건너뛴다.

### GitHub Secrets 넣기

저장소 시크릿 `VITE_SUPABASE_URL`·`VITE_SUPABASE_ANON_KEY` 에 7절의 두 값을 넣는다. 방 주인이 `.env.local` 이 있는 폴더(저장소 루트)에서 한 번 실행한다.
값은 파이프로 `gh secret set` 의 표준 입력에 넘겨서 화면·셸 기록에 남지 않는다. `.env.local` 의 값은 따옴표 없이 적어 둔다.

```bash
GH_TOKEN="$(gh auth token --hostname github.com --user blueeeeg)" sh -c 'grep "^VITE_SUPABASE_URL=" .env.local | cut -d= -f2- | gh secret set VITE_SUPABASE_URL -R blueeeeg/maple-companion'
GH_TOKEN="$(gh auth token --hostname github.com --user blueeeeg)" sh -c 'grep "^VITE_SUPABASE_ANON_KEY=" .env.local | cut -d= -f2- | gh secret set VITE_SUPABASE_ANON_KEY -R blueeeeg/maple-companion'
gh secret list -R blueeeeg/maple-companion   # 이름과 넣은 때만 보인다
```

- anon 키만 넣는다. service_role·secret 키를 넣으면 앱이 알아보고 온라인 기능을 끈다
- 서버 주소나 키를 바꾸면 같은 명령을 다시 실행하고 다음 태그부터 반영된다. 이미 설치한 앱은 업데이트를 받아야 새 값을 쓴다

### 손으로 빌드하기

온라인 특수판 빌드 전에 `src-tauri/icons-release/tray-icon.png` 를 둔다. 번들 리소스라 파일이 없으면 빌드가 멈춘다. 이 폴더는 gitignore 라 커밋되지 않는다.

```bash
pnpm install
pnpm tauri build --config src-tauri/tauri.online.conf.json
# macOS 유니버설: pnpm tauri build --config src-tauri/tauri.online.conf.json --target universal-apple-darwin
```

결과물은 `src-tauri/target/release/bundle/` (유니버설이면 `target/universal-apple-darwin/release/bundle/`) 아래 `Maple Companion Online` 이다.
보통 판과 이름·식별자(`com.maplecompanion.online`)가 달라 같이 깔아도 캐릭터·설정·캐시가 섞이지 않는다.
손으로 만든 빌드는 업데이트 파일을 만들지 않는다. 친구들에게는 릴리스의 「Maple Companion Online」 파일을 받게 한다.

## 9. 되는지 확인하기

1. `pnpm dev:online` 으로 브라우저에서 연다(<http://localhost:1420>). HUD 오른쪽에 노란 점과 「입장하기」, 그리고 비밀번호 창이 뜬다
2. 비밀번호를 넣으면 초록 점과 「접속 1명」이 된다. SQL Editor 에서 `select * from public.members;` 에 행이 하나 생긴다
3. 다른 브라우저(또는 시크릿 창)로 하나 더 연다. 둘 다 설정에서 같은 마을에 머물게 하면 서로의 캐릭터가 이름표와 함께 보이고 「접속 2명」이 된다
4. 창을 누르고 Enter 를 눌러(또는 HUD 의 💬) 글을 보낸다. 두 창의 EXP 바 위에 줄이 뜨고, 같은 맵이면 머리 위에 말풍선이 뜬다. `select * from public.chat_messages order by id desc limit 5;` 에 남는다
5. 비밀번호를 틀리게 넣으면 「비밀번호가 달라요」, 다섯 번 틀리면 10분 동안 「너무 많이 틀렸어요」가 뜬다
6. 보스 차례가 와 있는 두 캐릭터로 한쪽이 보스 도전 창 「같이 도전」을 누르면 다른 쪽에 초대가 뜬다. 「참여」 → 「바로 시작」 하면 둘이 같은 보스 맵에서 같은 HP 게이지로 싸우고, 잡으면 둘 다 처치 기록이 1 늘어난다

## 운영 메모

- 무료 플랜의 실시간 한도 안에서 쓰려고 위치는 움직일 때만, 창이 보일 때만, 1초에 5번까지 보낸다
- 익명 계정은 Authentication → Users 에 쌓인다. 안 쓰는 계정을 지우면 그 계정의 멤버 자격과 채팅도 같이 지워진다
- 채팅을 바로 다 지우려면 `delete from public.chat_messages;`
