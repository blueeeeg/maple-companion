use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::menu::MenuItem;
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::{SharedActivity, SharedGameState, TRAY_ID};

pub const MENU_ID: &str = "update";

/// 트레이 메뉴의 업데이트 항목. 새 버전이 없으면 지금 버전을 보여 주고 누를 수 없다
pub struct UpdateMenu(pub MenuItem<Wry>);

/// 마지막 확인에서 찾은 새 버전. 트레이 메뉴를 누르면 이것을 받는다
#[derive(Default)]
pub struct UpdateState {
    pending: Mutex<Option<Update>>,
    installing: AtomicBool,
}

pub fn idle_label(app: &AppHandle) -> String {
    format!("현재 버전 v{}", app.package_info().version)
}

fn available_label(version: &str) -> String {
    format!("업데이트 (v{version})")
}

fn progress_label(downloaded: u64, total: Option<u64>) -> String {
    match total {
        Some(total) if total > 0 => format!("업데이트 중… {}%", (downloaded.saturating_mul(100) / total).min(100)),
        _ => "업데이트 중…".to_string(),
    }
}

fn set_menu(app: &AppHandle, text: &str, enabled: bool) {
    if let Some(menu) = app.try_state::<UpdateMenu>() {
        let _ = menu.0.set_text(text);
        let _ = menu.0.set_enabled(enabled);
    }
}

/// 메뉴를 닫으면 진행이 안 보여서 메뉴바 글자(Windows 는 툴팁)에도 띄운다. 실패하면 프론트가 원래 글자로 되돌린다
fn show_progress(app: &AppHandle, text: &str) {
    set_menu(app, text, false);
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_title(Some(text));
        let _ = tray.set_tooltip(Some(text));
    }
}

/// Windows 는 설치 프로그램을 띄운 뒤 std::process::exit 로 끝나서 RunEvent::Exit 를 거치지 않는다
fn save_before_exit(app: &AppHandle) {
    if let Err(error) = app.state::<SharedGameState>().flush() {
        eprintln!("[updater] 설치 전 저장 실패: {error}");
    }
    app.state::<SharedActivity>().save();
}

/// 프론트가 정한 때에 부른다. 새 버전이 있으면 그 버전, 없으면 None. 네트워크 실패는 Err 로 돌려 프론트가 다음에 다시 묻는다
#[tauri::command]
pub async fn check_update(app: AppHandle) -> Result<Option<String>, String> {
    let state = app.state::<UpdateState>();
    if state.installing.load(Ordering::SeqCst) {
        return Ok(state.pending.lock().unwrap().as_ref().map(|update| update.version.clone()));
    }
    let handle = app.clone();
    let update = app
        .updater_builder()
        .on_before_exit(move || {
            save_before_exit(&handle);
            // 플러그인 기본 동작을 덮어쓰므로 그것도 같이 한다
            handle.cleanup_before_exit();
        })
        .build()
        .map_err(|error| error.to_string())?
        .check()
        .await
        .map_err(|error| error.to_string())?;
    let version = update.as_ref().map(|update| update.version.clone());
    // 확인하는 사이 설치가 시작됐으면 진행 표시를 덮지 않는다
    if state.installing.load(Ordering::SeqCst) {
        return Ok(version);
    }
    match &version {
        Some(version) => set_menu(&app, &available_label(version), true),
        None => set_menu(&app, &idle_label(&app), false),
    }
    *state.pending.lock().unwrap() = update;
    Ok(version)
}

/// 트레이 메뉴 「업데이트」. 받아서 설치하고 다시 켠다
pub fn install(app: &AppHandle) {
    let state = app.state::<UpdateState>();
    if state.installing.swap(true, Ordering::SeqCst) {
        return;
    }
    let Some(update) = state.pending.lock().unwrap().clone() else {
        state.installing.store(false, Ordering::SeqCst);
        return;
    };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = app.emit("update-started", update.version.clone());
        show_progress(&app, &progress_label(0, None));
        let mut downloaded = 0u64;
        let mut shown = String::new();
        let result = update
            .download_and_install(
                |chunk, total| {
                    downloaded += chunk as u64;
                    let label = progress_label(downloaded, total);
                    if label != shown {
                        show_progress(&app, &label);
                        shown = label;
                    }
                },
                || show_progress(&app, "업데이트 설치 중…"),
            )
            .await;
        if let Err(error) = result {
            eprintln!("[updater] 업데이트 실패: {error}");
            app.state::<UpdateState>().installing.store(false, Ordering::SeqCst);
            set_menu(&app, &format!("업데이트 실패 · 다시 시도 (v{})", update.version), true);
            let _ = app.emit("update-failed", ());
            return;
        }
        // macOS 는 앱을 바꿔 놓기만 한다. request_restart 는 RunEvent::ExitRequested·Exit 를 거쳐서 game-state 를 마저 쓰고 다시 켠다
        app.request_restart();
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_shows_percent_only_when_size_is_known() {
        assert_eq!(progress_label(0, None), "업데이트 중…");
        assert_eq!(progress_label(10, Some(0)), "업데이트 중…");
        assert_eq!(progress_label(512, Some(1024)), "업데이트 중… 50%");
        assert_eq!(progress_label(2048, Some(1024)), "업데이트 중… 100%");
    }
}
