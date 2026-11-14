import { instantCamera as c } from './config.js';

const files = import.meta.glob('./assets/**/*.{png,webp,jpg,jpeg}', { eager: true, query: '?url', import: 'default' });
const { colors } = c;
let roughReady;

export function surface(width, height = width) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  return canvas;
}

function load(path) {
  const url = files[path] ?? (/^(?:https?:|\/)/.test(path) ? path : null);
  if (!url) return Promise.resolve(null);
  const image = new Image();
  image.src = url;
  return image.decode().then(() => image, () => null);
}

function getRough() {
  if (globalThis.rough) return Promise.resolve(globalThis.rough);
  roughReady ??= new Promise(resolve => {
    const script = document.createElement('script');
    script.src = c.ROUGH_URL;
    script.onload = () => resolve(globalThis.rough);
    script.onerror = () => resolve(null);
    document.head.append(script);
  });
  return roughReady;
}

function placeholder(rough, kind) {
  const canvas = surface(360);
  const ctx = canvas.getContext('2d');
  const sketch = rough?.canvas(canvas);
  function shape(path, fill, seed = 20) {
    if (sketch) {
      sketch.path(path, { seed, stroke: colors.paperInk, strokeWidth: 3, fill, fillStyle: 'solid', roughness: .85 });
    } else {
      const outline = new Path2D(path);
      ctx.fillStyle = fill ?? colors.paperInk;
      if (fill) ctx.fill(outline);
      ctx.strokeStyle = colors.paperInk;
      ctx.lineWidth = 3;
      ctx.stroke(outline);
    }
  }
  if (kind < 0) {
    shape('M230 90 L294 71 Q318 71 324 102 L326 249 L272 326 L229 286 Z', colors.fallbackSide);
    shape('M54 125 L243 134 L268 244 L274 323 L46 298 L37 242 Z', colors.paper);
    shape('M45 59 Q52 40 76 42 L269 64 Q280 66 281 85 L280 133 L43 118 Z', colors.warmLight);
    shape('M60 64 L263 83 L262 112 L59 97 Z', colors.paperInk);
    shape('M204 148 L241 152 L247 191 L207 186 Z', colors.paperInk);
    shape('M156 141 A33 37 0 1 1 155.99 141 Z', colors.paperInk);
    shape('M156 151 A23 26 0 1 1 155.99 151 Z', colors.fallbackInset);
    shape('M41 239 L266 265 L270 312 L46 288 Z', colors.warmLight);
    shape('M59 261 L241 282 L241 294 L60 274 Z', colors.paperInk);
  } else {
    ctx.fillStyle = colors.paper;
    ctx.fillRect(0, 0, 360, 360);
    const doodles = [
      'M105 184 Q180 108 255 184 Q180 250 105 184 M180 158 A27 27 0 1 1 179.9 158 Z',
      'M207 104 C94 102 99 256 213 251 C240 246 258 229 264 215 C181 252 146 140 207 104 Z',
      'M179 244 L179 169 M179 175 C78 145 160 99 179 149 C209 79 277 148 179 175 Z M179 221 Q112 182 120 226 Z',
      'M99 227 Q77 198 109 154 L108 109 L154 144 L199 144 L234 108 L241 175 Q291 221 234 247 Q156 267 99 227 Z',
      'M90 195 L158 202 L207 114 L197 199 L271 184 L203 243 L146 251 L113 144 L83 154 L118 128 L160 177 Z',
      'M139 247 L159 158 L151 149 L207 149 L197 158 L220 247 Z M146 149 L179 117 L213 149 Z M113 256 L250 256',
    ];
    shape(doodles[kind % doodles.length], null, 90 + kind);
  }
  return canvas;
}

function fade(canvas, stop) {
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, colors.white);
  gradient.addColorStop(stop, colors.white + '46');
  gradient.addColorStop(1, colors.white + '00');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.globalCompositeOperation = 'source-over';
}

function makeShadows(body) {
  const reflection = surface(body.width, body.height);
  const ctx = reflection.getContext('2d');
  ctx.translate(0, reflection.height);
  ctx.scale(1, -1);
  ctx.drawImage(body, 0, 0);
  ctx.resetTransform();
  fade(reflection, c.REFLECTION_FADE);

  // 低分辨率白剪影只处理一次。多点采样柔化边缘，可用于 Safari。
  const mask = surface(160, 160 * body.height / body.width);
  const m = mask.getContext('2d');
  m.translate(0, mask.height);
  m.scale(1, -1);
  m.drawImage(body, 0, 0, mask.width, mask.height);
  m.resetTransform();
  m.globalCompositeOperation = 'source-in';
  m.fillStyle = colors.white;
  m.fillRect(0, 0, mask.width, mask.height);
  const pad = Math.ceil(c.SHADOW_BLUR * 2);
  const shadow = surface(mask.width + pad * 2, mask.height + pad * 2);
  const s = shadow.getContext('2d');
  s.globalCompositeOperation = 'lighter';
  const blur = c.SHADOW_BLUR;
  for (let row = -2; row <= 2; row++) {
    for (let column = -2; column <= 2; column++) {
      const weights = [1, 4, 6, 4, 1];
      s.globalAlpha = weights[row + 2] * weights[column + 2] / 256;
      s.drawImage(mask, pad + column * blur / 2, pad + row * blur / 2);
    }
  }
  s.globalAlpha = 1;
  fade(shadow, .36);
  return { reflection, shadow, pad, maskWidth: mask.width, maskHeight: mask.height };
}

export async function loadCameraArt() {
  const [camera, ...doodles] = await Promise.all([c.CAMERA_PATH, ...c.DOODLE_PATHS].map(load));
  const rough = !camera || doodles.some(image => !image) ? await getRough() : null;
  const source = camera ?? placeholder(rough, -1);
  const crop = camera ? c.CAMERA_CROP : [36 / 360, 40 / 360, 291 / 360, 287 / 360];
  const width = source.width * crop[2];
  const height = source.height * crop[3];
  const body = surface(width, height);
  body.getContext('2d').drawImage(source, source.width * crop[0], source.height * crop[1],
    width, height, 0, 0, body.width, body.height);
  const slot = camera ? [c.SLOT_CENTER_X, c.SLOT_CENTER_Y, c.SLOT_WIDTH] : [.415, .77, .51];
  const lens = camera ? c.LENS_CENTER : [.433, .495];
  return {
    body, ...makeShadows(body),
    slot: [(slot[0] - crop[0]) / crop[2], (slot[1] - crop[1]) / crop[3], slot[2] / crop[2]],
    lens: [(lens[0] - crop[0]) / crop[2], (lens[1] - crop[1]) / crop[3]],
    doodles: (doodles.length ? doodles : [null]).map((image, i) => image ?? placeholder(rough, i)),
  };
}

export function glow(color, star = false) {
  const canvas = surface(96);
  const ctx = canvas.getContext('2d');
  const r = canvas.width / 2;
  const gradient = ctx.createRadialGradient(r, r, 0, r, r, r);
  gradient.addColorStop(0, color);
  gradient.addColorStop(.33, color + '6A');
  gradient.addColorStop(.68, color + '19');
  gradient.addColorStop(1, color + '00');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (star) {
    ctx.translate(r, r);
    ctx.fillStyle = color;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const length = r * (i % 2 ? .095 : i % 4 ? .70 : .53);
      ctx.lineTo(Math.cos(angle) * length, Math.sin(angle) * length);
    }
    ctx.closePath();
    ctx.fill();
  }
  return canvas;
}
