use std::path::{Path, PathBuf};

use image::RgbaImage;
use tauri::image::Image;
use tauri::{AppHandle, Manager};

use crate::tray_icon;

/// 저장소의 번들 아이콘(src-tauri/icons)에는 넥슨 그림을 넣을 수 없어서, 받아 둔 트레이 그림으로
/// 사용자 컴퓨터에서 앱 아이콘을 바꾼다. 가장자리는 macOS 아이콘 격자(1024 중 824)만큼 비워 다른 앱과 크기를 맞춘다
#[cfg(target_os = "macos")]
const MAC_CANVAS: u32 = 1024;
#[cfg(target_os = "macos")]
const MAC_CONTENT: u32 = 824;
/// Windows 는 창 아이콘(Alt+Tab)만 바꿀 수 있다. 시작 메뉴·작업표시줄은 exe 리소스라 실행 중에 못 바꾼다
const WINDOWS_CANVAS: u32 = 256;

/// 픽셀 그림이라 정수배로만 늘린다. 투명한 가장자리는 잘라 내고 늘려야 아이콘이 작아지지 않는다.
/// 그림이 없거나 늘리지 않아도 캔버스보다 크면 None
pub fn build_canvas(source: &RgbaImage, canvas: u32, content: u32) -> Option<RgbaImage> {
    let opaque = |x: u32, y: u32| source.get_pixel(x, y)[3] > 0;
    let xs: Vec<u32> = (0..source.width()).filter(|&x| (0..source.height()).any(|y| opaque(x, y))).collect();
    let ys: Vec<u32> = (0..source.height()).filter(|&y| (0..source.width()).any(|x| opaque(x, y))).collect();
    let (left, right) = (*xs.first()?, *xs.last()?);
    let (top, bottom) = (*ys.first()?, *ys.last()?);
    let (width, height) = (right - left + 1, bottom - top + 1);
    let scale = (content / width.max(height)).max(1);
    let (scaled_w, scaled_h) = (width * scale, height * scale);
    if scaled_w > canvas || scaled_h > canvas {
        return None;
    }
    let (offset_x, offset_y) = ((canvas - scaled_w) / 2, (canvas - scaled_h) / 2);
    let mut out = RgbaImage::new(canvas, canvas);
    for y in 0..scaled_h {
        for x in 0..scaled_w {
            let pixel = *source.get_pixel(left + x / scale, top + y / scale);
            out.put_pixel(offset_x + x, offset_y + y, pixel);
        }
    }
    Some(out)
}

/// 붙이지 못한 기록. macOS 가 앱 수정을 막으면 실행할 때마다 차단 알림이 뜨므로, 같은 그림·같은 번들에는 다시 해 보지 않는다.
/// 업데이트나 다시 설치로 번들 폴더가 바뀌면 inode 가 달라져 다시 해 본다
pub fn failure_marker(source_hash: &str, bundle_inode: u64) -> String {
    format!("failed {source_hash} {bundle_inode}")
}

/// 업데이트는 .app 을 통째로 바꿔 넣어 사용자 아이콘이 사라진다. 그래서 표시 파일만 보지 않고 번들에 아이콘이 남았는지도 본다
pub fn should_apply(marker: Option<&str>, source_hash: &str, bundle_inode: u64, bundle_has_icon: bool) -> bool {
    if marker == Some(failure_marker(source_hash, bundle_inode).as_str()) {
        return false;
    }
    !bundle_has_icon || marker != Some(source_hash)
}

/// Contents/MacOS/<exe> 일 때만 .app 이다. target/debug 에서 바로 띄운 개발 실행은 번들이 없다
pub fn bundle_from_exe(exe: &Path) -> Option<PathBuf> {
    let macos = exe.parent()?;
    let contents = macos.parent()?;
    let bundle = contents.parent()?;
    let is_bundle = macos.file_name()? == "MacOS"
        && contents.file_name()? == "Contents"
        && bundle.extension()? == "app";
    is_bundle.then(|| bundle.to_path_buf())
}

