use std::fs::{self, File};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager};

use crate::game_state::write_atomic;

/// 프론트가 maplestory.io 에서 통째로 받은 BGM 을 두는 app data 아래 폴더.
/// 주소를 audio 에 바로 걸면 팬 API 가 늦을 때 곡 중간에 끊겨서, 받아 둔 파일로 튼다
const DIR: &str = "bgm";
/// 프론트는 곡을 바이트 그대로 보내고 이름은 이 헤더에 싣는다
const KEY_HEADER: &str = "bgm-key";
const EXT: &str = "mp3";
/// 원작 곡 경로를 바꿔 쓴 이름(빈칸 등은 `-20` 처럼 세 글자가 된다)이 들어갈 만큼
const MAX_KEY_LEN: usize = 200;

/// key 는 프론트가 `KMS-389-Bgm00-FloralLife`(예전 판은 `KMS-389-100000000`)처럼 만든다. bgm 폴더 밖을 가리키지 못하게 글자를 막는다
fn valid_key(key: &str) -> bool {
    !key.is_empty() && key.len() <= MAX_KEY_LEN && key.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

fn track_path(dir: &Path, key: &str) -> Option<PathBuf> {
    valid_key(key).then(|| dir.join(format!("{key}.{EXT}")))
}

fn bgm_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|error| error.to_string())?.join(DIR))
}

fn app_track_path(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    track_path(&bgm_dir(app)?, key).ok_or_else(|| format!("BGM 이름이 잘못됐다: {key}"))
}

/// 남긴 곡 하나. 프론트가 용량을 넘으면 used_at 이 오래된 것부터 지운다
#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BgmEntry {
    key: String,
    bytes: u64,
    /// 마지막으로 쓰거나 읽은 때(ms). 파일 수정 시각이다
    used_at: u64,
}

/// 쓰다 만 임시 파일(`.mp3.tmp`)과 이름이 맞지 않는 파일은 뺀다
fn list_dir(dir: &Path) -> std::io::Result<Vec<BgmEntry>> {
    let entries = match fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(Vec::new()),
        Err(error) => return Err(error),
    };
    let mut list = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|ext| ext.to_str()) != Some(EXT) {
            continue;
        }
        let Some(key) = path.file_stem().and_then(|stem| stem.to_str()).filter(|key| valid_key(key)) else {
            continue;
        };
        let Ok(meta) = entry.metadata() else { continue };
        let used_at = meta
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map_or(0, |since| since.as_millis() as u64);
        list.push(BgmEntry { key: key.to_string(), bytes: meta.len(), used_at });
    }
    Ok(list)
}

/// 읽을 때 수정 시각을 지금으로 바꿔 「최근에 쓴 곡」 으로 남긴다. 못 바꿔도 곡은 튼다
fn touch(path: &Path) {
    if let Ok(file) = File::options().write(true).open(path) {
        let _ = file.set_modified(SystemTime::now());
    }
}

