use tauri::AppHandle;

/// OS 알림을 띄운다. 프론트는 이 명령을 먼저 부르고, 실패하면 플러그인 sendNotification 으로 띄운다.
///
/// macOS 알림 센터는 왼쪽 아이콘을 번들의 icon.icns 로만 그린다. Finder 사용자 아이콘·실행 중 앱 아이콘·
/// 비공개 `_identityImage` 는 모두 무시돼서(macOS 26.5.1 에서 확인) 왼쪽은 바꿀 수 없다. 대신 오른쪽 그림
/// (contentImage)에 앱 아이콘과 같은 그림을 넣는다. 플러그인은 이 값을 넘길 길이 없어 직접 보낸다
#[tauri::command]
pub fn show_notification(app: AppHandle, title: String, body: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        mac::show(&app, title, body)
    }
    #[cfg(not(target_os = "macos"))]
    {
        use tauri_plugin_notification::NotificationExt;
        app.notification()
            .builder()
            .title(title)
            .body(body)
            .show()
            .map_err(|error| error.to_string())
    }
}

/// 플러그인(tauri-plugin-notification 2.7)이 고르는 보내는 앱과 같다. 개발 실행은 번들이 없어 터미널 이름으로 보낸다
#[cfg(target_os = "macos")]
fn sender_bundle_id(is_dev: bool, identifier: &str) -> &str {
    if is_dev { "com.apple.Terminal" } else { identifier }
}

/// 앱 아이콘(app_icon.rs)과 같은 캔버스. 트레이 그림이 아니면 None
#[cfg(target_os = "macos")]
fn image_png(tray_png: &[u8]) -> Option<Vec<u8>> {
    use crate::app_icon::{MAC_CANVAS, MAC_CONTENT, build_canvas};
    let source = image::load_from_memory(tray_png).ok()?.to_rgba8();
    let canvas = build_canvas(&source, MAC_CANVAS, MAC_CONTENT)?;
    let mut png = Vec::new();
    canvas.write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png).ok()?;
    Some(png)
}

/// 알림 본문이나 버튼을 누른 것. 닫기·저절로 사라진 것은 창을 열지 않는다
#[cfg(target_os = "macos")]
fn opens_window(response: &mac_notification_sys::NotificationResponse) -> bool {
    use mac_notification_sys::NotificationResponse;
    matches!(response, NotificationResponse::Click | NotificationResponse::ActionButton(_))
}

#[cfg(target_os = "macos")]
mod mac {
    use std::fs;

    use mac_notification_sys::Notification;
    use tauri::{AppHandle, Manager};

    use super::{image_png, opens_window, sender_bundle_id};
    use crate::tray_icon;

    /// 넥슨 그림이라 저장소·릴리스에 넣지 않고 사용자 app data 에 만든다
    const IMAGE_FILE: &str = "notification-image.png";

    pub fn show(app: &AppHandle, title: String, body: String) -> Result<(), String> {
        let sender = sender_bundle_id(tauri::is_dev(), &app.config().identifier).to_owned();
        let handle = app.clone();
        // 누를 때까지 기다리므로 알림마다 스레드 하나. 알림 센터에서 지우거나 누르면 끝난다
        std::thread::Builder::new()
            .name("notification".into())
            .spawn(move || {
                // 한 번만 정해진다. 플러그인이 먼저 정했으면 이 호출은 무시된다
                let _ = mac_notification_sys::set_application(&sender);
                let image = save_image(&handle);
                let mut notification = Notification::new();
                // wait_for_click 이 없으면 보내자마자 응답 없음으로 돌아와 누른 것을 받지 못한다
                notification.title(&title).message(&body).wait_for_click(true);
                if let Some(path) = image.as_deref() {
                    notification.content_image(path);
                }
                if notification.send().is_ok_and(|response| opens_window(&response)) {
                    crate::open_from_notification(&handle);
                }
            })
            .map(|_| ())
            .map_err(|error| error.to_string())
    }

    /// 실패하면 None 이고 그림 없이 보낸다. 같은 그림이면 다시 쓰지 않는다
    fn save_image(app: &AppHandle) -> Option<String> {
        let png = image_png(&tray_icon::cached_png(app)?)?;
        let path = app.path().app_data_dir().ok()?.join(IMAGE_FILE);
        if fs::read(&path).ok().as_deref() != Some(png.as_slice()) {
            fs::write(&path, &png).ok()?;
        }
        Some(path.to_string_lossy().into_owned())
    }
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};
    use mac_notification_sys::NotificationResponse;

    fn png_of(image: &RgbaImage) -> Vec<u8> {
        let mut png = Vec::new();
        image.write_to(&mut std::io::Cursor::new(&mut png), image::ImageFormat::Png).unwrap();
        png
    }

    #[test]
    fn image_is_the_app_icon_canvas() {
        let mut tray = RgbaImage::from_pixel(36, 36, Rgba([0, 0, 0, 0]));
        for y in 4..32 {
            for x in 6..30 {
                tray.put_pixel(x, y, Rgba([200, 80, 0, 255]));
            }
        }
        let image = image::load_from_memory(&image_png(&png_of(&tray)).unwrap()).unwrap().to_rgba8();
        assert_eq!(image.dimensions(), (1024, 1024));
        assert_eq!(*image.get_pixel(512, 512), Rgba([200, 80, 0, 255]));
        assert_eq!(*image.get_pixel(0, 0), Rgba([0, 0, 0, 0]));
    }

    #[test]
    fn no_image_from_unusable_tray_picture() {
        assert!(image_png(b"not a png").is_none());
        assert!(image_png(&png_of(&RgbaImage::from_pixel(36, 36, Rgba([0, 0, 0, 0])))).is_none());
    }

    #[test]
    fn sends_as_the_same_app_as_the_plugin() {
        assert_eq!(sender_bundle_id(true, "com.maplecompanion.app"), "com.apple.Terminal");
        assert_eq!(sender_bundle_id(false, "com.maplecompanion.app"), "com.maplecompanion.app");
    }

    #[test]
    fn only_a_click_opens_the_window() {
        assert!(opens_window(&NotificationResponse::Click));
        assert!(opens_window(&NotificationResponse::ActionButton("열기".into())));
        assert!(!opens_window(&NotificationResponse::None));
        assert!(!opens_window(&NotificationResponse::CloseButton("닫기".into())));
    }
}
