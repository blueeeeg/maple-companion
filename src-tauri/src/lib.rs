mod activity;
mod idle;
mod tray_icon;

use std::sync::Arc;

use activity::{ActivityState, DEFAULT_SCALE_PERCENT, DisplayMode, Snapshot};
use tauri::menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Emitter, LogicalSize, Manager, RunEvent, State, WebviewWindow, WindowEvent};
use tauri_plugin_positioner::{Position, WindowExt};

const TRAY_ID: &str = "main";
const WINDOW_LABEL: &str = "main";

// macOS 메뉴바는 화면 위에, Windows 작업표시줄은 아래에 있어서 창을 펼치는 방향이 반대다
#[cfg(target_os = "macos")]
const PANEL_POSITION: Position = Position::TrayCenter;
#[cfg(not(target_os = "macos"))]
const PANEL_POSITION: Position = Position::TrayBottomCenter;

/// 화면은 이 크기로 짜여 있고, 크기를 바꾸면 프론트가 통째로 늘리거나 줄인다. tauri.conf.json 창 크기와 같아야 한다
const BASE_WIDTH: f64 = 360.0;
const BASE_HEIGHT: f64 = 230.0;
const SCALE_PRESETS: [u32; 5] = [75, 100, 125, 150, 200];
const SCALE_MENU_PREFIX: &str = "scale-";

type SharedActivity = Arc<ActivityState>;

/// 메뉴 맨 위 「창 열기/닫기」. 창이 보이는지에 따라 글자를 바꾸려고 핸들을 들고 있는다
struct ToggleItem(MenuItem<tauri::Wry>);

fn sync_toggle_label(app: &AppHandle, visible: bool) {
    if let Some(item) = app.try_state::<ToggleItem>() {
        let _ = item.0.set_text(if visible { "창 닫기" } else { "창 열기" });
    }
}

#[tauri::command]
fn activity_snapshot(state: State<'_, SharedActivity>) -> Snapshot {
    state.snapshot()
}

#[tauri::command]
fn display_mode(state: State<'_, SharedActivity>) -> DisplayMode {
    state.data.lock().unwrap().mode
}

#[tauri::command]
fn display_scale(state: State<'_, SharedActivity>) -> f64 {
    f64::from(state.data.lock().unwrap().scale_percent) / 100.0
}

/// 설정 화면의 「자리 비움 판정 시간」. 다음 샘플부터 쓰고 activity.json 에 남겨 다음 실행에도 쓴다
#[tauri::command]
fn set_idle_limit(state: State<'_, SharedActivity>, seconds: f64) -> Result<(), String> {
    let seconds = activity::valid_idle_limit(seconds).ok_or("자리 비움 판정 시간은 1·2·5·10분 중 하나다")?;
    state.data.lock().unwrap().idle_limit_seconds = seconds;
    state.save();
    Ok(())
}

#[tauri::command]
fn set_tray_status(app: AppHandle, text: String) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        // 제목은 macOS 메뉴바에서만 보인다. Windows 는 툴팁으로 대신한다
        let _ = tray.set_title(Some(&text));
        let _ = tray.set_tooltip(Some(&text));
    }
}

/// 아이콘은 프론트가 받아 넘긴다. Rust 에 HTTP 클라이언트를 두지 않으려는 것이다. 못 읽는 그림이면 지금 아이콘을 그대로 둔다
#[tauri::command]
fn set_tray_icon(app: AppHandle, png: Vec<u8>) -> Result<(), String> {
    if tray_icon::has_custom(&app) {
        return Ok(());
    }
    let icon = tray_icon::from_png(&png).ok_or("트레이 아이콘 PNG 를 읽지 못했다")?;
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        tray.set_icon(Some(icon)).map_err(|error| error.to_string())?;
    }
    tray_icon::save_cache(&app, &png).map_err(|error| error.to_string())
}

fn current_mode(app: &AppHandle) -> DisplayMode {
    app.state::<SharedActivity>().data.lock().unwrap().mode
}

fn show_window(app: &AppHandle, window: &WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
    let _ = app.emit("panel-visibility", true);
    sync_toggle_label(app, true);
}

fn hide_window(app: &AppHandle, window: &WebviewWindow) {
    let _ = window.hide();
    let _ = app.emit("panel-visibility", false);
    sync_toggle_label(app, false);
}

fn apply_mode(app: &AppHandle, mode: DisplayMode) {
    let Some(window) = app.get_webview_window(WINDOW_LABEL) else {
        return;
    };
    let _ = window.set_always_on_top(true);
    match mode {
        DisplayMode::Pet => {
            let _ = window.move_window(Position::BottomRight);
            show_window(app, &window);
        }
        DisplayMode::Panel => hide_window(app, &window),
    }
    let _ = app.emit("mode-changed", mode);
}

fn set_mode(app: &AppHandle, mode: DisplayMode) {
    let state = app.state::<SharedActivity>();
    state.data.lock().unwrap().mode = mode;
    state.save();
    apply_mode(app, mode);
}

/// activity.json 을 손으로 고쳐 목록에 없는 값이 들어오면 기본 크기로 연다
fn valid_scale_percent(percent: u32) -> u32 {
    if SCALE_PRESETS.contains(&percent) {
        percent
    } else {
        DEFAULT_SCALE_PERCENT
    }
}

