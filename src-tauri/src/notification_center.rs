//! macOS UNUserNotificationCenter. 권한 묻기·상태 읽기·보내기·누른 것 받기를 모두 여기서 한다.
//!
//! 한 번이라도 UNUserNotificationCenter 를 쓴 앱은 예전 NSUserNotification(mac-notification-sys) 길로 보내는 알림을
//! usernoted 가 「You can't mix modern clients with legacy clients」로 버린다. 다른 실행에서 보낸 것도 같다(macOS 26.5 에서 확인).
//! 그래서 번들로 실행 중이면 권한만이 아니라 보내기도 이 길로 한다. 번들 밖 개발 실행만 예전 길이다

use std::path::Path;
use std::ptr::NonNull;
use std::sync::mpsc;
use std::time::Duration;

use block2::{DynBlock, RcBlock};
use objc2::rc::Retained;
use objc2::runtime::{Bool, NSObject, NSObjectProtocol, ProtocolObject};
use objc2::{AllocAnyThread, DefinedClass, define_class, msg_send};
use objc2_foundation::{NSArray, NSBundle, NSError, NSString, NSURL};
use objc2_user_notifications::{
    UNAuthorizationOptions, UNMutableNotificationContent, UNNotification, UNNotificationAttachment,
    UNNotificationDefaultActionIdentifier, UNNotificationPresentationOptions, UNNotificationRequest, UNNotificationResponse,
    UNNotificationSettings, UNNotificationSound, UNUserNotificationCenter, UNUserNotificationCenterDelegate,
};

const SETTINGS_WAIT: Duration = Duration::from_secs(3);
/// 묻는 창은 사용자가 답할 때까지 완료 콜백이 오지 않는다. 5분 동안 답이 없으면 시스템이 창을 내리고 거절로 남긴다(macOS 26.5 에서 확인)
const REQUEST_WAIT: Duration = Duration::from_secs(330);

/// .app 밖(pnpm tauri dev)에서 currentNotificationCenter 를 부르면 예외로 앱이 죽어서 먼저 본다
pub fn center() -> Result<Retained<UNUserNotificationCenter>, String> {
    let bundle = NSBundle::mainBundle();
    if !bundle.bundlePath().to_string().ends_with(".app") || bundle.bundleIdentifier().is_none() {
        return Err("앱 번들 밖에서 실행 중이다".into());
    }
    Ok(UNUserNotificationCenter::currentNotificationCenter())
}

fn describe(error: &NSError) -> String {
    format!("{} {}: {}", error.domain(), error.code(), error.localizedDescription())
}

/// (UNAuthorizationStatus, alertSetting, alertStyle)
pub fn settings() -> Result<(isize, isize, isize), String> {
    let center = center()?;
    let (sender, receiver) = mpsc::channel();
    let block = RcBlock::new(move |settings: NonNull<UNNotificationSettings>| {
        let settings = unsafe { settings.as_ref() };
        let _ = sender.send((settings.authorizationStatus().0, settings.alertSetting().0, settings.alertStyle().0));
    });
    center.getNotificationSettingsWithCompletionHandler(&block);
    receiver.recv_timeout(SETTINGS_WAIT).map_err(|_| "알림 설정을 읽지 못했다(시간 초과)".to_string())
}

/// 허용했으면 Ok(true). 서명·설치 위치 때문에 막히면 UNErrorDomain 1(NotificationsNotAllowed)이 Err 로 온다
pub fn request() -> Result<bool, String> {
    let center = center()?;
    let (sender, receiver) = mpsc::channel();
    let block = RcBlock::new(move |granted: Bool, error: *mut NSError| {
        let result = match unsafe { error.as_ref() } {
            Some(error) => Err(describe(error)),
            None => Ok(granted.as_bool()),
        };
        let _ = sender.send(result);
    });
    center.requestAuthorizationWithOptions_completionHandler(UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound, &block);
    receiver.recv_timeout(REQUEST_WAIT).unwrap_or_else(|_| Err("묻는 창에 답이 없다(시간 초과)".into()))
}

/// 그림은 알림 오른쪽에 붙는다. 시스템이 그림 파일을 자기 저장소로 옮겨 가서 복사본을 넘긴다
pub fn send(id: &str, title: &str, body: &str, image: Option<&Path>) -> Result<(), String> {
    let center = center()?;
    let content = UNMutableNotificationContent::new();
    content.setTitle(&NSString::from_str(title));
    content.setBody(&NSString::from_str(body));
    content.setSound(Some(&UNNotificationSound::defaultSound()));
    if let Some(attachment) = image.and_then(|path| attachment(id, path)) {
        content.setAttachments(&NSArray::from_retained_slice(&[attachment]));
    }
    let request = UNNotificationRequest::requestWithIdentifier_content_trigger(&NSString::from_str(id), &content, None);
    let block = RcBlock::new(|error: *mut NSError| {
        if let Some(error) = unsafe { error.as_ref() } {
            eprintln!("[notification] 알림을 보내지 못했다: {}", describe(error));
        }
    });
    center.addNotificationRequest_withCompletionHandler(&request, Some(&block));
    Ok(())
}

fn attachment(id: &str, image: &Path) -> Option<Retained<UNNotificationAttachment>> {
    let copy = std::env::temp_dir().join(format!("maple-companion-{id}.png"));
    std::fs::copy(image, &copy).ok()?;
    let url = NSURL::fileURLWithPath(&NSString::from_str(&copy.to_string_lossy()));
    let attachment = unsafe { UNNotificationAttachment::attachmentWithIdentifier_URL_options_error(&NSString::from_str(id), &url, None) };
    if attachment.is_err() {
        let _ = std::fs::remove_file(&copy);
    }
    attachment.ok()
}

type OpenHandler = Box<dyn Fn() + Send + Sync>;

define_class!(
    #[unsafe(super(NSObject))]
    #[name = "MapleCompanionNotificationDelegate"]
    #[ivars = OpenHandler]
    struct Delegate;

    unsafe impl NSObjectProtocol for Delegate {}

    unsafe impl UNUserNotificationCenterDelegate for Delegate {
        /// 앱이 앞에 있을 때(「테스트」를 누른 때)도 배너로 띄운다. 없으면 시스템이 알림을 숨긴다
        #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
        fn will_present(
            &self,
            _center: &UNUserNotificationCenter,
            _notification: &UNNotification,
            completion: &DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
        ) {
            completion.call((UNNotificationPresentationOptions::Banner
                | UNNotificationPresentationOptions::List
                | UNNotificationPresentationOptions::Sound,));
        }

        /// 알림 본문을 누른 것만 창을 연다. 닫기는 따로 오지 않는다
        #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
        fn did_receive(&self, _center: &UNUserNotificationCenter, response: &UNNotificationResponse, completion: &DynBlock<dyn Fn()>) {
            if &*response.actionIdentifier() == unsafe { UNNotificationDefaultActionIdentifier } {
                (self.ivars())();
            }
            completion.call(());
        }
    }
);

/// 누른 알림을 받는다. 앱이 꺼질 때까지 쓰므로 delegate 를 놓지 않는다(center 는 약하게 잡는다)
pub fn listen(on_open: impl Fn() + Send + Sync + 'static) -> Result<(), String> {
    let center = center()?;
    let delegate = Delegate::alloc().set_ivars(Box::new(on_open) as OpenHandler);
    let delegate: Retained<Delegate> = unsafe { msg_send![super(delegate), init] };
    center.setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
    std::mem::forget(delegate);
    Ok(())
}
