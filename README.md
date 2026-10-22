# Maple Companion

컴퓨터를 쓴 시간만큼 메이플스토리 캐릭터가 자라는 데스크톱 컴패니언. 비공식·비상업 팬메이드이며 메이플스토리 관련 권리는 NEXON 에 있다.

## 설치

macOS(Apple Silicon·Intel 둘 다)와 Windows 10·11(x64)용이 있다. 둘 다 [Releases 최신 버전](https://github.com/blueeeeg/maple-companion/releases/latest)에서 받는다.

### macOS

1. Releases 에서 `.dmg` 를 받는다. `.zip` 을 받아도 된다
2. `.dmg` 를 열고 `Maple Companion` 을 응용 프로그램 폴더로 끌어 놓는다. `.zip` 이면 풀어서 나온 앱을 응용 프로그램 폴더로 옮긴다
3. 처음 열 때 「확인되지 않은 개발자」 경고가 뜬다. Apple 공증(notarization)을 받지 않은 앱이라서다. 응용 프로그램 폴더에서 앱을 우클릭 → 「열기」 → 「열기」를 누르면 다음부터는 그냥 열린다. 그래도 안 열리면 터미널에서 아래를 한 번 실행한다

```bash
xattr -dr com.apple.quarantine "/Applications/Maple Companion.app"
```

### Windows

Windows 판은 CI 에서 빌드만 했고 실제 PC 에서는 아직 확인하지 않았다.

1. Releases 에서 `Maple.Companion_{버전}_x64-setup.exe` 를 받아 실행한다. `.msi` 를 써도 된다
2. 코드 서명을 하지 않은 앱이라 「Windows의 PC 보호」 창이 뜬다. 「추가 정보」를 누르고 「실행」을 누른다
3. 트레이 아이콘이 작업표시줄 오른쪽의 숨겨진 아이콘(^) 안에 들어가 있을 수 있다. 끌어서 작업표시줄로 꺼내 두면 바로 보인다

Windows 에서는 아래 설명의 「메뉴바」를 작업표시줄 오른쪽 알림 영역으로, Dock 을 작업표시줄로 읽는다. 펫 창은 작업표시줄 바로 위 오른쪽 구석에 뜨고, 메뉴바 모드 창은 트레이 아이콘 위로 열린다. 메뉴바 글자 대신 트레이 아이콘 툴팁에 상태가 나온다.

### 처음 실행

처음에는 화면 구석의 작은 창(펫 모드)으로 뜨고 Dock 에는 안 보인다. 메뉴바의 트레이 아이콘을 누르면(왼쪽·오른쪽 클릭 같음) 메뉴가 열린다. 메뉴 맨 위 항목으로 캐릭터(메뉴바 모드에서는 창)를 숨기거나 다시 띄우고, 펫 모드·메뉴바 모드를 바꾸거나(지금 모드에 체크) 「종료」로 끈다. 숨겨도 앱은 계속 돌아가서 활동 시간·사냥·BGM 이 이어진다. 캐릭터·맵·소리는 실행 중에 [maplestory.io](https://maplestory.io) 에서 받아 오므로 인터넷이 필요하다.

## 업데이트

**v0.1.0 에는 업데이트 기능이 없다.** v0.1.0 을 쓰고 있으면 다음 버전 한 번은 위 「설치」대로 손으로 받아 덮어쓴다(앱을 끄고 새 앱으로 바꿔 넣는다). 캐릭터는 앱 밖의 저장 폴더(아래 「저장 위치」)에 있어서 그대로 남는다. 그 다음 버전부터는 앱 안에서 업데이트한다.

- 앱을 켜고 30초쯤 뒤에 한 번, 그 뒤로 6시간마다 [Releases 최신 버전](https://github.com/blueeeeg/maple-companion/releases/latest)의 `latest.json` 을 본다. 인터넷이 안 되면 아무것도 띄우지 않고 30분 뒤에 다시 본다
- 새 버전이 있으면 OS 알림 「새 버전 vX.Y.Z 가 나왔어요」를 띄운다. 버전마다 한 번만 띄우고 앱을 다시 켜도 같은 버전은 다시 알리지 않는다. 전직 알림 설정과 상관없이 뜬다. 알림을 누르면 창이 열리고 트레이 메뉴로 안내한다
- 트레이 메뉴 「종료」 바로 위 항목이 업데이트 버튼이다. 평소에는 「현재 버전 v0.1.1」 처럼 지금 버전을 보여 주고 누를 수 없다. 새 버전이 있으면 「업데이트 (v0.1.2)」 로 바뀐다
- 누르면 받아서 설치하고 앱을 다시 켠다. 받는 동안 그 항목과 메뉴바 글자(Windows 는 트레이 툴팁)에 「업데이트 중… 42%」 가 나온다. 다시 켜기 전에 저장 파일을 마저 쓴다. 실패하면 항목이 「업데이트 실패 · 다시 시도 (v0.1.2)」 로 바뀌어 다시 누를 수 있다
- 받은 파일은 앱에 넣어 둔 공개키로 서명을 확인하고, 맞지 않으면 설치하지 않는다(`tauri-plugin-updater`)
- macOS 는 앱 번들을 통째로 바꿔 넣는다. 앱을 둔 폴더에 쓸 권한이 없으면 macOS 가 관리자 암호를 묻는다. Windows 는 설치 프로그램(`-setup.exe`)이 진행 창만 띄워 설치하고 앱을 다시 켠다. Windows 업데이트는 실제 PC 에서 아직 확인하지 않았다

## 기능

- 키보드·마우스 입력이 있는 동안(기본 2분 넘게 입력이 없으면 멈춤) 경험치가 쌓인다
- 초보자에서 6차 전직(Lv.260)까지. Lv.10 이 되면 원작 NPC 대화창이 뜬다. 메이플 아일랜드의 마이가 길을 묻고, 고른 직업의 전직관(주먹펴고 일어서·하인즈·헬레나·다크로드·카이린)이 「예」를 받으면 전직한다. 대화를 그만둬도 HUD 의 「전직 가능!」 버튼으로 다시 연다
- 2차부터 6차 전직은 레벨이 되면 저절로 되고, 같은 전직관이 축하 대화를 띄운다. 축하 창은 화면을 어둡게 하지 않고 게임도 멈추지 않는다. 대화가 겹치면 앞 대화가 끝난 뒤에 연다
- 직업 고르기(Lv.10)와 2차 이상 전직은 창이 숨어 있거나 다른 앱을 보고 있으면 OS 알림으로 알린다. 같은 일은 한 번만 알리고, 레벨업·보스는 알리지 않는다. 알림을 누르면 창이 열리고 직업 고르기 대화가 닫혀 있었으면 다시 연다. 직업을 아직 안 골랐으면 메뉴바 글자가 「Lv.10 · 전직 가능!」 이 된다(Windows 는 트레이 툴팁)
- 캐릭터가 실제 마을 맵의 발판 위를 돌아다니고 마을 BGM 이 나온다. 기본 8분마다 다른 마을로 옮긴다
- 기본 활동 3분마다 그 마을 몬스터가 나와 자동으로 사냥한다. 몬스터를 누르면 추가 타격
- 기본 20번째 사냥마다(활동 약 1시간) 보스가 나온다. 레벨에 맞는 보스 중 가장 높은 두 마리에서 고르고, 그 보스를 잡는 원작 맵으로 옮겨 20~40초 싸운 뒤 마을로 돌아온다. 기본 설정이면 경험치는 보통 몬스터의 20배, 메소는 10배. 창을 닫아 둔 사이 돌아온 보스 차례는 애니메이션 없이 정산한다
- 캐릭터는 6명까지. 캐릭터마다 이름·외형(헤어·얼굴·피부)·레벨·직업·메소·몬스터 기록을 따로 가진다
- 활동 시간은 지금 플레이 중인 캐릭터에만 쌓인다. 앱을 켜면 마지막에 플레이한 캐릭터로 바로 들어가고, HUD 의 ⚙️ 메뉴 「캐릭터 선택」으로 캐릭터 선택 화면에 간다
- HUD 의 캐시 동전 버튼으로 캐시샵을 연다. 사냥으로 모은 메소로 실제 캐시 아이템(모자·한벌옷·상의·하의·신발·장갑·망토·무기 외형·얼굴장식·눈장식)을 사서 입는다. 상점은 같은 창 안에 뜨고 열려 있는 동안 맵과 BGM 이 멈춘다
  - 아이템을 누르면 왼쪽 미리보기에 입혀 보고, 「구입하기」→ 확인을 누르면 사서 바로 입는다. 「보유」 탭에서 산 아이템을 입고 벗는다. 이름으로 찾을 수 있다
  - 캐시 아이템은 같은 자리의 직업 장비 겉모습을 덮는다. 캐시 한벌옷은 상의·하의를, 캐시 상의·하의는 직업 한벌옷을 가린다. 캐시 무기는 진짜 무기 위에 그려져서 무기가 없는 초보자는 살 수 없다
  - 옷장(산 아이템)과 입은 옷은 캐릭터마다 따로다. 맵·캐릭터 선택 화면·미리보기가 같은 규칙(`composeLook`)으로 그린다
  - 가격은 부위별 고정이다(`src/game/cashShop.ts`). 하루 4시간 쓰면 Lv.60~200 캐릭터가 싼 부위는 하루 1~2개 사고, 한벌옷·무기는 2~4일 모은다. 레벨별 하루 벌이는 `src/game/cashShop.test.ts` 가 보스 메소까지 넣어 계산한다

## 설정

HUD 오른쪽 ⚙️ 메뉴의 「설정」이나 트레이 메뉴 「설정」으로 연다. HUD 가 좁아서(긴 직업 이름·휴식 중·억 단위 메소가 겹치면 이미 꽉 찬다) 소리 끄기·설정·캐릭터 선택은 ⚙️ 버튼 하나의 메뉴로 묶었다. 설정 창은 캐시샵처럼 같은 창 안에 뜨고 열려 있는 동안 맵과 BGM 이 멈춘다. 「확인」을 눌러야 저장되고 「취소」·Esc·창 밖 클릭은 고친 것을 버린다. 설정은 캐릭터마다가 아니라 앱 전체에 하나이고 캐릭터 목록과 같은 저장 파일(아래 「저장 위치」)에 판 번호와 함께 저장한다. 깨졌거나 목록에 없는 값은 기본값으로 읽는다(`src/game/settings.ts`).

| 항목 | 고르는 값 | 기본 |
|---|---|---|
| 몬스터 | 활동 1·3·5·10분마다 / 끄기 | 3분 |
| 보스 | 사냥 10·20·40번마다 / 끄기 | 20번 |
| 데미지 | 숫자 표시 켜기·끄기 | 켜기 |
| 마을 이동 | 자동 켜기·끄기, 4·8·15·30분마다 | 켜기 · 8분 |
| 마을 고정 | 자동 / 지금 캐릭터에게 열린 마을 하나 | 자동 |
| 배경음악 | 음량 0~100, 음소거 | 35 · 켜기 |
| 레벨업 | 이펙트 원본 / 작게(0.65배), 전직 알림 켜기·끄기 | 원본 · 켜기 |
| 자리 비움 | 입력 없이 1·2·5·10분 지나면 활동 시간(성장) 멈춤 | 2분 |

- 몬스터 주기를 바꿔도 시간당 EXP·메소는 같다. 한 마리 보상(경험치 60, 메소)을 「주기 ÷ 3분」 배로 준다. 1분이면 한 마리 20, 10분이면 200 이다
- 보스 버튼은 「10번마다」처럼 사냥 차례로 적는다. 보통 몬스터 몇 마리를 잡아야 나오는 것이 아니고 활동 시간으로 온다(몬스터 주기 × 보스 간격). 안내 줄에 지금 몬스터 주기로 잰 시간(기본 「활동 약 1시간마다」)을 같이 적고, 몬스터·보스 값을 바꾸면 바로 따라 바뀐다
- 보스 간격을 바꿔도 시간당 보상은 같다. 보스는 지난 보스 뒤로 사냥한 시간만큼 보스 몫을 모았다가 한 번에 준다. 몫은 그 시간의 보통 몬스터 보상에 경험치는 19/20, 메소는 9/20 을 곱한 값이다. 기본 설정이면 보스가 경험치 20배·메소 10배를 주는 값이고, 10번마다면 10.5배·5.5배, 40번마다면 39배·19배다
- 그래서 시간당 경험치는 어느 조합이든 활동 3600 + 사냥 2340(보통 몬스터 1200 + 보스 몫 1140)이다. 보스를 끄면 보스 몫(시간당 EXP 19%·메소 31%)을, 몬스터를 끄면 보스도 안 나오고 사냥 몫 전부(시간당 EXP 39%·메소 전부)를 못 받는다. 활동 시간 경험치는 그대로 쌓인다. 레벨에 맞는 보스가 없는 Lv.10 미만은 보스 차례가 보통 몬스터로 지나가고 모인 몫은 첫 보스 때 받는다
- 사냥 진행은 마리 수가 아니라 사냥으로 바꾼 활동 시간(초)으로 센다(`huntSeconds`). 주기를 바꿔도 쌓인 진행이 초 단위로 이어지니 몬스터가 몰려나오거나 한참 안 나오지 않는다. 주기를 줄여 쌓인 진행이 새 주기 여러 번 몫이 되면 한 마리만 바로 나오고 나머지 몫은 그 한 마리 보상에 보통 몬스터 비율로 얹는다. 몬스터를 꺼 둔 동안의 활동 시간은 사냥으로 치지 않아서 다시 켜도 그동안의 몬스터가 한꺼번에 나오지 않는다. 예전 저장은 「치른 사냥 수 × 3분」 으로 옮긴다
- `src/game/settings.test.ts` 가 1·3·5·10분 × 10·20·40번 열두 조합을 20시간 돌려 시간당 경험치가 똑같고 메소는 반올림 차이(0.5% 미만)뿐인 것, 주기·보스 간격을 수시로 바꿔도 안 쓴 진행만큼만 차이 나는 것을 확인한다
- 자리 비움 판정은 Rust(`activity.rs`)가 한다. 프론트가 `set_idle_limit` 명령으로 넘기면 activity.json 에 남겨 다음 실행에는 프론트가 뜨기 전부터 그 값으로 잰다. 브라우저로 볼 때는 대체 구현이 같은 값을 쓴다
- 「마을 고정」을 고르면 자동 이동은 쉬고 새 마을이 열려도 옮기지 않는다. 고정한 마을이 아직 안 열린 캐릭터는 자동으로 돈다
- 마을을 고정해 두면 「마을 이동」 줄의 시간 버튼 자리에 「리스항구 고정 중」처럼 고정한 마을이 뜨고, 안내 줄이 마을 고정을 「자동」으로 바꾸면 고를 수 있다고 알린다. 「자동」 체크를 끄면 시간 버튼이 흐려지고 안내 줄이 켜면 고를 수 있다고 알린다
- 배경음악 음소거는 HUD 메뉴의 「소리 끄기」와 같은 값이다. 음량을 0 으로 둔 채 「소리 켜기」를 누르면 기본 음량으로 돌아온다
- 전직 알림은 설정 창에 줄을 더 넣을 높이가 없어 레벨업 줄에 있다. 알림은 `tauri-plugin-notification` 으로 띄우고, 처음 알릴 때 권한을 묻는다. macOS 는 처음 알림이 갈 때 시스템이 허용 여부를 묻고, 거절했으면 시스템 설정 → 알림에서 켠다. Windows 는 따로 묻지 않고, 설치 프로그램이 시작 메뉴 바로가기에 앱 ID(`com.maplecompanion.app`)를 붙여 둬야 알림이 뜬다. 그래서 설치한 앱에서만 앱 이름으로 뜨고 `pnpm tauri dev` 에서는 PowerShell 이름으로 뜬다. 꺼져 있으면 설정 → 시스템 → 알림에서 켠다. 브라우저로 볼 때는 웹 Notification 으로 띄운다

설정 창은 원작 시스템 옵션 창 `UI/UIWindow2.img/SysOpt/backgrnd`(283×354)를 원본 크기로 쓰되 위 198px·아래 32px 띠만 잘라 230 높이로 잇는다. 확인 `MemoInGame/Get/BtOK`·취소 `Basic.img/BtCancel4`(40×16), 음량 슬라이더 `Basic.img/HScr8`(양 끝 `prev0`·`next0`, 가운데 `base`, 손잡이 `thumb0`·`thumb1`), 체크 상자 `Basic.img/CheckBox0`(11×11)도 `_Canvas` 로 받아 원본 크기로 쓴다. 안쪽 회색 판과 항목 칸은 원작 옵션 창 색을 CSS 로 옮겼다. 그림을 못 받으면 같은 배치의 어두운 창과 글자 버튼으로 남는다.

## 저장 위치

앱(Tauri)은 데이터를 macOS 는 `~/Library/Application Support/com.maplecompanion.app/`, Windows 는 `%APPDATA%\com.maplecompanion.app\`(`C:\Users\{사용자}\AppData\Roaming\com.maplecompanion.app\`)에 둔다. 개발 빌드(`pnpm tauri dev`)와 배포 앱이 같은 폴더를 쓴다.

| 파일 | 내용 |
|---|---|
| `game-state.json` | 캐릭터 목록(레벨·직업·메소·옷장 등)과 설정 |
| `game-state.json.bak` | 바로 앞에 저장한 `game-state.json`. 본 파일을 못 읽으면 이것으로 연다 |
| `activity.json` | 앱 전체 활동 시간, 창 모드·크기, 자리 비움 판정 시간 |
| `tray-icon.png`·`custom-tray-icon.png` | 트레이 아이콘 |
| `app-icon-applied.txt` | macOS 앱 아이콘을 마지막으로 붙인 그림의 해시, 또는 붙이지 못한 기록 |
| `bgm/` | 한 번 받은 맵 BGM(`KMS-389-{맵 ID}.mp3`). 지워도 되고, 지우면 다음에 그 맵에서 다시 받는다 |

- 저장은 바뀔 때마다 0.3초쯤 모았다가 쓰고, 「종료」로 끌 때 남은 것을 바로 쓴다. 임시 파일에 다 쓴 뒤 바꿔치기해서 도중에 꺼져도 반만 쓰인 파일이 남지 않는다(`src-tauri/src/game_state.rs`)
- 본 파일이 깨져 있으면 `game-state.json.corrupt` 로 복사해 두고 `.bak` 으로 연다
- **백업**: 앱을 끄고 위 폴더를 통째로 복사한다. 되돌릴 때는 앱을 끄고 복사해 둔 `game-state.json` 을 제자리에 넣는다
- **초기화**: 앱을 끄고 `game-state.json`·`game-state.json.bak` 을 지운다. 활동 시간까지 지우려면 `activity.json` 도 지운다
- 개발 빌드와 배포 앱을 **동시에** 켜지 않는다. 둘 다 같은 파일에 자기 메모리의 목록을 통째로 써서, 나중에 쓴 쪽이 다른 쪽에서 만든 변경을 덮는다

예전 판은 캐릭터·설정을 WebView localStorage(`maple-companion:characters`·`maple-companion:settings`, 그 전에는 `maple-companion:save`)에 두었다. localStorage 는 앱마다 따로라(개발 빌드 `~/Library/WebKit/maple-companion/`, 배포 앱 `~/Library/WebKit/com.maplecompanion.app/`) 개발 빌드에서 키운 캐릭터가 배포 앱에서는 안 보였다. 지금 판은 켤 때 그 앱의 localStorage 를 아직 안 옮겼으면 `game-state.json` 과 합친다(`src/platform/gameState.ts`).

- 캐릭터는 id 로 합친다. 같은 캐릭터가 양쪽에 있으면 활동 시간 + 사냥 경험치가 큰 쪽을 쓰고 옷장은 합친다(`mergeRosters`, `src/game/save.test.ts`)
- 고른 캐릭터·소리 끄기·설정은 파일에 이미 있으면 파일 값을 쓴다
- 다 옮기면 localStorage 에 `maple-companion:migrated-to-file` 표시를 남기고 다음부터는 파일만 읽는다. localStorage 값은 지우지 않고 백업으로 둔다
- 개발 빌드에서 키운 캐릭터는 새 판 개발 빌드를 한 번 켜면 옮겨진다. 배포 앱에서 키운 캐릭터는 새 판 배포 앱을 한 번 켜면 옮겨진다

브라우저로 화면만 볼 때(`pnpm dev`)는 지금처럼 localStorage 에만 저장한다.

## 리소스

캐릭터·몬스터·맵·BGM 은 저장소와 앱에 넣지 않는다. 실행 중에 팬 API [maplestory.io](https://maplestory.io) (KMS 389) 에서 받아 온다. 보내는 값은 공개된 맵·몹·아이템 ID 뿐이다.

BGM 은 주소를 audio 에 바로 걸지 않고 곡을 통째로 받아 app data 의 `bgm/` 에 남긴 뒤 거기서 튼다(`src/audio/bgm.ts`, `src-tauri/src/bgm_cache.rs`). 바로 걸면 WebKit 이 곡을 구간마다 따로 받고 디스크 캐시에도 안 남겨서, 팬 API 가 늦거나 520 을 내면 곡 중간·반복 지점에서 끊겼다. 지금은 맵마다 처음 한 번만 받고 다음부터는 네트워크 없이 바로 튼다. 받는 동안에는 앞 곡을 계속 틀다가 다 받으면 바꾸고, 못 받으면 15초 뒤 다시 받는다. 같은 곡을 다시 부르면(보스 맵에서 돌아올 때 등) 처음부터 다시 틀지 않는다. 브라우저(`pnpm dev`)에서는 Cache API(`maple-companion:bgm`)에 남긴다.

맵은 전체 렌더(`render/0`)를 캐릭터 뒤에 깔고, 위쪽 레이어를 따로 받아(`render/layer/{n}/0?minX=&minY=`) 캐릭터 앞에 그린다. 그래서 무릉 다리 난간 같은 앞쪽 타일·오브젝트가 캐릭터를 가린다. 앞 레이어는 마을이 뜨고 몇 초 뒤에 들어온다.

캐릭터 선택 화면 UI, 대미지 숫자, 레벨업·전직 이펙트는 WZ 원본 그림을 받는다. 그림은 `/api/wz/img/KMS/389/{경로}`, 노드 값은 `/api/wz/KMS/389/{경로}` 에 있다. UI 는 `UI/Login.img` 이고 나머지는 `Effect/BasicEff.img` 의 `NoRed0·NoRed1`(대미지)·`NoCri0·NoCri1`(크리티컬)·`LevelUp`·`JobChanged` 다. 대부분 `_outlink` 로 `_Canvas` 아래 그림을 가리켜서 `_Canvas` 경로로 받는다(원래 자리로 받으면 1×1 빈 그림이 온다). 원점·딜레이는 코드에 적어 두었고, 그림을 못 받으면 글자로 대신 띄운다.

NPC 대화창은 `UI/UIWindow2.img/UtilDlgEx` 다. 폭 519 의 위(`t`)·가운데(`c`, 세로 반복)·아래(`s`) 띠를 원본 크기 그대로 두고, 세로 줄이 똑같은 두 구간(NPC 칸 x 80~100, 글 칸 x 190~349)을 잘라 내 340 폭으로 잇는다. 높이는 글과 초상화에 맞춰 가운데 띠 개수로 정한다(최대 215). 이름표 `bar`, 버튼 `BtNext`(다음)·`BtYes`·`BtNo`·`BtClose`(대화 그만하기)·`BtOK`(→ `Basic.img/BtOK4`), 선택지 화살표 `UIWindow.img/UtilDlgEx/dot0·dot1` 도 `_Canvas` 로 받는다. NPC 초상화는 `/npc/{NPC ID}/render/stand/0` 원본 크기다. 마이 12100, 주먹펴고 일어서 1022000, 하인즈 1032001, 헬레나 1012100, 다크로드 1052001, 카이린 1090000. 창 그림을 못 받으면 같은 배치의 밋밋한 창과 글자 버튼으로 남는다.

보스 HP 게이지는 `UI/UIWindow2.img/MobGage` 다. `backgrnd`(아이콘 틀)·`Mob/{몹 ID}`(보스 아이콘)·`backgrnd2`·`backgrnd4`(게이지 틀 양 끝)는 `_Canvas` 로, `backgrnd3`(틀 가운데)·`Gage/{색}/1`(1px 색 띠)은 원래 자리로 받는다. 색 번호는 몹 정보의 `hpTagColor`(남은 HP)·`hpTagBackgroundColor`(깎인 칸)다. 보스는 몸집이 크고 동작마다 그림 크기가 달라서 프레임마다 `Mob/{몹 ID}.img/{동작}/{프레임}/origin` 을 받아 원작 기준점에 맞춰 그린다.

캐시샵 목록은 `/item?subCategoryFilter={하위 분류}&cashFilter=true&count=20000` 로 처음 연 부위만 받아 메모리에 둔다(모자는 약 0.7MB). 무기 외형의 하위 분류는 `Cash`(1702xxx~1703xxx)다. `requiredGender` 는 장비 ID 천의 자리와 같아서 0 남자·1 여자·2 이상 공용으로 보고 캐릭터 성별에 맞는 것만 보여 준다. 이름이 빈 아이템은 뺀다. 무기 외형은 고를 때 `/api/wz/KMS/389/Character/Weapon/0{ID}.img` 의 자식(그림이 있는 무기 종류 번호)을 받아, 30(한손검) 그림이 있거나 지금 무기 종류 그림이 있을 때만 판다. 옛 단검 전용 외형을 활에 씌우면 쏘는 동작에서 무기가 안 그려진다. 아이콘은 `/item/{ID}/icon` 이다.

캐시샵 UI 는 `UI/CashShop.img` 원본 그림을 `_Canvas` 로 받는다. 바탕 `Base/backgrnd`, 미리보기 배경 `Base/Preview/0`, 부위 탭 글자 `CSTab/SubTab/4/{Enable,Disable}/n`, 버튼 `CSList/BtBuy`(구입하기)·`CSChar/BtDefaultAvatar`(원래대로)·`CSTab/BtExit`·`CSNotice/BtOK`·`BtCancel`, 페이지 넘김 `CSNotice/BTForward`(◀)·`BTBackward`(▶, 이름과 방향이 반대다), 검색 칸 `CSLocker/storageSearch/backgrnd`, 빈 목록 `Base/noItem_mini`, HUD 버튼 `CashItem/0`(캐시 동전). EXIT 버튼·빈 목록 그림·상점 위 메소 아이콘만 정확히 절반으로 줄이고 나머지는 원본 크기다. 그림을 못 받으면 글자 버튼으로 남고, 목록을 못 받으면 탭을 다시 눌러 받으라고 띄운다.

메뉴바 트레이 아이콘은 아이템 「단풍잎」(4001126) 아이콘이다. 프론트가 받아 Rust 에 넘기고, Rust 는 app data 의 `tray-icon.png` 에 저장해 다음 실행부터 네트워크 없이 바로 쓴다. 못 받으면 기본 아이콘이 남는다. 같은 폴더에 `custom-tray-icon.png` 를 두면 그 그림이 먼저 쓰이고 단풍잎은 내려받아도 덮어쓰지 않는다(36×36 PNG 권장, 지우면 단풍잎으로 돌아간다). 앱·번들 아이콘(`src-tauri/icons`)은 넥슨 그림을 넣어 배포하게 되므로 바꾸지 않는다.

앱 아이콘(Finder·Spotlight)은 macOS 에서만 트레이 아이콘과 같은 그림으로 바꾼다. 공개 저장소와 릴리스 파일에 넥슨 그림을 넣지 않으려고, 각자의 컴퓨터에서 실행 중에 붙인다(`src-tauri/src/app_icon.rs`).

- 트레이 그림(`custom-tray-icon.png` 가 있으면 그것, 없으면 `tray-icon.png`)의 투명한 가장자리를 잘라 내고 1024×1024 의 가운데 824px 안에 들어가도록 정수배로 늘린다. 픽셀 그림이라 이웃 픽셀을 섞지 않는다
- `NSWorkspace.setIcon(_:forFile:)` 으로 설치된 `.app` 에 Finder 사용자 아이콘을 붙인다. 번들 맨 위에 `Icon\r` 파일이 생기고 번들 폴더에 FinderInfo 확장 속성이 붙는다. 실행 중인 앱 아이콘(`NSApplication.applicationIconImage`)도 같은 그림으로 바꾼다
- 붙인 그림의 해시를 app data 의 `app-icon-applied.txt` 에 남겨, 그림이 같고 `Icon\r` 이 남아 있으면 다시 쓰지 않는다. 업데이트는 `.app` 을 통째로 바꿔 넣어 아이콘이 사라지므로 다음 실행에서 다시 붙인다
- `.app` 이 아닌 곳에서 띄운 개발 실행(`pnpm tauri dev`)은 번들이 없어 붙이지 않는다. 디스크 이미지 안에서 바로 띄우거나 macOS 가 앱 수정을 막는 등 번들에 쓸 수 없으면 로그만 남기고 기본 아이콘을 둔다. 실패도 `app-icon-applied.txt` 에 남겨, 차단 알림이 실행할 때마다 뜨지 않도록 그림이 바뀌거나 번들 폴더가 바뀔 때(업데이트·다시 설치로 inode 가 달라질 때)까지 다시 해 보지 않는다
- 코드 서명: `codesign --verify` 는 그대로 통과한다. `--strict` 는 번들 폴더의 FinderInfo 때문에 실패한다. 실행 파일 서명은 바뀌지 않고, 업데이트는 받은 압축 파일의 서명만 확인하므로 영향이 없다
- Windows 시작 메뉴·작업표시줄 아이콘은 exe 안의 리소스라 실행 중에 바꿀 수 없다. 창 아이콘(Alt+Tab)만 같은 그림으로 바꾼다

맵 렌더 이미지에는 원점 정보가 없어서, 처음 들어가는 마을은 발판 좌표를 이미지의 땅 경계에 맞추는 계산을 한 번 하고 결과를 저장해 둔다(`src/maple/ground.ts`).

## 개발

```bash
pnpm install
pnpm tauri dev                 # 앱
MAPLE_SPEED=60 pnpm tauri dev  # 60배속으로 경험치 확인
pnpm dev                       # 브라우저로 화면만 (http://localhost:1420/?speed=60)
                               # ?boss=8860000 이면 그 보스(?boss=1 이면 레벨에 맞는 보스)와 바로 싸운다. 개발 서버에서만
pnpm test                      # 단위 테스트
pnpm tauri build --target universal-apple-darwin   # 배포용 .app·.dmg (src-tauri/target/universal-apple-darwin/release/bundle)
pnpm tauri build               # Windows 에서 실행하면 -setup.exe·.msi (src-tauri/target/release/bundle/nsis·msi)
```

배포는 `v*` 태그를 푸시하면 GitHub Actions(`.github/workflows/release.yml`)가 돈다. `release` 잡이 릴리스를 먼저 만들고, 그 뒤 `macos` 잡(macos-latest)이 유니버설 앱 `.dmg`·`.zip`·`.app.tar.gz` 를, `windows` 잡(windows-latest)이 `-setup.exe`(NSIS)·`.msi` 를 같은 릴리스에 올린다. 두 잡이 릴리스를 각자 만들지 않아서 둘이 생기거나 서로 부딪치지 않는다. Actions 화면에서 「Run workflow」로 수동 실행하면 Windows 빌드만 돌고, 설치 파일은 릴리스가 아니라 그 실행의 Artifacts(`maple-companion-windows`)에 올라간다. macOS 서명은 ad-hoc(`bundle.macOS.signingIdentity: "-"`)이고 공증은 하지 않는다. Windows 는 서명하지 않는다. 버전은 `package.json`·`src-tauri/tauri.conf.json`·`src-tauri/Cargo.toml` 세 곳을 같이 올린다.

### 업데이트 서명

앱 안 업데이트(「업데이트」 절)는 업데이트 파일을 서명키로 서명해 올리고 앱이 공개키로 확인한다.

- 공개키는 `src-tauri/tauri.conf.json` 의 `plugins.updater.pubkey` 에 있다. 비밀키는 저장소 밖 `~/.tauri/maple-companion.key` 에 있고 비밀번호는 없다(`pnpm tauri signer generate -w ~/.tauri/maple-companion.key` 로 만들었다)
- 태그를 푸시하기 전에 GitHub 저장소 Settings → Secrets and variables → Actions 에 `TAURI_SIGNING_PRIVATE_KEY` 를 등록한다. 값은 `~/.tauri/maple-companion.key` 파일 내용 전체다. 비밀번호가 없는 키라 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` 는 등록하지 않는다. 워크플로가 둘 다 넘기는데 등록하지 않은 시크릿은 빈 문자열로 들어간다
- `bundle.createUpdaterArtifacts` 를 켜 두어서 비밀키가 없으면 빌드가 서명 단계에서 실패한다. 손으로 빌드할 때는 `TAURI_SIGNING_PRIVATE_KEY=~/.tauri/maple-companion.key pnpm tauri build ...` 처럼 붙인다
- `latest.json` 은 tauri-action 이 만들어 릴리스에 올린다. `macos` 잡이 유니버설 `.app.tar.gz` 로 `darwin-aarch64`·`darwin-x86_64` 를 넣고, `windows` 잡이 `-setup.exe`(`updaterJsonPreferNsis`)로 `windows-x86_64` 를 더한다. tauri-action 은 이미 올라간 `latest.json` 을 받아 자기 플랫폼을 더해 다시 올려서, 두 잡이 동시에 끝나면 한쪽이 빠진다. 그래서 `windows` 잡은 `macos` 잡이 끝난 뒤에 돈다
- **비밀키를 백업한다.** 키 파일을 비밀번호 관리자 같은 저장소 밖 안전한 곳에 한 벌 더 둔다. 키를 잃으면 이미 설치된 앱은 새 업데이트의 서명을 확인할 수 없어 다시는 앱 안에서 업데이트하지 못한다. 새 키로 바꾸면 모든 사용자가 한 번 손으로 다시 설치해야 한다

Rust 가 필요하다(`rustup`). 트레이 아이콘은 왼쪽·오른쪽 클릭 모두 같은 메뉴를 연다. 메뉴 맨 위 항목이 창을 띄우거나 숨긴다. 글자는 모드와 창 상태에 따라 바뀐다(펫 모드는 「캐릭터 숨기기/보이기」, 메뉴바 모드는 「창 닫기/열기」). 그 아래에서 펫 모드(화면 구석 창)와 메뉴바 모드(메뉴바 아이콘 아래에 여는 창)를 바꾸고, 지금 모드에 체크가 붙는다. 메뉴바 모드에서 아이콘 위치를 아직 모르면 화면 오른쪽 위에 연다. Windows 는 메뉴바 모드 창을 트레이 아이콘 위로 열고(화면 밖으로 나가면 모니터 안으로 당긴다), 아이콘 위치를 모르거나 펫 모드일 때는 작업표시줄을 뺀 영역의 오른쪽 아래 구석에 둔다. 테두리 없는 창도 Alt+F4 로 닫히므로 닫기는 숨기기로 바꿨다.

트레이 메뉴 「설정」은 창을 띄우고 설정 화면을 연다(맵 화면일 때만). 트레이 메뉴 「크기」에서 창 크기를 75%~200% 로 고른다. 캐릭터·맵·HUD 가 같이 커지고 고른 크기는 다음 실행에도 남는다. 브라우저로 볼 때는 `?scale=1.5` 를 붙인다.

## 구조

```
src/
  main.ts            틱마다 활동 시간 → 레벨·전직·사냥·마을 이동을 정한다
  game/              레벨 곡선, 직업, 마을·몬스터 데이터, 사냥 정산, 저장
    bosses.ts        보스 목록(몹·맵 ID), 보스 차례·고르기·보상, 사냥 한 번 정산(settleHunt)
    encounters.ts    몬스터 주기·사냥 진행(초 단위)·한 마리 보상
    settings.ts      설정 값·기본값·저장, 시간당 보상 몫 계산
    alerts.ts        OS 알림으로 알릴 일(직업 고르기·전직)의 문구, 알릴지 판정, 한 번만 알리기
    updates.ts       업데이트를 언제 확인할지, 새 버전 알림을 버전마다 한 번만, 알림 문구
    cashShop.ts      캐시샵 부위·가격, 캐시 아이템을 직업 장비에 덧입히는 규칙(composeLook), 사기·입기
    characters.ts    캐릭터 목록, 활동 시간 나누기, 이름 검사, 예전 저장 옮기기
    appearance.ts    캐릭터 생성에서 고르는 성별·헤어·얼굴·피부
  maple/             maplestory.io 주소, 텍스처 로딩, 발판·맵 이미지 맞추기, 대미지 숫자·레벨업 이펙트(basicEff.ts)
  scene/             PixiJS 화면 (맵, 캐릭터, 몬스터, 카메라)
  audio/bgm.ts       마을·보스 맵 BGM. 곡을 통째로 받아 남긴 것으로 틀고, 못 받으면 다시 받고, 멈추면 다시 건다
  ui/hud.ts          레벨·경험치 바·메소·「전직 가능!」·캐시샵 버튼·⚙️ 메뉴(소리·설정·캐릭터 선택)
  ui/settings.ts     설정 화면
  ui/npcDialog.ts    원작 NPC 대화창과 전직 대화(직업 선택·전직 축하). 대화가 겹치면 차례로 띄운다
  ui/characterSelect.ts  캐릭터 선택·생성·삭제 화면
  ui/cashShop.ts     캐시샵 화면. 목록·무기 종류는 ui/cashCatalog.ts 가 받아 둔다
  ui/art.ts          원작 그림을 crossorigin 으로 미리 받고, 못 받으면 깨진 그림 대신 숨긴다
  platform/          Tauri 연결 (활동 시간·자리 비움 판정 시간, 창 모드·크기, 트레이 문구·「설정」). 브라우저에서는 대체 구현
    gameState.ts     캐릭터 목록·설정 읽기·쓰기. Tauri 는 game-state.json, 브라우저는 localStorage. localStorage 옮기기
    notification.ts  OS 알림 띄우기·권한 묻기, 알림을 눌러 창이 열린 것 받기. 브라우저는 웹 Notification
    updater.ts       때가 되면 Rust 에 업데이트를 묻고, 처음 보는 버전이면 알린다. 받기 시작·실패 받기. 브라우저는 안 한다
    bgmCache.ts      받은 맵 BGM 읽기·쓰기·지우기. Tauri 는 app data 의 bgm/, 브라우저는 Cache API
src-tauri/src/
  idle.rs            마지막 입력 후 지난 시간 (macOS CoreGraphics / Windows GetLastInputInfo)
  activity.rs        5초마다 활동 시간을 쌓아 app data 의 activity.json 에 저장. 자리 비움 판정 시간도 같이 저장
  game_state.rs      game-state.json 읽기·쓰기(임시 파일 → rename, .bak 백업). 저장을 잠깐 모았다가 쓰고 종료할 때 마저 쓴다
  tray_icon.rs       트레이 아이콘 PNG 읽기·저장. 메뉴바 높이(레티나 36px)에 맞게 늘리지 않고 가운데 둔다
  bgm_cache.rs       프론트가 받은 맵 BGM 을 app data 의 bgm/ 에 읽기·쓰기(임시 파일 → rename)·지우기. 곡은 JSON 이 아니라 바이트로 오간다
  app_icon.rs        트레이 그림으로 앱 아이콘 만들기(정수배 확대). macOS 는 .app 에 Finder 사용자 아이콘으로 붙이고, Windows 는 창 아이콘만
  updater.rs         업데이트 확인(check_update), 트레이 「업데이트」 항목 글자, 받기·설치·진행 표시, 저장 후 다시 켜기
  lib.rs             트레이(「설정」 포함), 펫·메뉴바 모드 전환, 창 크기, 알림을 누르면 창 열기, 프론트에 여는 명령
```

## 라이선스

코드는 [MIT](LICENSE) 다.

메이플스토리의 이름·그림·소리 등 모든 리소스의 권리는 NEXON 에 있다. 이 저장소에는 그 리소스를 하나도 넣지 않았고, 앱이 실행 중에 [maplestory.io](https://maplestory.io) 에서 받아 쓴다. 비공식·비상업 팬 프로젝트이며 NEXON 과 관계가 없다.
