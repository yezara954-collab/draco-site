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
  // 白纸和中性灰星影。偏移按短边缩放，半径下限和羽化宽度用 CSS 像素。
  PAGE_COLOR: '#F4F4F2', PAGE_EDGE_COLOR: '#D9D9D6', INK_COLOR: '#3A3A3A',
  PAGE_SHADE: '#CFCFCB',
  STAR_SHADOW_ENABLED: true, STAR_SHADOW_ALPHA_MIN: .22, STAR_SHADOW_ALPHA_MAX: .40,
  STAR_SHADOW_BLUR_MIN: 1.5, STAR_SHADOW_BLUR_MAX: 4,
  STAR_SHADOW_SCALE: 1.25, STAR_SHADOW_SCALE_MAX: 1.5, STAR_SHADOW_MIN_RADIUS: 4.5,
  STAR_SHADOW_OFFSET: [12, 16], STAR_SHADOW_MAX: 18,

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

// Picture 阶段 3。长度按屏高比例或相框宽度比例，时间用秒，角度用度。
export const photoFlight = {
  PHOTO_SIZE_SCALE: .65, PHOTO_DEPTH_SCALE: [.8, 1.1],
  PHOTO_LIFT_DURATION: .4, PHOTO_FRAME_FLASH: .3,
  PHOTO_ROTATION: [-8, 8], PHOTO_ANCHOR_JITTER: .072,
  PHOTO_PAPER_COLOR: '#F8F8F6', PHOTO_INK_COLOR: '#3A3A3A', PHOTO_FRAME_COLOR: '#FFE9B0',
  PHOTO_TEXTURE_SIZE: 384, PHOTO_ASPECT: 1.17, PHOTO_THICKNESS: .009, PHOTO_IMAGE_MARGIN: .077,
  // 开场风结束一秒后，翻页才可出片。撞到相邻出生点时稍等再找空位。
  EMIT_AFTER_WIND: 1, EMIT_PROB_START: .15, EMIT_PROB_END: .50, EMIT_RAMP_SECONDS: 30,
  EMIT_DOUBLE_PROB: .12, EMIT_DOUBLE_DELAY: .10,
  EMIT_CROWD_TIME: .50, EMIT_CROWD_WIDTH: .60, EMIT_RETRY_DELAY: .05, EMIT_MAX_DELAY: .65,
  PHOTO_MAX_ONSCREEN: { desktop: 12, mobile: 7 },

  // 风道以屏高为单位：[轻微左拐, 右弯, 尾段偏移]。侧向间距随高度展开。
  WIND_LANE_CURVE: [.034, .245, .032], WIND_LANE_WIDTH: [.018, .105],
  PHOTO_RISE_SPEED: .177, PHOTO_SPEED_VARIATION: .15, PHOTO_SPIN_SPEED: 35,
  PHOTO_MAX_ROLL: 12, PHOTO_MAX_TILT: 19, PHOTO_WIND_SENSITIVITY: .045, PHOTO_BOB: .0045,

  // 高度从书底向上量，网格由左向右逐列脱落。
  PHOTO_DISSOLVE_HEIGHT_MIN: .35, PHOTO_DISSOLVE_HEIGHT_MAX: .60,
  PHOTO_DISSOLVE_DURATION_MIN: .9, PHOTO_DISSOLVE_DURATION_MAX: 1.3, PHOTO_DISSOLVE_TOP_ROOM: .10,
  DISSOLVE_GRID_COLS: { desktop: 12, mobile: 8 }, DISSOLVE_GRID_ROWS: { desktop: 14, mobile: 9 },

  // 星点共享缓冲池。汇聚点、飞行轨迹与尾迹均使用三维世界坐标。
  DUST_MAX: { desktop: 3000, mobile: 1200 },
  DUST_SIZE_MIN: 3, DUST_SIZE_MAX: 6, DUST_ALPHA_MAX: .58,
  DUST_COLOR_A: '#FFFFFF', DUST_COLOR_B: '#FFD66B',
  // 脱落后向右、向上的漂移距离（以屏幕高度为单位）。
  DUST_DRIFT_RIGHT: [.016, .047], DUST_DRIFT_UP: [.015, .042],
  DUST_GOLD_RATIO: .30, DUST_GLINT_CHANCE: .18, DUST_TINT_TIME: .25,

  // 每团星点的聚合时长、单点延迟（秒）及螺旋角度。折面亮度随到达比例连续上升。
  CRANE_COUNT_MAX: { desktop: 8, mobile: 4 },
  CRANE_SIZE_RATIO: 1.6, CRANE_MODEL_LENGTH: 3.97,
  CRANE_GATHER_START: .5, CRANE_GATHER_TIME: [1, 1.4], CRANE_GATHER_DELAY: .35,
  CRANE_GATHER_TURN_DEG: 180, CRANE_GATHER_SWIRL: .54,
  CRANE_FACE_ARRIVAL: [.66, 1], CRANE_DOT_BLEND: [.78, 1], CRANE_HOVER_TIME: .20,
  CRANE_GATHER_MIN_TRAVEL: .15, CRANE_FACE_FALLBACK_START: .84,
  // 凝结点优先向右上，周围空间不足时尝试横向、纵向错位。距离单位为鹤的体长。
  CRANE_ASSEMBLY_OFFSET: [.055, .073], CRANE_SITE_SHIFT: 1.5, CRANE_SITE_CLEARANCE: 1.25,
  CRANE_SITE_TRIES: 12, CRANE_SITE_MARGIN: .07,
  CRANE_FORM_SCALE: .55, CRANE_FORM_OVERSHOOT: .05, CRANE_FOLDED_ANGLE: 85,
  CRANE_UNFOLD_START: .50, CRANE_FORM_TWIST_DEG: 42,
  // 仅在网格开始脱落后调整剩余纸片的比例和朝向。
  CRANE_PAPER_END_SCALE: .76, CRANE_PAPER_TURN_DEG: 16,
  CRANE_PEARL: '#FFFDF5', CRANE_WARM: '#FFE3A2',
  CRANE_FACE_ALPHA: [.35, .65], CRANE_LINE_ALPHA: .86, CRANE_INNER_LIGHTS: 5,

  // 下拍、回举、滑翔各自计时；角度为度，时间为秒，前冲与起伏按比例。
  WING_ANGLE: [-20, 50],
  CRANE_GLIDE_FLAPS_MIN: 3, CRANE_GLIDE_FLAPS_MAX: 5,
  CRANE_GLIDE_TIME_MIN: .6, CRANE_GLIDE_TIME_MAX: 1.2,
  CRANE_DOWNSTROKE_TIME: .18, CRANE_UPSTROKE_TIME: .28, CRANE_GLIDE_TREMOR_DEG: 1.6,
  CRANE_STROKE_PULSE: .12, CRANE_BOB_AMOUNT: .03,
  CRANE_CLIMB_TIME: [.30, .50], CRANE_CLIMB_RADIUS: .34, CRANE_CLIMB_HEIGHT: .58,
  CRANE_CLIMB_TURN_MAX_DEG: 52, CRANE_SPEED_RAMP: [.38, 1.62],
  CRANE_LAUNCH_SPACING: .60, CRANE_LAUNCH_RADIUS: 1.20,
  CRANE_BANK_MAX_DEG: 25, CRANE_BANK_RESPONSE: .13, CRANE_BANK_CURVATURE: .18,
  CRANE_PITCH_MAX_DEG: 22, CRANE_POSE_ROLL_DEG: 55, CRANE_POSE_RESPONSE: .11,
  CRANE_ANATOMY_LAG: .10, CRANE_ANATOMY_FLEX: .16,

  // 航线与景深。角度以屏幕右方为零，上方为 90 度；低频摆动的周期单位为秒。
  CRANE_ROUTE_WEIGHT_UP: .50, CRANE_ROUTE_WEIGHT_SIDE: .25, CRANE_ROUTE_WEIGHT_GROUND: .25,
  CRANE_UP_ANGLE: [35, 145], CRANE_SIDE_ANGLES: [[-5, 35], [145, 185]],
  CRANE_MIN_ANGLE_SEP: 12, CRANE_FLIGHT_TIME_MIN: 3, CRANE_FLIGHT_TIME_MAX: 5,
  CRANE_LAYER_SCALES: [1.1, .85, .60], CRANE_LAYER_DEPTH: [.80, .90, .99],
  CRANE_LAYER_LIGHT: [1, .87, .72], CRANE_GROUND_LAYER: 1, CRANE_GROUND_BAND: [.04, .12],
  CRANE_GROUND_APPROACH: .42, CRANE_GROUND_BOB: .015, CRANE_EXIT_MARGIN: .10,
  CRANE_PATH_NOISE_AMP: [.08, .15], CRANE_PATH_NOISE_PERIOD: [2, 3],
  CRANE_SHRINK_PER_SEC: [.08, .15], CRANE_DIM_PER_SEC: .085,
  CRANE_FADE_START: .85, CRANE_EXIT_FADE: .48, CRANE_VANISH_POINTS: 18,

  // 尾迹是散开的细闪。发射按泊松间隔，漂移速度、粒径以 CSS 像素计。
  TRAIL_RATE_MIN: 35, TRAIL_RATE_MAX: 60,
  TRAIL_JITTER: [.15, .35], TRAIL_DRIFT: [5, 20], TRAIL_SINK: 3,
  TRAIL_LIFE_MIN: .5, TRAIL_LIFE_MAX: 1,
  TRAIL_SIZE_MIN: 1, TRAIL_SIZE_MAX: 2.5, TRAIL_CROSS_SIZE: [3, 4], TRAIL_CROSS_FLASH: .15,
  TRAIL_SPARKLE_HZ: [6, 14], TRAIL_CROSS_RATIO: .15, TRAIL_ALPHA_MAX: .70,
  TRAIL_MAX_LENGTH: 2, TRAIL_POOL_SHARE: .8,
  PHOTO_DISTURBS_TASSELS: false, PHOTO_ROPE_REACH: 29, PHOTO_ROPE_PUSH: 85,
  ROUGH_MODULE: 'https://cdn.jsdelivr.net/npm/roughjs@4.6.6/bundled/rough.esm.js',
};