/// 실행할 때와 새 트레이 그림을 받았을 때 부른다. AppKit 은 메인 스레드에서만 부를 수 있다. 실패해도 앱은 그대로 쓴다
pub fn sync(app: &AppHandle) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let Some(source) = tray_icon::cached_png(&handle).and_then(|png| image::load_from_memory(&png).ok()) else {
            return;
        };
        let source = source.to_rgba8();
        #[cfg(target_os = "macos")]
        if let Err(error) = mac::apply(&handle, &source) {
            eprintln!("[app-icon] {error}");
        }
        if cfg!(windows) {
            if let (Some(window), Some(icon)) = (
                handle.get_webview_window(crate::WINDOW_LABEL),
                build_canvas(&source, WINDOWS_CANVAS, WINDOWS_CANVAS),
            ) {
                let _ = window.set_icon(Image::new_owned(icon.into_raw(), WINDOWS_CANVAS, WINDOWS_CANVAS));
            }
        }
    });
}

#[cfg(target_os = "macos")]
mod mac {
    use std::fs;
    use std::hash::{DefaultHasher, Hash, Hasher};
    use std::io::Cursor;
    use std::os::unix::fs::MetadataExt;

    use image::{ImageFormat, RgbaImage};
    use objc2::{AllocAnyThread, MainThreadMarker};
    use objc2_app_kit::{NSApplication, NSImage, NSWorkspace, NSWorkspaceIconCreationOptions};
    use objc2_foundation::{NSData, NSString};
    use tauri::{AppHandle, Manager};

    use super::{MAC_CANVAS, MAC_CONTENT, build_canvas, bundle_from_exe, failure_marker, should_apply};

    /// 마지막으로 번들에 붙인 그림의 해시, 또는 붙이지 못한 기록. 같은 그림이면 실행할 때마다 번들을 다시 쓰지 않는다
    const MARKER_FILE: &str = "app-icon-applied.txt";

