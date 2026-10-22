use std::fs;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};

use tauri::ipc::{InvokeBody, Request, Response};
use tauri::{AppHandle, Manager};

use crate::game_state::write_atomic;

/// 프론트가 maplestory.io 에서 통째로 받은 맵 BGM 을 두는 app data 아래 폴더.
/// 주소를 audio 에 바로 걸면 팬 API 가 늦을 때 곡 중간에 끊겨서, 받아 둔 파일로 튼다
const DIR: &str = "bgm";
/// 프론트는 곡을 바이트 그대로 보내고 이름은 이 헤더에 싣는다
const KEY_HEADER: &str = "bgm-key";

/// key 는 프론트가 `KMS-389-100000000` 처럼 만든다. bgm 폴더 밖을 가리키지 못하게 글자를 막는다
fn track_path(dir: &Path, key: &str) -> Option<PathBuf> {
    let valid = !key.is_empty() && key.len() <= 64 && key.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-');
    valid.then(|| dir.join(format!("{key}.mp3")))
}

fn app_track_path(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?.join(DIR);
    track_path(&dir, key).ok_or_else(|| format!("BGM 이름이 잘못됐다: {key}"))
}

/// 받아 둔 곡이 없으면 빈 바이트를 돌려준다. 프론트는 그때 받아 온다
#[tauri::command]
pub async fn read_bgm(app: AppHandle, key: String) -> Result<Response, String> {
    match fs::read(app_track_path(&app, &key)?) {
        Ok(bytes) => Ok(Response::new(bytes)),
        Err(error) if error.kind() == ErrorKind::NotFound => Ok(Response::new(Vec::new())),
        Err(error) => Err(error.to_string()),
    }
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

/// 프론트가 못 읽은 곡. 지우면 다음에 새로 받는다
#[tauri::command]
pub async fn remove_bgm(app: AppHandle, key: String) -> Result<(), String> {
    match fs::remove_file(app_track_path(&app, &key)?) {
        Err(error) if error.kind() != ErrorKind::NotFound => Err(error.to_string()),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_becomes_mp3_in_bgm_dir() {
        let dir = Path::new("/data/bgm");
        assert_eq!(track_path(dir, "KMS-389-100000000"), Some(dir.join("KMS-389-100000000.mp3")));
    }

    #[test]
    fn key_cannot_leave_bgm_dir() {
        let dir = Path::new("/data/bgm");
        for key in ["", "../game-state", "a/b", "..", "a.b", "a\\b", &"a".repeat(65)] {
            assert_eq!(track_path(dir, key), None, "{key}");
        }
    }
}
