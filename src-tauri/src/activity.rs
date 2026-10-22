use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::idle;

/// 이 시간 넘게 입력이 없으면 자리를 비운 것으로 보고 집계를 멈춘다. 프론트 설정 「자리 비움 판정 시간」 으로 바꾼다
pub const DEFAULT_IDLE_LIMIT_SECONDS: f64 = 120.0;
/// 설정 화면이 고르는 값(1·2·5·10분). activity.json 을 손으로 고쳐 다른 값이 들어오면 기본값으로 연다
pub const IDLE_LIMIT_PRESETS: [f64; 4] = [60.0, 120.0, 300.0, 600.0];
const SAMPLE_INTERVAL: Duration = Duration::from_secs(5);
/// 절전에서 깨어나면 한 번에 몇 시간이 흐른 것으로 보이므로 한 샘플에 얹는 시간을 막는다.
const MAX_SAMPLE_SECONDS: f64 = 30.0;
const SAVE_EVERY_SAMPLES: u32 = 6;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DisplayMode {
    #[default]
    Pet,
    Panel,
}

pub const DEFAULT_SCALE_PERCENT: u32 = 100;

fn default_scale_percent() -> u32 {
    DEFAULT_SCALE_PERCENT
}

fn default_idle_limit_seconds() -> f64 {
    DEFAULT_IDLE_LIMIT_SECONDS
}

pub fn valid_idle_limit(seconds: f64) -> Option<f64> {
    IDLE_LIMIT_PRESETS.contains(&seconds).then_some(seconds)
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Persisted {
    pub active_seconds: f64,
    #[serde(default)]
    pub mode: DisplayMode,
    #[serde(default = "default_scale_percent")]
    pub scale_percent: u32,
    #[serde(default = "default_idle_limit_seconds")]
    pub idle_limit_seconds: f64,
}

impl Default for Persisted {
    fn default() -> Self {
        Self {
            active_seconds: 0.0,
            mode: DisplayMode::default(),
            scale_percent: DEFAULT_SCALE_PERCENT,
            idle_limit_seconds: DEFAULT_IDLE_LIMIT_SECONDS,
        }
    }
}

pub struct ActivityState {
    pub data: Mutex<Persisted>,
    path: PathBuf,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub active_seconds: f64,
    pub idle_seconds: f64,
    pub idle_limit_seconds: f64,
}

impl ActivityState {
    pub fn load(path: PathBuf) -> Self {
        let mut data: Persisted = fs::read_to_string(&path)
            .ok()
            .and_then(|text| serde_json::from_str(&text).ok())
            .unwrap_or_default();
        data.idle_limit_seconds = valid_idle_limit(data.idle_limit_seconds).unwrap_or(DEFAULT_IDLE_LIMIT_SECONDS);
        Self {
            data: Mutex::new(data),
            path,
        }
    }

    pub fn save(&self) {
        let data = self.data.lock().unwrap().clone();
        if let Some(dir) = self.path.parent() {
            let _ = fs::create_dir_all(dir);
        }
        if let Ok(text) = serde_json::to_string_pretty(&data) {
            let _ = fs::write(&self.path, text);
        }
    }

    pub fn snapshot(&self) -> Snapshot {
        let data = self.data.lock().unwrap();
        Snapshot {
            active_seconds: data.active_seconds,
            idle_seconds: idle::seconds_since_last_input(),
            idle_limit_seconds: data.idle_limit_seconds,
        }
    }
}

/// 개발 중 경험치 곡선을 빨리 돌려보려고 `MAPLE_SPEED=60` 처럼 배속을 건다.
fn speed_multiplier() -> f64 {
    std::env::var("MAPLE_SPEED")
        .ok()
        .and_then(|value| value.parse::<f64>().ok())
        .filter(|value| *value > 0.0)
        .unwrap_or(1.0)
}

pub fn spawn_sampler(state: Arc<ActivityState>) {
    let speed = speed_multiplier();
    thread::spawn(move || {
        let mut last = Instant::now();
        let mut samples = 0u32;
        loop {
            thread::sleep(SAMPLE_INTERVAL);
            let now = Instant::now();
            let elapsed = now.duration_since(last).as_secs_f64().min(MAX_SAMPLE_SECONDS);
            last = now;

            let idle_seconds = idle::seconds_since_last_input();
            let mut data = state.data.lock().unwrap();
            if idle_seconds < data.idle_limit_seconds {
                data.active_seconds += elapsed * speed;
            }
            drop(data);

            samples += 1;
            if samples % SAVE_EVERY_SAMPLES == 0 {
                state.save();
            }
        }
    });
}