fn apply_scale(app: &AppHandle, percent: u32) {
    let Some(window) = app.get_webview_window(WINDOW_LABEL) else {
        return;
    };
    let scale = f64::from(percent) / 100.0;
    let _ = app.emit("scale-changed", scale);
    let _ = window.set_size(LogicalSize::new(
        (BASE_WIDTH * scale).round(),
        (BASE_HEIGHT * scale).round(),
    ));
    // 창은 왼쪽 위를 기준으로 커져서, 펫 모드는 다시 구석에 붙이지 않으면 화면 밖으로 밀려난다.
    // 메뉴바 모드는 열 때마다 아이콘 아래로 옮기니 여기서 할 일이 없다
    if current_mode(app) == DisplayMode::Pet {
        let _ = window.move_window(Position::BottomRight);
    }
}

fn set_scale(app: &AppHandle, percent: u32) {
    let state = app.state::<SharedActivity>();
    state.data.lock().unwrap().scale_percent = percent;
    state.save();
    apply_scale(app, percent);
}

fn reveal_window(app: &AppHandle, window: &WebviewWindow) {
    if current_mode(app) == DisplayMode::Panel {
        // 트레이 위치는 아이콘 위로 마우스가 지나가야 알 수 있다. 아직 모르면 화면 오른쪽 위에 연다
        if window.move_window(PANEL_POSITION).is_err() {
            let _ = window.move_window(Position::TopRight);
        }
    }
    show_window(app, window);
}

fn toggle_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window(WINDOW_LABEL) else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        hide_window(app, &window);
        return;
    }
    reveal_window(app, &window);
}

/// 트레이 메뉴 「설정」. 창이 숨어 있으면 띄우고 프론트에 설정 화면을 열라고 알린다
fn open_settings(app: &AppHandle) {
    let Some(window) = app.get_webview_window(WINDOW_LABEL) else {
        return;
    };
    if !window.is_visible().unwrap_or(false) {
        reveal_window(app, &window);
    }
    let _ = app.emit("open-settings", ());
}

fn build_tray(app: &AppHandle, scale_percent: u32) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle-window", "창 열기", true, None::<&str>)?;
    let pet = MenuItem::with_id(app, "mode-pet", "펫 모드", true, None::<&str>)?;
    let panel = MenuItem::with_id(app, "mode-panel", "메뉴바 모드", true, None::<&str>)?;
    let scale_items = SCALE_PRESETS
        .iter()
        .map(|&percent| {
            CheckMenuItem::with_id(
                app,
                format!("{SCALE_MENU_PREFIX}{percent}"),
                format!("{percent}%"),
                true,
                percent == scale_percent,
                None::<&str>,
            )
        })
        .collect::<tauri::Result<Vec<_>>>()?;
    let scale_refs: Vec<&dyn IsMenuItem<_>> = scale_items.iter().map(|item| item as _).collect();
    let scale = Submenu::with_items(app, "크기", true, &scale_refs)?;
    let settings = MenuItem::with_id(app, "settings", "설정", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let separator_top = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "종료", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&toggle, &separator_top, &pet, &panel, &scale, &settings, &separator, &quit])?;

    app.manage(ToggleItem(toggle));

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("메이플 컴패니언")
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "toggle-window" => toggle_window(app),
            "mode-pet" => set_mode(app, DisplayMode::Pet),
            "mode-panel" => set_mode(app, DisplayMode::Panel),
            "settings" => open_settings(app),
            "quit" => app.exit(0),
            id => {
                let Some(percent) = id
                    .strip_prefix(SCALE_MENU_PREFIX)
                    .and_then(|value| value.parse::<u32>().ok())
                else {
                    return;
                };
                // 체크 항목은 누르면 저절로 체크가 뒤집혀서, 이미 고른 크기를 다시 눌러도 체크가 남도록 전부 다시 맞춘다
                for (item, preset) in scale_items.iter().zip(SCALE_PRESETS) {
                    let _ = item.set_checked(preset == percent);
                }
                set_scale(app, percent);
            }
        })
        .on_tray_icon_event(|tray, event| {
            tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
        });
    if let Some(icon) = tray_icon::load_cached(app).or_else(|| app.default_window_icon().cloned()) {
        builder = builder.icon(icon);
    }
    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .invoke_handler(tauri::generate_handler![
            activity_snapshot,
            display_mode,
            display_scale,
            set_idle_limit,
            set_tray_status,
            set_tray_icon
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let path = app.path().app_data_dir()?.join("activity.json");
            let state: SharedActivity = Arc::new(ActivityState::load(path));
            activity::spawn_sampler(state.clone());
            let (mode, scale_percent) = {
                let mut data = state.data.lock().unwrap();
                data.scale_percent = valid_scale_percent(data.scale_percent);
                (data.mode, data.scale_percent)
            };
            app.manage(state);

            build_tray(app.handle(), scale_percent)?;
            // 펫 모드는 apply_mode 에서 바로 보이므로 그 전에 크기를 맞춰 둔다
            apply_scale(app.handle(), scale_percent);
            apply_mode(app.handle(), mode);
            Ok(())
        })
        .on_window_event(|window, event| {
            // 메뉴바 모드는 팝오버처럼 다른 곳을 누르면 닫힌다
            if let WindowEvent::Focused(false) = event {
                let app = window.app_handle();
                if current_mode(app) == DisplayMode::Panel {
                    if let Some(webview) = app.get_webview_window(WINDOW_LABEL) {
                        hide_window(app, &webview);
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| {
        if let RunEvent::Exit = event {
            app.state::<SharedActivity>().save();
        }
    });
}
