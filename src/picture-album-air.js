import { album as c, picture } from './config.js';

const { colors } = c;
export const random = ([a, b]) => a + (b - a) * Math.random();
export const integer = ([a, b]) => Math.floor(random([a, b + 1]));
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };
const direction = Math.sign(c.INTRO_WIND_DIRECTION) || 1;

function bitmap(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  return canvas;
}

function glow(color) {
  const canvas = bitmap(128, 128);
  const ctx = canvas.getContext('2d');
  const fade = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  fade.addColorStop(0, color);
  fade.addColorStop(.35, color + '70');
  fade.addColorStop(1, color + '00');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, 128, 128);
  return canvas;
}

export function makeAlbumAir(groundCanvas, windCanvas) {
  const ground = groundCanvas.getContext('2d');
  const wind = windCanvas.getContext('2d');
  const white = glow(colors.white);
  const warm = glow(colors.glow);
  const shadow = glow(colors.ink);
  let w, h, dpr, streaks = [], dust = [];

  function resize(width, height, ratio, mobile) {
    w = width;
    h = height;
    dpr = ratio;
    for (const ctx of [ground, wind]) {
      ctx.canvas.width = Math.ceil(w * ratio);
      ctx.canvas.height = Math.ceil(h * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    const factor = mobile ? picture.display.mobileFactor : 1;
    streaks = Array.from({ length: Math.round(integer(c.INTRO_WIND_STREAK_COUNT) * factor) }, () => ({
      anchor: random([-.12, 1.04]), y: random([.07, .91]), offset: random([0, .56]),
      length: random(c.INTRO_WIND_LENGTH), life: random(c.INTRO_WIND_STREAK_LIFE),
      alpha: random(c.INTRO_WIND_STREAK_ALPHA), bend: random([-17, 15]), speed: random([.65, 1.2]),
    }));
    dust = Array.from({ length: Math.round(c.INTRO_WIND_DUST_COUNT * factor) }, () => ({
      x: Math.random(), y: random([.11, .92]), speed: random([.56, 1.14]),
      timing: random([0, .65]), life: random([.38, .91]), size: random([2, 6]),
    }));
  }

  function groundAt(source, box) {
    const { left, right, top, bottom } = box;
    const x = (left + right) / 2, span = right - left, height = bottom - top;
    const y = h * picture.ground.y;
    ground.clearRect(0, 0, w, h);
    const stamp = (image, cx, cy, width, height, alpha) => {
      ground.globalAlpha = alpha;
      ground.drawImage(image, cx - width / 2, cy - height / 2, width, height);
    };
    stamp(warm, x, top + height * .63, span * c.BOOK_GLOW_SIZE[0], height * c.BOOK_GLOW_SIZE[1], c.BOOK_GLOW_ALPHA);
    stamp(white, x, y + height * .027, span * c.GROUND_GLOW_SIZE[0], span * c.GROUND_GLOW_SIZE[1], c.GROUND_GLOW_ALPHA);
    stamp(shadow, x, y, span, height * .32, c.SHADOW_ALPHA);

    const reflection = bitmap(span * dpr, height * c.REFLECTION_HEIGHT * dpr);
    const ctx = reflection.getContext('2d');
    const sw = source.width / w, sh = source.height / h;
    ctx.translate(0, reflection.height);
    ctx.scale(1, -1);
    ctx.drawImage(source, left * sw, top * sh, span * sw, height * sh, 0, 0,
      reflection.width, reflection.height);
    ctx.resetTransform();
    const alpha = ctx.createLinearGradient(0, 0, 0, reflection.height);
    alpha.addColorStop(0, '#fff');
    alpha.addColorStop(1, '#fff0');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = alpha;
    ctx.fillRect(0, 0, reflection.width, reflection.height);
    ground.globalAlpha = c.REFLECTION_ALPHA;
    ground.drawImage(reflection, left, y, span, reflection.height / dpr);
    ground.globalAlpha = 1;
  }

  function paint(time) {
    wind.clearRect(0, 0, w, h);
    if (!(time >= 0 && time < c.INTRO_WIND_DURATION)) return;
    wind.globalCompositeOperation = 'lighter';
    const endFade = 1 - smooth((time - c.INTRO_WIND_DURATION * .74) / (c.INTRO_WIND_DURATION * .26));
    for (const line of streaks) {
      const age = time - Math.max(0, line.anchor) / c.INTRO_WIND_SPEED - line.offset;
      const p = age / line.life;
      if (p <= 0 || p >= 1) continue;
      const x = (direction > 0 ? line.anchor : 1 - line.anchor) * w +
        direction * age * w * line.speed;
      const y = h * line.y - p * 14;
      const back = x - direction * line.length;
      const gradient = wind.createLinearGradient(back, y, x, y);
      gradient.addColorStop(0, colors.wind + '00');
      gradient.addColorStop(.77, colors.wind);
      gradient.addColorStop(1, colors.wind + '00');
      wind.strokeStyle = gradient;
      wind.lineWidth = .8;
      wind.globalAlpha = Math.sin(Math.PI * p) * line.alpha * endFade;
      wind.beginPath();
      wind.moveTo(back, y + line.bend);
      wind.quadraticCurveTo((back + x) / 2, y - line.bend, x, y);
      wind.stroke();
    }
    for (const point of dust) {
      const phase = (time - point.x / c.INTRO_WIND_SPEED - point.timing) / point.life;
      if (phase <= 0 || phase >= 1) continue;
      const x = (direction > 0 ? point.x : 1 - point.x) * w + direction * phase * point.speed * w * .53;
      const y = point.y * h - Math.sin(phase * Math.PI / 2) * 27;
      wind.globalAlpha = Math.sin(phase * Math.PI) * .49 * endFade;
      wind.drawImage(white, x - point.size / 2, y, point.size, point.size);
    }
    wind.globalAlpha = 1;
    wind.globalCompositeOperation = 'source-over';
  }
  return { resize, groundAt, paint };
}

export function frontArrival(x) {
  return (direction > 0 ? x : 1 - x) / c.INTRO_WIND_SPEED;
}

export function entryForce(time, x) {
  if (time < 0 || time >= c.INTRO_WIND_DURATION) return 0;
  const age = time - frontArrival(x);
  const envelope = smooth(age / .20) * (1 - smooth((age - .27) / 1.13));
  return direction * envelope * c.INTRO_WIND_STRENGTH * picture.rope.gravity * .125;
}
