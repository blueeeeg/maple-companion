use std::fs;
use std::path::PathBuf;

use tauri::image::Image;
use tauri::{AppHandle, Manager};

/// 프론트가 maplestory.io 에서 받은 단풍잎 아이콘 원본. 다음 실행에서는 네트워크 없이 이걸로 바로 띄운다
const CACHE_FILE: &str = "tray-icon.png";
/// 사용자가 직접 놓는 아이콘. 있으면 단풍잎 캐시와 다운로드보다 앞선다
const CUSTOM_FILE: &str = "custom-tray-icon.png";
/// macOS 메뉴바는 트레이 그림을 높이 18pt 로 그린다(tray-icon 크레이트가 고정). 레티나에서 36px 이라
/// 아이템 아이콘(약 30px)을 늘리지 않고 36×36 가운데에 두면 원본 픽셀이 화면 픽셀에 1:1 로 맞아 번지지 않는다
const CANVAS: u32 = 36;

fn data_file(app: &AppHandle, name: &str) -> Option<PathBuf> {
    app.path().app_data_dir().ok().map(|dir| dir.join(name))
}

fn cache_path(app: &AppHandle) -> Option<PathBuf> {
    data_file(app, CACHE_FILE)
}

pub fn has_custom(app: &AppHandle) -> bool {
    data_file(app, CUSTOM_FILE).is_some_and(|path| path.is_file())
}

pub fn from_png(bytes: &[u8]) -> Option<Image<'static>> {
    let image = Image::from_bytes(bytes).ok()?;
    Some(center_on_canvas(image.rgba(), image.width(), image.height()))
}

pub fn load_cached(app: &AppHandle) -> Option<Image<'static>> {
    [CUSTOM_FILE, CACHE_FILE]
        .into_iter()
        .filter_map(|name| fs::read(data_file(app, name)?).ok())
        .find_map(|bytes| from_png(&bytes))
}

pub fn save_cache(app: &AppHandle, bytes: &[u8]) -> std::io::Result<()> {
    let Some(path) = cache_path(app) else {
        return Ok(());
    };
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    fs::write(path, bytes)
}

fn center_on_canvas(rgba: &[u8], width: u32, height: u32) -> Image<'static> {
    if width > CANVAS || height > CANVAS {
        return Image::new_owned(rgba.to_vec(), width, height);
    }
    let (side, w, h) = (CANVAS as usize, width as usize, height as usize);
    let (left, top) = ((side - w) / 2, (side - h) / 2);
    let mut canvas = vec![0; side * side * 4];
    for row in 0..h {
        let src = row * w * 4;
        let dst = ((top + row) * side + left) * 4;
        canvas[dst..dst + w * 4].copy_from_slice(&rgba[src..src + w * 4]);
    }
    Image::new_owned(canvas, CANVAS, CANVAS)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn small_icon_is_centered_without_scaling() {
        let rgba = [1, 2, 3, 4].repeat(28 * 30);
        let image = center_on_canvas(&rgba, 28, 30);
        assert_eq!((image.width(), image.height()), (CANVAS, CANVAS));
        let pixel = |x: usize, y: usize| &image.rgba()[(y * CANVAS as usize + x) * 4..][..4];
        assert_eq!(pixel(3, 2), [0, 0, 0, 0]);
        assert_eq!(pixel(4, 3), [1, 2, 3, 4]);
        assert_eq!(pixel(31, 32), [1, 2, 3, 4]);
        assert_eq!(pixel(32, 33), [0, 0, 0, 0]);
    }

    #[test]
    fn large_icon_is_left_as_is() {
        let rgba = vec![9; 40 * 40 * 4];
        let image = center_on_canvas(&rgba, 40, 40);
        assert_eq!((image.width(), image.height()), (40, 40));
    }

    #[test]
    fn non_png_is_rejected() {
        assert!(from_png(b"<html>502</html>").is_none());
    }
}
