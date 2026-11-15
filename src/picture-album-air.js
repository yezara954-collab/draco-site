import { album as c, picture } from './config.js';

const { colors } = c;
export const random = ([a, b]) => a + (b - a) * Math.random();
export const integer = ([a, b]) => Math.floor(random([a, b + 1]));
const clamp = x => Math.max(0, Math.min(1, x));
const smooth = x => { const t = clamp(x); return t * t * (3 - 2 * t); };

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

export function makeAlbumAir(groundCanvas, starCanvas) {
  const ground = groundCanvas.getContext('2d');
  const stars = starCanvas.getContext('2d');
  const colorsOnGround = [glow(c.STARLIGHT_COOL), glow(c.STARLIGHT_WARM)];
  const white = glow(colors.white);
  const warm = glow(colors.glow);
  const shadow = glow(colors.groundInk);
  let w, h, dpr, bookBounds;

  function resize(width, height, ratio) {
    w = width;
    h = height;
    dpr = ratio;
    for (const ctx of [ground, stars]) {
      ctx.canvas.width = Math.ceil(w * ratio);
      ctx.canvas.height = Math.ceil(h * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
  }

  function groundAt(source, box) {
    bookBounds = box;
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

  function glowAt(lights, count) {
    if (!bookBounds) return;
    const { left, right, top, bottom } = bookBounds;
    const [minimum, maximum] = c.STARLIGHT_GROUND_ALPHA;
    const radius = c.STARLIGHT_SHAPE_SIZE[1] * Math.min(w, h) / 900;
    stars.clearRect(left - 2 * radius, bottom - radius, right - left + 4 * radius, 2 * radius);
    for (let i = 0; i < count; i++) {
      const { x, y, size, warm, score } = lights[i];
      const centerY = bottom + (y - (top + bottom) * .5) * .18;
      stars.globalAlpha = (minimum + (maximum - minimum) * score) * Math.sqrt(score);
      stars.drawImage(colorsOnGround[Number(warm)], x - .58 * size, centerY - size * .15,
        1.16 * size, .30 * size);
    }
    stars.globalAlpha = 1;
  }
  return { resize, groundAt, glowAt };
}

export function frontArrival(x) {
  return x / c.INTRO_WIND_FRONT_SPEED;
}

export function entrySway(time, x) {
  const age = time - frontArrival(x);
  if (age <= 0 || time >= c.INTRO_WIND_DURATION) return 0;
  const amplitude = c.INTRO_SWAY_MAX_ANGLE_DEG * Math.PI / 180;
  if (age <= c.INTRO_WIND_ATTACK) return amplitude * smooth(age / c.INTRO_WIND_ATTACK);
  const release = clamp((age - c.INTRO_WIND_ATTACK) / c.INTRO_WIND_RELEASE);
  return amplitude * Math.cos(release * 1.55 * Math.PI) *
    (1 - smooth(release)) ** (1.25 + c.INTRO_DAMPING_SCALE);
}