    pub fn apply(app: &AppHandle, source: &RgbaImage) -> Result<(), String> {
        let mtm = MainThreadMarker::new().ok_or("메인 스레드가 아니다")?;
        let canvas = build_canvas(source, MAC_CANVAS, MAC_CONTENT).ok_or("아이콘으로 쓸 그림이 아니다")?;
        let mut png = Vec::new();
        canvas
            .write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
            .map_err(|error| error.to_string())?;
        let image = NSImage::initWithData(NSImage::alloc(), &NSData::with_bytes(&png)).ok_or("NSImage 를 만들지 못했다")?;
        // 알림·경고창처럼 실행 중인 앱 아이콘을 쓰는 곳. 저장되지 않아서 실행할 때마다 넣는다
        unsafe { NSApplication::sharedApplication(mtm).setApplicationIconImage(Some(&image)) };

        let Some(bundle) = std::env::current_exe().ok().as_deref().and_then(bundle_from_exe) else {
            return Ok(());
        };
        let mut hasher = DefaultHasher::new();
        (source.as_raw(), MAC_CANVAS, MAC_CONTENT).hash(&mut hasher);
        let hash = format!("{:016x}", hasher.finish());
        let marker_path = app.path().app_data_dir().map_err(|error| error.to_string())?.join(MARKER_FILE);
        let marker = fs::read_to_string(&marker_path).ok();
        let inode = fs::metadata(&bundle).map_err(|error| error.to_string())?.ino();
        // Finder 사용자 아이콘은 번들 맨 위의 「Icon\r」 파일(리소스 포크)로 남는다
        if !should_apply(marker.as_deref(), &hash, inode, bundle.join("Icon\r").exists()) {
            return Ok(());
        }
        let path = NSString::from_str(&bundle.to_string_lossy());
        // Finder·Spotlight 가 보는 사용자 아이콘. 번들 폴더에 쓸 권한이 없거나(읽기 전용 디스크 이미지 등) 막히면 false
        if !NSWorkspace::sharedWorkspace().setIcon_forFile_options(Some(&image), &path, NSWorkspaceIconCreationOptions(0)) {
            let _ = fs::write(&marker_path, failure_marker(&hash, inode));
            return Err(format!("{} 에 아이콘을 붙이지 못했다", bundle.display()));
        }
        fs::write(&marker_path, hash).map_err(|error| error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::Rgba;

    const RED: Rgba<u8> = Rgba([255, 0, 0, 255]);
    const BLUE: Rgba<u8> = Rgba([0, 0, 255, 255]);
    const CLEAR: Rgba<u8> = Rgba([0, 0, 0, 0]);

    #[test]
    fn sprite_is_trimmed_scaled_by_integer_and_centered() {
        // 10×10 안에 투명 가장자리를 두른 3×2 그림. 윗줄 빨강·파랑·빨강, 아랫줄 파랑
        let mut source = RgbaImage::from_pixel(10, 10, CLEAR);
        for (x, color) in [(4, RED), (5, BLUE), (6, RED)] {
            source.put_pixel(x, 2, color);
        }
        for x in 4..7 {
            source.put_pixel(x, 3, BLUE);
        }
        let canvas = build_canvas(&source, 100, 80).unwrap();
        assert_eq!(canvas.dimensions(), (100, 100));
        // 긴 변 3 → 80/3 = 26배라 78×52, 가운데에 두면 왼쪽 위가 (11, 24)
        assert_eq!(*canvas.get_pixel(10, 24), CLEAR);
        assert_eq!(*canvas.get_pixel(11, 23), CLEAR);
        assert_eq!(*canvas.get_pixel(11, 24), RED);
        assert_eq!(*canvas.get_pixel(36, 49), RED);
        assert_eq!(*canvas.get_pixel(37, 24), BLUE);
        assert_eq!(*canvas.get_pixel(62, 24), BLUE);
        assert_eq!(*canvas.get_pixel(63, 49), RED);
        assert_eq!(*canvas.get_pixel(11, 50), BLUE);
        assert_eq!(*canvas.get_pixel(88, 75), BLUE);
        assert_eq!(*canvas.get_pixel(89, 75), CLEAR);
        assert_eq!(*canvas.get_pixel(88, 76), CLEAR);
    }

    #[test]
    fn large_picture_is_not_shrunk() {
        let source = RgbaImage::from_pixel(90, 90, RED);
        let canvas = build_canvas(&source, 100, 80).unwrap();
        assert_eq!(*canvas.get_pixel(4, 4), CLEAR);
        assert_eq!(*canvas.get_pixel(5, 5), RED);
        assert!(build_canvas(&RgbaImage::from_pixel(120, 120, RED), 100, 80).is_none());
    }

    #[test]
    fn fully_transparent_picture_is_rejected() {
        assert!(build_canvas(&RgbaImage::from_pixel(30, 30, CLEAR), 100, 80).is_none());
    }

    #[test]
    fn applies_when_picture_changed_or_bundle_lost_icon() {
        assert!(should_apply(None, "a", 7, true));
        assert!(should_apply(Some("a"), "b", 7, true));
        assert!(should_apply(Some("a"), "a", 7, false));
        assert!(!should_apply(Some("a"), "a", 7, true));
    }

    #[test]
    fn failed_attempt_is_not_retried_until_picture_or_bundle_changes() {
        let failed = failure_marker("a", 7);
        assert!(!should_apply(Some(&failed), "a", 7, false));
        assert!(should_apply(Some(&failed), "b", 7, false));
        assert!(should_apply(Some(&failed), "a", 8, false));
    }

    #[test]
    fn finds_bundle_only_inside_app() {
        assert_eq!(
            bundle_from_exe(Path::new("/Applications/Maple Companion.app/Contents/MacOS/maple-companion")),
            Some(PathBuf::from("/Applications/Maple Companion.app"))
        );
        assert_eq!(bundle_from_exe(Path::new("/repo/src-tauri/target/debug/maple-companion")), None);
        assert_eq!(bundle_from_exe(Path::new("/tmp/Foo/Contents/MacOS/foo")), None);
    }
}
