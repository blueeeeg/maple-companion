use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// 캐릭터 목록·설정을 담는 파일. WebView localStorage 는 개발 빌드(http://localhost:1420)와 배포 앱(tauri://localhost)이
/// 서로 다른 저장소를 써서, 두 실행이 같은 데이터를 보도록 app data 에 둔다
pub const FILE_NAME: &str = "game-state.json";
const VERSION: u32 = 1;
/// 사냥·틱마다 저장이 몰려와서 잠깐 모았다가 한 번에 쓴다. 앱을 끌 때는 기다리지 않고 바로 쓴다
const WRITE_DELAY: Duration = Duration::from_millis(300);
const RETRY_DELAY: Duration = Duration::from_secs(2);
/// 틱(2초)마다 저장이 와서 매번 쓰면 fsync 가 하루 종일 디스크를 깨운다. 한 번 쓴 뒤 이만큼은 모은다
const WRITE_GAP: Duration = Duration::from_secs(10);

fn current_version() -> u32 {
    VERSION
}

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameState {
    #[serde(default = "current_version")]
    pub version: u32,
    /// 프론트 Roster 를 그대로 담는다. 모양은 프론트(save.ts)가 검사한다
    #[serde(default)]
    pub roster: Option<Value>,
    #[serde(default)]
    pub settings: Option<Value>,
}

/// 프론트가 보내는 저장 요청. 바뀐 쪽만 JSON 문자열로 온다. 문자열로 받는 건 프론트가 보낸 그 순간의 값을 고정하려는 것이다
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameStatePatch {
    /// load_game_state 가 준 화면 번호. 화면을 새로 띄운 뒤 늦게 도착한 앞 화면의 저장을 버린다
    pub session: u64,
    /// 한 화면 안에서 보낸 순서. IPC 요청이 늦게 도착해도 앞선 저장이 뒤 저장을 덮지 않게 한다
    pub seq: u64,
    pub roster: Option<String>,
    pub settings: Option<String>,
}

/// load_game_state 의 응답. 저장할 때 session 을 같이 보낸다
#[derive(Debug, Serialize)]
pub struct LoadedGameState {
    pub session: u64,
    #[serde(flatten)]
    pub state: GameState,
}

struct Inner {
    state: GameState,
    session: u64,
    roster_seq: u64,
    settings_seq: u64,
    dirty: bool,
    /// 지금 본 파일을 읽을 수 있는지. 깨진 파일을 .bak 으로 옮겨 멀쩡한 백업을 덮지 않으려고 센다
    main_is_good: bool,
}

pub struct GameStateStore {
    path: PathBuf,
    inner: Mutex<Inner>,
    wake: Condvar,
    /// 쓰는 스레드와 종료 시 flush 가 동시에 파일을 건드리지 않게 한다
    write_lock: Mutex<()>,
}

fn sibling(path: &Path, suffix: &str) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(suffix);
    path.with_file_name(name)
}

pub fn backup_path(path: &Path) -> PathBuf {
    sibling(path, ".bak")
}

fn read_state(path: &Path) -> Option<GameState> {
    let text = fs::read_to_string(path).ok()?;
    serde_json::from_str(&text).ok()
}

/// 본 파일을 못 읽으면 .bak 으로 연다. 둘 다 못 읽으면 빈 상태로 열고, 깨진 본 파일은 .corrupt 로 남겨 둔다
pub fn load_with_fallback(path: &Path) -> (GameState, bool) {
    if let Some(state) = read_state(path) {
        return (state, true);
    }
    if path.exists() {
        eprintln!("[game-state] {} 를 읽지 못해 백업으로 연다", path.display());
        let _ = fs::copy(path, sibling(path, ".corrupt"));
    }
    if let Some(state) = read_state(&backup_path(path)) {
        return (state, false);
    }
    (GameState { version: VERSION, ..GameState::default() }, false)
}