/// 받아 둔 곡이 없으면 빈 바이트를 돌려준다. 프론트는 그때 받아 온다
#[tauri::command]
pub async fn read_bgm(app: AppHandle, key: String) -> Result<Response, String> {
    let path = app_track_path(&app, &key)?;
    match fs::read(&path) {
        Ok(bytes) => {
            touch(&path);
            Ok(Response::new(bytes))
        }
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(Response::new(Vec::new())),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub async fn has_bgm(app: AppHandle, key: String) -> Result<bool, String> {
    Ok(app_track_path(&app, &key)?.is_file())
}

/// 개발 빌드와 배포 앱이 같은 폴더를 쓴다. 임시 파일에 다 쓴 뒤 바꿔치기해서 반만 쓰인 곡을 읽지 않게 한다
#[tauri::command]
pub async fn write_bgm(app: AppHandle, request: Request<'_>) -> Result<(), String> {
    let key = request.headers().get(KEY_HEADER).and_then(|value| value.to_str().ok()).ok_or("BGM 이름 헤더가 없다")?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("BGM 은 바이트로 보낸다".into());
    };
    if bytes.is_empty() {
        return Err("빈 BGM 이다".into());
    }
    write_atomic(&app_track_path(&app, key)?, bytes, false).map_err(|error| error.to_string())
}

/// 프론트가 못 읽은 곡이나 용량을 넘어 내보내는 곡. 지우면 다음에 새로 받는다
#[tauri::command]
pub async fn remove_bgm(app: AppHandle, key: String) -> Result<(), String> {
    match fs::remove_file(app_track_path(&app, &key)?) {
        Err(error) if error.kind() != ErrorKind::NotFound => Err(error.to_string()),
        _ => Ok(()),
    }
}

#[tauri::command]
pub async fn list_bgm(app: AppHandle) -> Result<Vec<BgmEntry>, String> {
    list_dir(&bgm_dir(&app)?).map_err(|error| error.to_string())
}

/// 예전 판이 맵 번호로 남긴 곡을 곡 이름으로 옮긴다. 이미 옮겼으면 넘어간다
#[tauri::command]
pub async fn rename_bgm(app: AppHandle, from: String, to: String) -> Result<(), String> {
    match fs::rename(app_track_path(&app, &from)?, app_track_path(&app, &to)?) {
        Err(error) if error.kind() != ErrorKind::NotFound => Err(error.to_string()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};
    use std::time::Duration;

    fn temp_dir() -> PathBuf {
        static COUNTER: AtomicU32 = AtomicU32::new(0);
        let dir = std::env::temp_dir().join(format!(
            "maple-bgm-cache-test-{}-{}",
            std::process::id(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn key_becomes_mp3_in_bgm_dir() {
        let dir = Path::new("/data/bgm");
        assert_eq!(track_path(dir, "KMS-389-100000000"), Some(dir.join("KMS-389-100000000.mp3")));
        assert_eq!(track_path(dir, "KMS-389-Bgm41-Gravity-20Lord"), Some(dir.join("KMS-389-Bgm41-Gravity-20Lord.mp3")));
        assert_eq!(track_path(dir, "KMS-389-Bgm48-Doomsday_LOOP"), Some(dir.join("KMS-389-Bgm48-Doomsday_LOOP.mp3")));
    }

    #[test]
    fn key_cannot_leave_bgm_dir() {
        let dir = Path::new("/data/bgm");
        for key in ["", "../game-state", "a/b", "..", "a.b", "a\\b", "a b", &"a".repeat(MAX_KEY_LEN + 1)] {
            assert_eq!(track_path(dir, key), None, "{key}");
        }
    }

    #[test]
    fn list_skips_temp_and_foreign_files() {
        let dir = temp_dir();
        fs::write(dir.join("KMS-389-Bgm00-FloralLife.mp3"), b"abc").unwrap();
        fs::write(dir.join("KMS-389-Bgm00-Nightmare.mp3.tmp"), b"half").unwrap();
        fs::write(dir.join("notes.txt"), b"x").unwrap();
        fs::write(dir.join("bad name.mp3"), b"x").unwrap();
        let list = list_dir(&dir).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].key, "KMS-389-Bgm00-FloralLife");
        assert_eq!(list[0].bytes, 3);
        assert!(list[0].used_at > 0);
    }

    #[test]
    fn missing_dir_lists_nothing() {
        assert_eq!(list_dir(&temp_dir().join("none")).unwrap(), Vec::new());
    }

    #[test]
    fn touch_marks_track_as_recently_used() {
        let dir = temp_dir();
        let path = dir.join("KMS-389-Bgm00-FloralLife.mp3");
        fs::write(&path, b"abc").unwrap();
        let old = SystemTime::now() - Duration::from_secs(3600);
        File::options().write(true).open(&path).unwrap().set_modified(old).unwrap();
        let before = list_dir(&dir).unwrap()[0].used_at;
        touch(&path);
        let after = list_dir(&dir).unwrap()[0].used_at;
        assert!(after >= before + 3_000_000, "{before} → {after}");
        assert_eq!(fs::read(&path).unwrap(), b"abc");
    }
}
