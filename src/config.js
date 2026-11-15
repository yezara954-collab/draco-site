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

  paper: {
    destinations: { tassel: .34, crane: .33, ground: .33 },
    maxSameDestination: 2, hangingTime: [4, 6], groundLimit: 5, bounce: [1, 2],
  },
};

// Picture 相册阶段 2。尺寸使用屏幕比例或书本局部单位，角度为度，时间为秒。
export const album = {
  THREE_MODULE: 'three', // 固定 CDN 版本在 index.html 的 importmap
  BOOK_WIDTH_VW: { desktop: .48, mobile: .86 },
  BOOK_YAW_DEG: -12, CAMERA_ELEV_DEG: 29, CAMERA_FOV: 35, CAMERA_AZIMUTH_DEG: -26, // 左前方看向书脊
  BOOK_CENTER_X: .5, BOOK_HEIGHT_LIMIT: .37, // 超宽屏时为流苏和翻起的书页留空间
  PAGE_WIDTH: 2.05, PAGE_DEPTH: 2.95, PAGES_COUNT: { desktop: 20, mobile: 12 },
  PAGE_SEGMENTS: [40, 8], PAGE_THICKNESS: .012, COVER_DEPTH: .042,
  COVER_BORDER: .045, SPINE_GAP: .014, SPINE_HEIGHT: .047,
  OPEN_ARCH: .26, FREE_EDGE_LIFT: .13, // 靠书脊下弯，外缘略微翘起
  TEXTURE_SIZE: 768, FRAME_VARIANTS: 5, INK_OUTLINE_ALPHA: .68,
  // 白纸和中性灰星影。模糊、偏移和尺寸以 900 像素短边为基准。
  PAGE_COLOR: '#F4F4F2', PAGE_EDGE_COLOR: '#D9D9D6', INK_COLOR: '#3A3A3A',
  PAGE_SHADE: '#CFCFCB',
  STAR_SHADOW_ENABLED: true, STAR_SHADOW_ALPHA_MIN: .12, STAR_SHADOW_ALPHA_MAX: .30,
  STAR_SHADOW_BLUR_MIN: 4, STAR_SHADOW_BLUR_MAX: 14,
  STAR_SHADOW_OFFSET: [12, 16], STAR_SHADOW_SIZE: [42, 106], STAR_SHADOW_MAX: 20,

  // 每轮只有末页从容落下，转向停一拍。之后每轮乘以加速因子。
  SWEEP_TURN_BEAT: .25, SWEEP_ACCEL: .9, SWEEP_MIN_SCALE: .5,
  FLURRY_STAGGER_MIN: .06, FLURRY_STAGGER_MAX: .14,
  FLURRY_PAGE_DURATION_MIN: .4, FLURRY_PAGE_DURATION_MAX: .7,
  HERO_FLIP_DURATION: [.9, 1.2],
  MOTION_BLUR_GHOSTS: [.04, .08, .12], MOTION_BLUR_ALPHA: [.35, .20, .10],
  CURL_AMOUNT: 1.62, CURL_LAG: .23, EDGE_FLUTTER: .065,
  WIND_SAMPLE_LAG: .18, MAX_MOVING_PAGES: 12,

  // 入场风锋越过每条流苏后，按弧线控制摆角。阻尼比例越大，回摆越快衰减。
  WIND_RIGHT_BIAS: .35, WIND_RIGHT_CHANCE: .75,
  INTRO_SWAY_MAX_ANGLE_DEG: 30, INTRO_WIND_DURATION: 3,
  INTRO_WIND_FRONT_SPEED: 1.4, INTRO_WIND_ATTACK: .4,
  INTRO_WIND_RELEASE: 1.8, INTRO_DAMPING_SCALE: .65,

  // 入场时按风锋经过的顺序敲响随机选中的流苏，随后保持安静。
  CHIME_INTRO_ENABLED: true, CHIME_INTRO_RATIO: .60, CHIME_VOLUME: .05,
  CHIME_MAX_VOICES: 10, CHIME_GRAINS: [2, 3],
  CHIME_DURATION: [.03, .12], CHIME_FREQUENCY: [2500, 7000],

  // 地面层预渲染。倒影使用静态展开相册的缓存，避免逐帧模糊和读回。
  GROUND_GLOW_ALPHA: .15, GROUND_GLOW_SIZE: [1.14, .19],
  REFLECTION_ALPHA: .08, REFLECTION_HEIGHT: .30,
  SHADOW_ALPHA: .20, BOOK_GLOW_ALPHA: .14, BOOK_GLOW_SIZE: [1.18, 1.30],
  colors: {
    cover: '#1B1713', glow: '#FFF5DF', white: '#FFFFFF', groundInk: '#2A2622',
  },
};
