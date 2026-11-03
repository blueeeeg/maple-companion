//! OS 알림 권한을 묻고 지금 상태를 읽고, OS 의 알림 설정 화면을 연다. macOS 는 notification_center.rs 를 쓴다

use serde::Serialize;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum AuthStatus {
    NotDetermined,
    Denied,
    Authorized,
    Provisional,
    Ephemeral,
    /// 번들 밖 개발 실행·Windows 개발 실행·읽기 실패
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct NotificationStatus {
    pub status: AuthStatus,
    /// 배너·알림 스타일로 화면에 뜨는지. 허용했어도 스타일을 「없음」으로 두면 알림 센터에만 쌓여 꺼진 것과 같다
    pub alerts: Option<bool>,
    /// 상태를 못 읽은 까닭
    pub detail: Option<String>,
}

impl NotificationStatus {
    fn unknown(detail: impl Into<String>) -> Self {
        Self { status: AuthStatus::Unknown, alerts: None, detail: Some(detail.into()) }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct PermissionRequest {
    pub granted: bool,
    /// 「도메인 코드: 설명」. 서명 문제로 막히면 UNErrorDomain 1(NotificationsNotAllowed)이 온다
    pub error: Option<String>,
}

/// UNAuthorizationStatus 값
pub fn auth_status(raw: isize) -> AuthStatus {
    match raw {
        0 => AuthStatus::NotDetermined,
        1 => AuthStatus::Denied,
        2 => AuthStatus::Authorized,
        3 => AuthStatus::Provisional,
        4 => AuthStatus::Ephemeral,
        _ => AuthStatus::Unknown,
    }
}

/// UNNotificationSetting(0 지원 안 함·1 끔·2 켬)과 UNAlertStyle(0 없음·1 배너·2 알림)
pub fn alerts_shown(alert_setting: isize, alert_style: isize) -> Option<bool> {
    match alert_setting {
        1 => Some(false),
        2 => Some(alert_style != 0),
        _ => None,
    }
}

/// macOS 13 이후 시스템 설정의 알림 화면. id 를 붙이면 그 앱 칸이 열린다
pub fn mac_settings_url(identifier: &str) -> String {
    format!("x-apple.systempreferences:com.apple.Notifications-Settings.extension?id={identifier}")
}

#[cfg(windows)]
const WINDOWS_SETTINGS_URL: &str = "ms-settings:notifications";

#[cfg(target_os = "macos")]
mod mac {
    use super::{NotificationStatus, PermissionRequest, alerts_shown, auth_status};
    use crate::notification_center;

    pub fn status() -> NotificationStatus {
        match notification_center::settings() {
            Ok((status, alert_setting, alert_style)) => NotificationStatus {
                status: auth_status(status),
                alerts: alerts_shown(alert_setting, alert_style),
                detail: None,
            },
            Err(reason) => NotificationStatus::unknown(reason),
        }
    }

    pub fn request() -> PermissionRequest {
        match notification_center::request() {
            Ok(granted) => PermissionRequest { granted, error: None },
            Err(error) => PermissionRequest { granted: false, error: Some(error) },
        }
    }
}

/// 설치한 앱의 알림 앱 ID 는 identifier 다(tauri-plugin-notification 과 같다). 개발 실행은 등록이 없어 읽기에 실패한다
#[cfg(windows)]
mod windows_toast {
    use windows::UI::Notifications::{NotificationSetting, ToastNotificationManager};
    use windows::core::HSTRING;

    use super::{AuthStatus, NotificationStatus};

    pub fn status(identifier: &str) -> NotificationStatus {
        let setting = ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(identifier)).and_then(|notifier| notifier.Setting());
        match setting {
            Ok(NotificationSetting::Enabled) => NotificationStatus { status: AuthStatus::Authorized, alerts: Some(true), detail: None },
            Ok(_) => NotificationStatus { status: AuthStatus::Denied, alerts: Some(false), detail: None },
            Err(error) => NotificationStatus::unknown(error.to_string()),
        }
    }
}

#[tauri::command]
pub async fn notification_status(app: tauri::AppHandle) -> NotificationStatus {
    #[cfg(target_os = "macos")]
    {
        let _ = app;
        tauri::async_runtime::spawn_blocking(mac::status)
            .await
            .unwrap_or_else(|error| NotificationStatus::unknown(error.to_string()))
    }
    #[cfg(windows)]
    {
        windows_toast::status(&app.config().identifier)
    }
    #[cfg(not(any(target_os = "macos", windows)))]
    {
        let _ = app;
        NotificationStatus::unknown("이 OS 는 알림 상태를 읽지 않는다")
    }
}

/// macOS 는 아직 안 정했을 때만 시스템이 묻는 창을 띄운다. 이미 정했으면 그 값으로 바로 돌아온다. Windows 는 묻는 절차가 없다
#[tauri::command]
pub async fn request_notification_permission() -> PermissionRequest {
    #[cfg(target_os = "macos")]
    {
        tauri::async_runtime::spawn_blocking(mac::request)
            .await
            .unwrap_or_else(|error| PermissionRequest { granted: false, error: Some(error.to_string()) })
    }
    #[cfg(not(target_os = "macos"))]
    {
        PermissionRequest { granted: true, error: None }
    }
}

#[tauri::command]
pub fn open_notification_settings(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let child = std::process::Command::new("open").arg(mac_settings_url(&app.config().identifier)).spawn();
    #[cfg(windows)]
    let child = {
        let _ = app;
        std::process::Command::new("explorer").arg(WINDOWS_SETTINGS_URL).spawn()
    };
    #[cfg(not(any(target_os = "macos", windows)))]
    let child: std::io::Result<std::process::Child> = {
        let _ = app;
        Err(std::io::Error::other("이 OS 는 알림 설정 화면을 열지 않는다"))
    };
    child.map(|_| ()).map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_authorization_status() {
        assert_eq!(auth_status(0), AuthStatus::NotDetermined);
        assert_eq!(auth_status(1), AuthStatus::Denied);
        assert_eq!(auth_status(2), AuthStatus::Authorized);
        assert_eq!(auth_status(3), AuthStatus::Provisional);
        assert_eq!(auth_status(4), AuthStatus::Ephemeral);
        assert_eq!(auth_status(9), AuthStatus::Unknown);
    }

    #[test]
    fn alert_style_none_counts_as_off() {
        assert_eq!(alerts_shown(2, 1), Some(true));
        assert_eq!(alerts_shown(2, 2), Some(true));
        assert_eq!(alerts_shown(2, 0), Some(false));
        assert_eq!(alerts_shown(1, 1), Some(false));
        assert_eq!(alerts_shown(0, 1), None);
    }

    #[test]
    fn settings_url_points_at_the_app() {
        assert_eq!(
            mac_settings_url("com.maplecompanion.online"),
            "x-apple.systempreferences:com.apple.Notifications-Settings.extension?id=com.maplecompanion.online"
        );
    }

    #[test]
    fn status_serializes_for_the_front() {
        let json = serde_json::to_value(NotificationStatus { status: AuthStatus::NotDetermined, alerts: None, detail: None }).unwrap();
        assert_eq!(json["status"], "notDetermined");
    }
}