/// 임시 파일에 다 쓰고 fsync 한 뒤 rename 으로 바꿔치기한다. 도중에 꺼져도 본 파일이 반만 쓰인 채 남지 않는다.
/// backup 이면 바꾸기 전 본 파일을 .bak 으로 옮긴다. 두 rename 사이에 꺼지면 본 파일이 없지만 .bak 으로 연다
pub fn write_atomic(path: &Path, bytes: &[u8], backup: bool) -> std::io::Result<()> {
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    fs::create_dir_all(dir)?;
    let tmp = sibling(path, ".tmp");
    {
        let mut file = File::create(&tmp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
    }
    if backup && path.exists() {
        fs::rename(path, backup_path(path))?;
    }
    fs::rename(&tmp, path)?;
    // rename 자체가 디스크에 남도록 폴더도 fsync 한다. 안 되는 파일 시스템이면 넘어간다
    if let Ok(dir) = File::open(dir) {
        let _ = dir.sync_all();
    }
    Ok(())
}

impl GameStateStore {
    pub fn load(path: PathBuf) -> Self {
        let (state, main_is_good) = load_with_fallback(&path);
        Self {
            path,
            inner: Mutex::new(Inner {
                state,
                session: 0,
                roster_seq: 0,
                settings_seq: 0,
                dirty: false,
                main_is_good,
            }),
            wake: Condvar::new(),
            write_lock: Mutex::new(()),
        }
    }

    /// 프론트가 뜰 때 부른다. 새 화면 번호를 주고 저장 순서는 1부터 다시 센다.
    /// 앞 화면의 저장이 이 뒤에 도착해도 번호가 달라 받지 않는다(명령은 스레드 풀에서 돌아 순서가 바뀔 수 있다)
    pub fn open_session(&self) -> LoadedGameState {
        let mut inner = self.inner.lock().unwrap();
        inner.session += 1;
        inner.roster_seq = 0;
        inner.settings_seq = 0;
        LoadedGameState { session: inner.session, state: inner.state.clone() }
    }

    /// 받아 둔 저장 요청을 메모리에 반영한다. 바뀐 게 있으면 true
    pub fn apply(&self, patch: GameStatePatch) -> Result<bool, String> {
        let parse = |text: &str| serde_json::from_str::<Value>(text).map_err(|error| error.to_string());
        let roster = patch.roster.as_deref().map(parse).transpose()?;
        let settings = patch.settings.as_deref().map(parse).transpose()?;
        let mut inner = self.inner.lock().unwrap();
        if patch.session != inner.session {
            return Ok(false);
        }
        let mut changed = false;
        if let Some(roster) = roster {
            if patch.seq > inner.roster_seq {
                inner.roster_seq = patch.seq;
                inner.state.roster = Some(roster);
                changed = true;
            }
        }
        if let Some(settings) = settings {
            if patch.seq > inner.settings_seq {
                inner.settings_seq = patch.seq;
                inner.state.settings = Some(settings);
                changed = true;
            }
        }
        if changed {
            inner.dirty = true;
            self.wake.notify_one();
        }
        Ok(changed)
    }

    /// 아직 안 쓴 변경이 있으면 지금 쓴다
    pub fn flush(&self) -> std::io::Result<()> {
        let _writing = self.write_lock.lock().unwrap();
        let (state, backup) = {
            let mut inner = self.inner.lock().unwrap();
            if !inner.dirty {
                return Ok(());
            }
            inner.dirty = false;
            inner.state.version = VERSION;
            (inner.state.clone(), inner.main_is_good)
        };
        let result = serde_json::to_vec_pretty(&state)
            .map_err(std::io::Error::other)
            .and_then(|bytes| write_atomic(&self.path, &bytes, backup));
        let mut inner = self.inner.lock().unwrap();
        match &result {
            Ok(()) => inner.main_is_good = true,
            Err(_) => inner.dirty = true,
        }
        result
    }

    fn wait_dirty(&self) {
        let mut inner = self.inner.lock().unwrap();
        while !inner.dirty {
            inner = self.wake.wait(inner).unwrap();
        }
    }
}

pub fn spawn_writer(store: Arc<GameStateStore>) {
    thread::spawn(move || {
        loop {
            store.wait_dirty();
            thread::sleep(WRITE_DELAY);
            if let Err(error) = store.flush() {
                eprintln!("[game-state] 저장 실패: {error}");
                thread::sleep(RETRY_DELAY);
            } else {
                thread::sleep(WRITE_GAP);
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::sync::atomic::{AtomicU32, Ordering};

    fn temp_dir() -> PathBuf {
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!(
            "maple-game-state-test-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::SeqCst)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// 프론트처럼 불러온 뒤(첫 화면 = 1번) 저장한다
    fn opened(path: PathBuf) -> GameStateStore {
        let store = GameStateStore::load(path);
        assert_eq!(store.open_session().session, 1);
        store
    }

    fn patch_in(session: u64, seq: u64, roster: Option<Value>, settings: Option<Value>) -> GameStatePatch {
        GameStatePatch {
            session,
            seq,
            roster: roster.map(|value| value.to_string()),
            settings: settings.map(|value| value.to_string()),
        }
    }

    fn patch(seq: u64, roster: Option<Value>, settings: Option<Value>) -> GameStatePatch {
        patch_in(1, seq, roster, settings)
    }

    #[test]
    fn saved_state_reads_back() {
        let path = temp_dir().join(FILE_NAME);
        let store = opened(path.clone());
        store.apply(patch(1, Some(json!({ "characters": [1] })), Some(json!({ "bgmVolume": 10 })))).unwrap();
        store.flush().unwrap();

        let (state, good) = load_with_fallback(&path);
        assert!(good);
        assert_eq!(state.roster, Some(json!({ "characters": [1] })));
        assert_eq!(state.settings, Some(json!({ "bgmVolume": 10 })));
        assert!(!sibling(&path, ".tmp").exists());
    }

    #[test]
    fn previous_file_is_kept_as_backup() {
        let path = temp_dir().join(FILE_NAME);
        let store = opened(path.clone());
        store.apply(patch(1, Some(json!("first")), None)).unwrap();
        store.flush().unwrap();
        assert!(!backup_path(&path).exists());
        store.apply(patch(2, Some(json!("second")), None)).unwrap();
        store.flush().unwrap();

        assert_eq!(read_state(&path).unwrap().roster, Some(json!("second")));
        assert_eq!(read_state(&backup_path(&path)).unwrap().roster, Some(json!("first")));
    }

    #[test]
    fn corrupt_file_falls_back_to_backup() {
        let path = temp_dir().join(FILE_NAME);
        let store = opened(path.clone());
        store.apply(patch(1, Some(json!("good")), None)).unwrap();
        store.flush().unwrap();
        store.apply(patch(2, Some(json!("newer")), None)).unwrap();
        store.flush().unwrap();
        fs::write(&path, b"{\"roster\": \"tru").unwrap();

        let (state, good) = load_with_fallback(&path);
        assert!(!good);
        assert_eq!(state.roster, Some(json!("good")));
        assert!(sibling(&path, ".corrupt").exists());
    }

    #[test]
    fn corrupt_file_does_not_overwrite_good_backup() {
        let path = temp_dir().join(FILE_NAME);
        write_atomic(&path, b"not json", false).unwrap();
        write_atomic(&backup_path(&path), br#"{"version":1,"roster":"backup"}"#, false).unwrap();

        let store = GameStateStore::load(path.clone());
        assert_eq!(store.open_session().state.roster, Some(json!("backup")));
        store.apply(patch(1, None, Some(json!("s")))).unwrap();
        store.flush().unwrap();

        assert_eq!(read_state(&backup_path(&path)).unwrap().roster, Some(json!("backup")));
        let saved = read_state(&path).unwrap();
        assert_eq!(saved.roster, Some(json!("backup")));
        assert_eq!(saved.settings, Some(json!("s")));
    }

    #[test]
    fn missing_file_falls_back_to_backup() {
        let path = temp_dir().join(FILE_NAME);
        write_atomic(&backup_path(&path), br#"{"version":1,"roster":"backup"}"#, false).unwrap();
        let (state, good) = load_with_fallback(&path);
        assert!(!good);
        assert_eq!(state.roster, Some(json!("backup")));
    }

    #[test]
    fn stale_patch_is_ignored() {
        let store = opened(temp_dir().join(FILE_NAME));
        assert!(store.apply(patch(2, Some(json!("new")), None)).unwrap());
        assert!(!store.apply(patch(1, Some(json!("old")), None)).unwrap());
        // 설정은 따로 센다
        assert!(store.apply(patch(1, None, Some(json!("s")))).unwrap());
        let reopened = store.open_session();
        assert_eq!(reopened.state.roster, Some(json!("new")));
        // 화면을 새로 띄우면 다시 1부터 받는다
        assert!(store.apply(patch_in(reopened.session, 1, Some(json!("after-reload")), None)).unwrap());
    }

    #[test]
    fn stale_session_save_after_reopen_is_ignored() {
        let path = temp_dir().join(FILE_NAME);
        let store = opened(path.clone());
        assert!(store.apply(patch(14, Some(json!("old-14")), None)).unwrap());
        store.flush().unwrap();

        // 화면을 새로 띄운 뒤 앞 화면의 저장(seq 15)이 늦게 도착한다
        let session = store.open_session().session;
        assert_ne!(session, 1);
        assert!(!store.apply(patch(15, Some(json!("old-15")), Some(json!("old-settings")))).unwrap());

        // 새 화면의 저장은 seq 1 부터 받고, 종료 때 flush 가 파일에 쓴다
        assert!(store.apply(patch_in(session, 1, Some(json!("new-1")), None)).unwrap());
        assert!(store.apply(patch_in(session, 2, Some(json!("new-2")), None)).unwrap());
        store.flush().unwrap();
        let saved = read_state(&path).unwrap();
        assert_eq!(saved.roster, Some(json!("new-2")));
        assert_eq!(saved.settings, None);
    }

    #[test]
    fn invalid_json_is_rejected() {
        let store = opened(temp_dir().join(FILE_NAME));
        let bad = GameStatePatch { session: 1, seq: 1, roster: Some("{oops".into()), settings: None };
        assert!(store.apply(bad).is_err());
        assert_eq!(store.open_session().state.roster, None);
    }

    #[test]
    fn clean_store_writes_nothing() {
        let path = temp_dir().join(FILE_NAME);
        GameStateStore::load(path.clone()).flush().unwrap();
        assert!(!path.exists());
    }
}
