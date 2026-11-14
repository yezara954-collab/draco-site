// Picture 阶段 1。时间用秒，珠距和色散用 CSS 像素，流苏长度为屏高比例。
export const TASSEL_COUNT = { desktop: 56, mobile: 26 }; // 桌面和手机流苏数量
export const TASSEL_LENGTH_MIN = .12;
export const TASSEL_LENGTH_MAX = .55;
export const CHROMATIC_OFFSET = 1.45; // RGB 边缘偏移，设为 0 可关闭
// 软绳：节点数量区间、每秒阻尼、距离约束强度、星相对绳节点的质量。
export const ROPE_NODES = [8, 10];
export const ROPE_DAMPING = [1.9, 2.7];
export const ROPE_STIFFNESS = .99;
export const STAR_MASS = 3.4;
export const WIND_NOISE_SPEED = .19; // 风场每秒移动的格点数
export const WIND_GUST_ATTACK = [.8, 1.5];
export const WIND_GUST_RELEASE = [1.5, 3];
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
export const GLASS_GRAIN_COUNT = [12, 25];
export const GLASS_FREQ_MIN = 3000;
export const GLASS_FREQ_MAX = 9000;
export const GLASS_DECAY = [.03, .12];
// 星核半径上下限和短边比例；辉光范围、透明度。
export const STAR_SIZE_MIN = 3.5;
export const STAR_SIZE_MAX = 9;
export const STAR_GLOW_SCALE = 2.2;
export const STAR_GLOW_ALPHA = .40;

export const picture = {
  palette: {
    black: '#000', ink: '#EFE8D5', gold: '#F2C641', accent: '#E8603C',
    white: '#FFFFFF', coldGlow: '#DCE7FF', goldCore: '#FFE08A', goldGlow: '#FFC83D',
    fringes: ['#ff6974', '#72f4a0', '#708bff'],
  },
  display: { maxDpr: 2, mobileWidth: 640, mobileFactor: .5, seed: 8189, maxStep: .05 },
  sky: { count: 82, dust: 110, flares: 6, period: [4, 12] }, // 背景星与缓漂星尘
  tassel: {
    spacing: [3, 5], accentEvery: [6, 12], starScale: [.0035, .0085],
    glintEvery: 7, // 每隔数条流苏在珠线上增加一颗小星芒
    pearlOpacity: [.32, .86], accentOpacity: [.52, .94], regrowDelay: [1, 2], regrowFade: .62,
  },
  rope: { step: 1 / 120, maxCatchup: .25, iterations: 3, curveSteps: 5, gravity: 280, lag: [.03, .65] }, // 固定步长、约束次数、样条细分、绳重力和空间延迟
  falling: { stagger: .25, tailCount: 25, tailDuration: .18, sparkLife: [.28, .65], rippleLife: .56 },
  ground: { y: .88, span: [.09, .91], alpha: .19, lineWidth: .72, segments: 7, waviness: 2.1 },
  sound: {
    voices: 8, impactTime: [.005, .015], impactBand: [4000, 8000],
    scatter: [.15, .45], overtone: [1.5, 2.3], attack: .001,
    pitchShift: [.85, 1.2], noiseGrains: [2, 4], noiseTime: [.008, .025], highpass: 5200,
  }, // 同时最多八次撞击，碎片散布时长、泛音比例、起音和高通噪声

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
