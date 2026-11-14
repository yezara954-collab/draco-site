// Picture 阶段 1。时间用秒，珠距和色散用 CSS 像素，流苏长度为屏高比例。
export const TASSEL_COUNT = { desktop: 56, mobile: 26 }; // 桌面和手机流苏数量
export const TASSEL_LENGTH_MIN = .12;
export const TASSEL_LENGTH_MAX = .55;
export const CHROMATIC_OFFSET = 1.45; // RGB 边缘偏移，设为 0 可关闭
export const WIND_BASE = .24;
export const WIND_GUST_STRENGTH = [.12, .48];
export const WIND_GUST_INTERVAL = [1.8, 5.2];
export const SWAY_AMPLITUDE = .102; // 最大摆角（弧度）
export const DROP_INTERVAL_MIN = 1.5;
export const DROP_INTERVAL_MAX = 3.5;
export const DROP_COUNT_MIN = 2;
export const DROP_COUNT_MAX = 3;
export const DROP_FALL_TIME = [.7, 1.1];
export const SPARK_COUNT = [8, 14];
export const SOUND_ENABLED = true;
export const SOUND_VOLUME = .05;

export const picture = {
  palette: {
    black: '#000', ink: '#EFE8D5', gold: '#F2C641', accent: '#E8603C',
    white: '#FFFFFF', coldGlow: '#DCE7FF', goldCore: '#FFE08A', goldGlow: '#FFC83D',
    fringes: ['#ff6974', '#72f4a0', '#708bff'],
  },
  display: { maxDpr: 2, mobileWidth: 640, mobileFactor: .5, seed: 8189, maxStep: .05 },
  sky: { count: 82, dust: 110, flares: 6, period: [4, 12] }, // 背景星与缓漂星尘
  tassel: {
    spacing: [3, 5], accentEvery: [6, 12], starRadius: [6, 16], glow: 2.45,
    glintEvery: 7, // 每隔数条流苏在珠线上增加一颗小星芒
    pearlOpacity: [.32, .86], accentOpacity: [.52, .94], regrowDelay: [1, 2], regrowFade: .62,
  },
  wind: { frequencies: [.49, .91, 1.37], damping: [.38, 1.06], gravity: 860, gustLife: [.6, 2.5], lag: [.03, .65] },
  falling: { stagger: .25, tailCount: 25, tailDuration: .18, sparkLife: [.28, .65], rippleLife: .56 },
  ground: { y: .88, span: [.09, .91], alpha: .19, lineWidth: .72, segments: 7, waviness: 2.1 },
  sound: { voices: 6, noiseTime: [.03, .06], toneTime: [.08, .20], pitch: [2000, 6000], highpass: 3100 },
  // 后续阶段的参数先保存在此处，阶段 1 不运行以下行为。
  camera: {
    x: .50, y: .68, asteroidSize: .08,
    orbit: { radiusX: .21, radiusY: .105, tiltDegrees: -15, period: 18 },
    capture: { interval: [4, 6], cooldown: 1.2, burst: [1, 3], spacing: [.8, 1.4], onScreen: 4, rotationDegrees: 6 },
  },
  paper: {
    destinations: { tassel: .34, crane: .33, ground: .33 },
    maxSameDestination: 2, hangingTime: [4, 6], groundLimit: 5, bounce: [1, 2],
  },
};
