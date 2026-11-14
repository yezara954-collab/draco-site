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

// Picture 阶段 2。时间用秒，角度为度，屏幕位置用比例。
export const instantCamera = {
  // 路径相对于 src。更换素材时在这里更新路径和归一化坐标。
  CAMERA_PATH: './assets/picture/camera.png',
  DOODLE_PATHS: [
    './assets/picture/doodle_01.png', './assets/picture/doodle_02.png',
    './assets/picture/doodle_03.png', './assets/picture/doodle_04.png',
    './assets/picture/doodle_05.png', './assets/picture/doodle_06.png',
  ],
  ROUGH_URL: 'https://cdn.jsdelivr.net/npm/roughjs@4.6.6/bundled/rough.js',
  // 原始透明素材的有效图框 [左, 上, 宽, 高]；出片口和镜头坐标按原图计算。
  CAMERA_CROP: [68 / 736, 73 / 736, 605 / 736, 602 / 736],
  SLOT_CENTER_X: .369, SLOT_CENTER_Y: .811, SLOT_WIDTH: .435,
  LENS_CENTER: [.445, .495],
  PRINT_DIRECTION_DEG: 101, // 0 向右，90 向下，当前略向左
  CAMERA_X: .50, CAMERA_HEIGHT: .29, CAMERA_HEIGHT_MOBILE: .34,
  CAMERA_MAX_WIDTH: .74, GROUND_OFFSET: .03, // 机身底边在原地平线下方 3% 屏高
  CAMERA_BREATH: .01, BREATH_PERIOD: 4,
  CAMERA_GLOW_ALPHA: .135, CAMERA_GLOW_SIZE: [1.34, 1.17],
  LENS_GLINT_INTERVAL: [4.5, 9], LENS_GLINT_TIME: .34, LENS_GLINT_SIZE: .063,
  SHUTTER_SHAKE: 1.65, SHUTTER_TIME: .15, FLASH_TIME: .29, FLASH_SIZE: .16,

  // 轨道半径相对机宽，轨道中心相对机身高度，辉光值为透明度。
  ORBIT_RX: .75, ORBIT_RY: .205, ORBIT_Y: .58, ORBIT_TILT_DEG: -15,
  ORBIT_MAX_VIEW_RX: .485, ORBIT_PERIOD: 18, ORBIT_START_DEG: 203, PLANET_SIZE: .076, ORBIT_GLOW: .41,
  ORBIT_DASH: [2.1, 4], ORBIT_LINE_WIDTH: .76,
  ORBIT_FRONT_ALPHA: .71, ORBIT_BACK_ALPHA: .46,
  PLANET_RING_RATIO: [1.82, .42], PLANET_RING_TILT: [-30, 9],
  PLANET_DEPTH_SCALE: [.87, 1.08], PLANET_GLOW_SIZE: 3.2,

  // 出片列队间隔、手动冷却与同屏上限（包括已躺下的相纸）。
  AUTO_INTERVAL: [4, 6], MANUAL_COOLDOWN: 1.2, BURST_COUNT: [1, 3],
  BURST_INTERVAL: [.8, 1.4], PHOTO_LIMIT: 4, PHOTO_LIMIT_MOBILE: 3,
  SLIDE_TIME: [1.6, 2.2], SLIDE_EASE: 2.25, PHOTO_ROTATION: 6,
  PHOTO_WIDTH: .55, PHOTO_HEIGHT: 1.2, PHOTO_MARGIN: .068, PHOTO_INK_WIDTH: .008,
  PHOTO_FEED_SQUASH: .43, PHOTO_FEED_WOBBLE: .023, PHOTO_EXIT_EXTRA: .043,
  PHOTO_FRONT_AT: .5, PHOTO_GLOW_ALPHA: .15, PHOTO_GLOW_SIZE: [1.48, 1.9],
  // 阶段 2 临时去向。落下、轻弹一次、停留后化成星点。
  PHOTO_FALL_TIME: .56, PHOTO_BOUNCE_TIME: .28, PHOTO_BOUNCE_HEIGHT: .038,
  PHOTO_REST_TIME: 4, PHOTO_REST_SQUASH: .30, PHOTO_GROUND_Y: .957, PHOTO_VIEW_MARGIN: .012,
  PHOTO_SCATTER_TIME: .72, PHOTO_SPARK_COUNT: 18, PHOTO_SPARK_SIZE: [1, 2.65],
  PHOTO_SPARK_DRIFT: [.075, .24], PHOTO_LANDING_SPREAD: [.16, .62],

  // 白色光影。光池宽高按机宽计算，阴影长度为机宽倍数，模糊用缓存像素。
  CONTACT_GLOW_ALPHA: .145, CONTACT_GLOW_SIZE: [.9, .08],
  SHADOW_ENABLED: true, SHADOW_ALPHA: .17, SHADOW_LENGTH_MIN: .5, SHADOW_LENGTH_MAX: 1.55,
  SHADOW_SQUASH: .16, SHADOW_BLUR: 5, SHADOW_FOLLOWS_PLANET: true,
  SHADOW_FIXED_DEG: 52, SHADOW_EASE: 5.5,
  REFLECTION_ENABLED: true, REFLECTION_ALPHA: .095, REFLECTION_SQUASH: .85, REFLECTION_FADE: .36,
  PHOTO_SHADOW_ENABLED: true, PHOTO_SHADOW_ALPHA: .11, PHOTO_SHADOW_SIZE: [1.03, .28],

  // 奶白细线、暖黄行星、米白相纸、深墨边和白色投影。
  colors: {
    orbit: '#FFF0BE', planetHighlight: '#FFF1AA', planet: '#F2C641', planetShade: '#A36B25',
    star: '#FFFFFF', warmLight: '#FFE08A', paper: '#EFE8D5', paperInk: '#2C2119',
    white: '#FFFFFF', fallbackSide: '#AE702D', fallbackInset: '#BF8F4A',
  },
};
