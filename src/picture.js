import { PICTURE as config } from './motion-config.js';
import cameraUrl from './assets/picture/camera-blue.svg';
import previewPhoto from './assets/covers/cover-picture-back.webp';
import { openPhotoLibrary, preparePhoto, withPhotoImage } from './picture-storage.js';
import { drawFoldingPaper } from './picture-fold.js';
import './picture.css';

const { stage, palette, camera, paper, timing, flight, stars } = config;
const clamp = x => Math.max(0, Math.min(1, x));
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);
const cubic = (points, t) => points[0].map((_, i) =>
  (1 - t) ** 3 * points[0][i] + 3 * (1 - t) ** 2 * t * points[1][i] +
  3 * (1 - t) * t ** 2 * points[2][i] + t ** 3 * points[3][i]);

const liftStart = timing.delay + timing.eject;
const hoverStart = liftStart + timing.rise;
const foldStart = hoverStart + timing.hover;
const flightStart = foldStart + timing.fold;
const cycleEnd = flightStart + timing.flight + timing.rest;
const printDepth = .73;
const ejectY = camera.slotY + paper.height * printDepth / 2 + 2;

function makeStageCanvas(parent) {
  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(devicePixelRatio || 1, stage.maxDpr);
  canvas.width = Math.round(stage.width * dpr);
  canvas.height = Math.round(stage.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  parent.append(canvas);
  return ctx;
}

function drawStar(ctx, x, y, r, color, opacity) {
  ctx.fillStyle = color;
  ctx.globalAlpha = clamp(opacity);
  ctx.beginPath();
  ctx.moveTo(x - r, y);
  ctx.quadraticCurveTo(x, y, x, y - r * 1.24);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.quadraticCurveTo(x, y, x, y + r * 1.24);
  ctx.quadraticCurveTo(x, y, x - r, y);
  ctx.fill();
}

function makeStarField() {
  let seed = stars.seed;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  return Array.from({ length: stars.count }, (_, i) => {
    const drape = i < stars.drapeCount;
    const x = drape ? 106 + i / (stars.drapeCount - 1) * 1388 : 45 + random() * 1510;
    const y = drape ? 86 + Math.sin(i / (stars.drapeCount - 1) * Math.PI) * 42 + random() * 96 : 28 + random() * 836;
    const radius = drape ? 2 + random() * 3 : .52 + random() * 1.4;
    return { x, y, radius, drape, phase: random() * Math.PI * 2, speed: .6 + random() * 1.35, color: i % 9 === 0 ? palette.gold : palette.white };
  });
}

function drawSky(ctx, field, seconds) {
  ctx.clearRect(0, 0, stage.width, stage.height);
  for (const { x, y, radius, drape, phase, speed, color } of field) {
    const pulse = .50 + .50 * Math.sin(seconds * speed + phase);
    if (drape) {
      const line = ctx.createLinearGradient(x, 0, x, y);
      line.addColorStop(0, '#e9f5ff03');
      line.addColorStop(.7, '#e9f5ff30');
      line.addColorStop(1, '#e9f5ff99');
      ctx.strokeStyle = line;
      ctx.globalAlpha = .24 + pulse * .45;
      ctx.lineWidth = .65;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
    drawStar(ctx, x, y, radius * (.82 + pulse * .18), color, (drape ? .48 : .10) + pulse * (drape ? .42 : .25));
  }
  ctx.globalAlpha = 1;
}

function makePrint(image) {
  const canvas = document.createElement('canvas');
  canvas.width = paper.width * 3;
  canvas.height = paper.height * 3;
  const context = canvas.getContext('2d');
  context.scale(3, 3);
  context.fillStyle = palette.paper;
  context.fillRect(0, 0, paper.width, paper.height);
  const inset = 8;
  const w = paper.width - inset * 2;
  const h = paper.height - 31;
  const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
  const iw = scale * image.naturalWidth;
  const ih = scale * image.naturalHeight;
  context.fillStyle = '#cdd8eb';
  context.fillRect(inset, inset, w, h);
  context.beginPath();
  context.rect(inset, inset, w, h);
  context.clip();
  context.drawImage(image, inset + (w - iw) / 2, inset + (h - ih) / 2, iw, ih);
  return canvas;
}

function flightPoint(start, t) {
  return cubic([start, ...flight.controls.slice(1)], t);
}

function drawFlightTrail(ctx, t, start) {
  const length = Math.min(t, flight.trail);
  if (length <= 0) return;
  for (let i = 0; i < 25; i++) {
    const u = t - length + i / 25 * length;
    const a = flightPoint(start, u);
    const b = flightPoint(start, Math.min(1, u + length / 25));
    ctx.globalAlpha = (i / 25) ** 1.65 * .68;
    ctx.strokeStyle = i % 6 === 0 ? palette.gold : palette.cold;
    ctx.lineWidth = .45 + i / 34;
    ctx.beginPath();
    ctx.moveTo(...a);
    ctx.lineTo(...b);
    ctx.stroke();
  }
  for (let i = 0; i < stars.trailCount; i++) {
    const age = (i + 1) / (stars.trailCount + 1);
    const u = t - age * flight.trail * 1.34;
    if (u < 0 || u > 1) continue;
    const [x, y] = flightPoint(start, u);
    const spread = (11 + age * 37) * Math.sin(i * 2.399);
    const blink = .65 + .35 * Math.sin(i * 2.1 + t * 31);
    drawStar(ctx, x - age * 17, y + spread, (i % 6 === 0 ? 4.1 : 1.9) * (1 - age * .7),
      i % 7 === 0 ? palette.gold : palette.white, (1 - age) * blink * .84);
  }
  ctx.globalAlpha = 1;
}

function hoverPose(seconds) {
  return [paper.x + Math.sin(seconds * 2.2) * 8, paper.y + Math.sin(seconds * 2.6) * 10];
}

function paintPrint(ctx, clock, image, reduced) {
  ctx.clearRect(0, 0, stage.width, stage.height);
  if (!image || clock < timing.delay || clock >= flightStart + timing.flight) return false;
  const fold = clamp((clock - foldStart) / timing.fold);
  const flightTime = clamp((clock - flightStart) / timing.flight);
  const exitWeight = ease(clamp((flightTime - .78) / .22));
  const start = hoverPose(flightStart - hoverStart);
  let [x, y] = start;
  let angle = paper.angle;
  let scale = 1;
  let flap = 0;
  let depth = 1;
  ctx.save();
  if (reduced) {
    [x, y] = hoverPose(0);
    ctx.globalAlpha = Math.min(clamp((clock - timing.delay) / .4), clamp((cycleEnd - clock - .4) / .5));
  } else if (clock < liftStart) {
    const p = ease(clamp((clock - timing.delay) / timing.eject));
    x = camera.slotX;
    y = mix(camera.slotY - paper.height * printDepth / 2, ejectY, p);
    depth = printDepth;
    angle = camera.slotAngle;
    // 原画出片口下沿作为裁切边界，前缘在出纸阶段盖住相纸。
    ctx.beginPath();
    ctx.moveTo(0, camera.slotY - camera.slotX * camera.slotAngle);
    ctx.lineTo(stage.width, camera.slotY + (stage.width - camera.slotX) * camera.slotAngle);
    ctx.lineTo(stage.width, stage.height);
    ctx.lineTo(0, stage.height);
    ctx.closePath();
    ctx.clip();
  } else if (clock < hoverStart) {
    const p = clamp((clock - liftStart) / timing.rise);
    [x, y] = cubic([[camera.slotX, ejectY], [570, 875], [493, 320], [paper.x, paper.y]], ease(p));
    depth = mix(printDepth, 1, ease(p));
    angle = mix(camera.slotAngle, paper.angle, ease(p)) + Math.sin(Math.PI * p) * -.24;
  } else if (flightTime > 0) {
    const t = flightTime ** 1.16;
    [x, y] = flightPoint(start, t);
    drawFlightTrail(ctx, t, start);
    angle = paper.angle + Math.sin(t * Math.PI) * .2 - t * .2;
    scale = mix(1, flight.scale, t);
    flap = Math.sin(t * Math.PI * 12) * 12 * clamp(t * 12);
    ctx.globalAlpha = 1 - exitWeight;
  } else {
    [x, y] = hoverPose(clock - hoverStart);
  }
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale * depth);
  drawFoldingPaper(ctx, image, paper.width, paper.height, reduced ? 0 : fold, flap);
  ctx.restore();
  return !reduced && clock < liftStart;
}

function positionCamera(image) {
  const { style } = image;
  style.left = `${100 * camera.x / stage.width}%`;
  style.top = `${100 * camera.y / stage.height}%`;
  style.width = `${100 * camera.width / stage.width}%`;
  style.height = `${100 * camera.height / stage.height}%`;
}

export function mountPicture(host) {
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const scene = document.createElement('section');
  scene.className = 'picture-scene';
  scene.setAttribute('aria-label', 'Picture 魔法拍立得');
  scene.innerHTML = `
    <div class="picture-composition"></div>
    <div class="picture-controls">
      <button type="button" class="picture-upload">添加照片</button>
      <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple hidden>
      <p class="picture-status" role="status"></p>
    </div>`;
  for (const [name, color] of Object.entries(palette)) scene.style.setProperty(`--picture-${name}`, color);
  scene.style.setProperty('--picture-aspect', stage.width / stage.height);
  const composition = scene.querySelector('.picture-composition');
  const upload = scene.querySelector('.picture-upload');
  const input = scene.querySelector('input');
  const status = scene.querySelector('.picture-status');
  const sky = makeStageCanvas(composition);
  const artwork = new Image();
  artwork.className = 'picture-camera';
  artwork.alt = '暖白和深黑的复古拍立得，镜片带冷蓝反光';
  artwork.src = cameraUrl;
  positionCamera(artwork);
  composition.append(artwork);
  const animation = makeStageCanvas(composition);
  const front = new Image();
  front.className = 'picture-front';
  front.alt = '';
  front.src = cameraUrl;
  front.hidden = true;
  front.style.clipPath = 'polygon(12% 87.8%, 74.6% 89%, 74.6% 91%, 12% 90%)';
  positionCamera(front);
  composition.append(front);
  const pause = document.createElement('button');
  pause.className = 'picture-pause';
  pause.type = 'button';
  pause.style.left = `${100 * camera.buttonX / stage.width}%`;
  pause.style.top = `${100 * camera.buttonY / stage.height}%`;
  composition.append(pause);
  host.append(scene);

  const field = makeStarField();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let library;
  let records = [];
  let print;
  let demo;
  let nextIndex = 0;
  let cycle = 0;
  let seconds = 0;
  let paused = false;
  let preparing = true;
  upload.disabled = true;

  function setPaused(value) {
    paused = value;
    pause.setAttribute('aria-label', paused ? '继续播放' : '暂停动画');
    pause.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">${paused
      ? '<path d="m5 2 9 6-9 6z"/>'
      : '<path d="M4 3h2.5v10H4zm5.5 0H12v10H9.5z"/>'}</svg>`;
  }

  async function prepareNext() {
    preparing = true;
    if (!records.length) {
      print = demo;
    } else {
      print = null;
      const count = records.length;
      for (let i = 0; i < count && !print; i++) {
        const photo = records[nextIndex++ % count];
        try {
          await withPhotoImage(photo.blob, image => {
            if (!signal.aborted) print = makePrint(image);
          });
        } catch {
          if (!signal.aborted) status.textContent = `无法读取「${photo.name}」`;
        }
        if (signal.aborted) return;
      }
    }
    cycle = 0;
    preparing = false;
  }

  async function load() {
    const sample = new Image();
    sample.src = previewPhoto;
    const sampleReady = sample.decode().then(() => {
      if (!signal.aborted) demo = makePrint(sample);
    }).catch(() => {});
    try {
      const db = await openPhotoLibrary();
      if (signal.aborted) {
        db.close();
        return;
      }
      library = db;
      records = await db.list();
    } catch {
      if (!signal.aborted) status.textContent = '无法读取本地照片库。';
    }
    await sampleReady;
    if (signal.aborted) return;
    upload.disabled = !library;
    await prepareNext();
  }

  setPaused(false);
  drawSky(sky, field, 0);
  pause.addEventListener('click', () => setPaused(!paused), { signal });
  upload.addEventListener('click', () => input.click(), { signal });
  input.addEventListener('change', async () => {
    const files = Array.from(input.files);
    input.value = '';
    if (!files.length) return;
    upload.disabled = true;
    let added = 0;
    let failed = 0;
    for (const file of files) {
      try {
        const photo = await preparePhoto(file, signal);
        const id = await library.add(photo);
        if (signal.aborted) return;
        records.push({ ...photo, id });
        added++;
      } catch {
        if (signal.aborted) return;
        failed++;
      }
    }
    if (added) nextIndex = records.length - added;
    status.textContent = `已保存 ${added} 张${failed ? `，${failed} 张无法读取或保存` : ''}`;
    upload.disabled = false;
    if (added && !print && !preparing) void prepareNext();
  }, { signal });
  void load();

  return {
    update(dt) {
      if (paused || document.hidden) return;
      const elapsed = Math.min(dt, timing.maxStep);
      seconds += elapsed;
      if (!motion.matches) drawSky(sky, field, seconds);
      if (preparing || !print) return;
      cycle += elapsed;
      front.hidden = !paintPrint(animation, cycle, print, motion.matches);
      if (cycle >= cycleEnd) void prepareNext();
    },
    destroy() {
      lifetime.abort();
      library?.close();
      scene.remove();
    },
  };
}
