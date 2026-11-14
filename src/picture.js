import { picture as config } from './config.js';
import { openPhotoLibrary, preparePhoto } from './picture-storage.js';
import './picture.css';

const { palette, display, sky, tassel, wind, falling, ground } = config;
const tau = 2 * Math.PI;
const clamp = value => Math.max(0, Math.min(1, value));
const mix = (a, b, t) => a + (b - a) * t;

function makeRandom(initial) {
  let seed = initial;
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function makeStar(random, index) {
  const points = index % 3 ? 4 : 5;
  return {
    color: index % 3 === 1 ? palette.gold : palette.ink,
    seed: index + 700,
    corners: Array.from({ length: points * 2 }, (_, i) => {
      const angle = i * Math.PI / points - Math.PI / 2 + (random() - .5) * .1;
      const radius = (i % 2 ? (points === 4 ? .27 : .44) : 1) * mix(.90, 1.13, random());
      return [Math.cos(angle) * radius, Math.sin(angle) * radius];
    }),
  };
}

function drawStar(ctx, art, x, y, size, angle, alpha, glow = tassel.glow) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = art.color;
  ctx.shadowColor = art.color;
  ctx.shadowBlur = glow;
  ctx.lineWidth = 1.05;
  ctx.lineJoin = 'round';
  if (art.rough) {
    ctx.scale(size / art.rough.size, size / art.rough.size);
    art.rough.renderer.draw(art.rough.drawing);
  } else {
    ctx.beginPath();
    art.corners.forEach(([px, py], index) => {
      if (index === 0) ctx.moveTo(px * size, py * size);
      else ctx.lineTo(px * size, py * size);
    });
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;
    // 断续的第二道细边保留手绘墨线的浓淡与笔锋。
    ctx.globalAlpha *= .45;
    ctx.lineWidth = .55;
    ctx.beginPath();
    for (let i = 0; i < art.corners.length; i += 3) {
      const [a, b] = [art.corners[i], art.corners[(i + 1) % art.corners.length]];
      ctx.moveTo(a[0] * size * .95, a[1] * size * .95);
      ctx.lineTo(mix(a[0], b[0], .78) * size * .95, mix(a[1], b[1], .78) * size * .95);
    }
    ctx.stroke();
  }
  ctx.restore();
}

function dot(ctx, x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, tau);
  ctx.fill();
}

function makeSky(canvas, ctx, motion) {
  const random = makeRandom(display.seed + 1);
  const range = ([a, b]) => mix(a, b, random());
  const fieldRandom = makeRandom(display.seed);
  const field = Array.from({ length: sky.count }, (_, i) => ({
    x: fieldRandom(), y: mix(.015, .95, fieldRandom()), size: mix(...sky.size, fieldRandom()),
    period: mix(...sky.period, fieldRandom()), phase: fieldRandom() * tau,
    pale: i % 7 !== 0, flare: i < sky.flares ? makeStar(fieldRandom, i + 1) : null,
  }));
  const strands = Array.from({ length: tassel.count }, (_, i) => ({
    index: i, length: range(tassel.length), size: range(tassel.starRadius),
    beads: Math.round(range(tassel.beadCount)), art: makeStar(random, i),
    angle: range([-.025, .025]), angularSpeed: 0, regrow: tassel.regrow, missing: false,
  }));
  let width = 1;
  let height = 1;
  let scale = 1;
  let active = [];
  let starLimit = sky.count;
  let clock = 0;
  let nextFall = range(falling.first);
  let drop;
  let sparks = [];
  let roughRenderer;
  let background;

  function sizeOf(strand) { return strand.size * scale; }

  function fit() {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    const ratio = Math.min(devicePixelRatio || 1, display.maxDpr);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    const narrow = width <= display.mobileWidth;
    scale = mix(...display.starScale, clamp(width / display.fullSizeWidth));
    const count = narrow ? Math.ceil(tassel.count * display.mobileFactor) : tassel.count;
    starLimit = narrow ? Math.round(sky.count * display.mobileFactor) : sky.count;
    active = Array.from({ length: count }, (_, i) => strands[Math.round(i * (strands.length - 1) / Math.max(1, count - 1))]);
    active.forEach((strand, i) => {
      strand.x = width * mix(...tassel.span, (i + .13 * Math.sin(i * 5)) / Math.max(1, count - 1));
      strand.reach = height * strand.length;
      if (roughRenderer) {
        strand.art.rough = {
          renderer: roughRenderer,
          size: sizeOf(strand),
          drawing: roughRenderer.generator.polygon(strand.art.corners.map(([x, y]) => [x * sizeOf(strand), y * sizeOf(strand)]), {
            stroke: strand.art.color, strokeWidth: .73, roughness: .72, bowing: .38, seed: strand.art.seed,
          }),
        };
      }
    });
    background = ctx.createLinearGradient(0, 0, 0, height);
    background.addColorStop(.35, palette.black);
    background.addColorStop(1, palette.blackTint);
    if (drop) {
      drop.strand.missing = false;
      drop = null;
    }
    sparks = [];
    paint();
  }

  function drawGround() {
    const [left, right] = ground.span.map(value => value * width);
    const y = height * ground.y;
    const length = (right - left) / ground.segments;
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = ground.lineWidth;
    for (let i = 0; i < ground.segments; i++) {
      const x = left + i * length;
      ctx.globalAlpha = ground.alpha * (.64 + .36 * Math.sin(i * .76 + .7));
      ctx.beginPath();
      ctx.moveTo(x, y + Math.sin(i * 2) * ground.waviness * .5);
      ctx.bezierCurveTo(x + length * .19, y - ground.waviness, x + length * .52,
        y + ground.waviness * Math.cos(i * 1.8), x + length * (.81 + .14 * Math.sin(i * 4)), y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawStrand(strand) {
    const x = Math.sin(strand.angle) * strand.reach;
    const y = Math.cos(strand.angle) * strand.reach;
    ctx.save();
    ctx.translate(strand.x, 0);
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = tassel.lineWidth;
    ctx.globalAlpha = tassel.lineOpacity;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(x * .56, y * .47, x, y);
    ctx.stroke();
    for (let i = 1; i <= strand.beads; i++) {
      const p = (i + .13 * Math.sin(i * 6 + strand.index)) / (strand.beads + 1.1);
      ctx.fillStyle = i === strand.beads ? strand.art.color : palette.ink;
      ctx.globalAlpha = .3 + p * .36;
      dot(ctx, x * (p + .12 * p * (1 - p)), y * (p - .06 * p * (1 - p)), (1.05 + p * .5) * scale);
    }
    ctx.restore();
    if (!strand.missing) {
      const growth = clamp(strand.regrow / tassel.regrow);
      drawStar(ctx, strand.art, strand.x + x, y + sizeOf(strand) * .92, sizeOf(strand) * (.65 + growth * .35),
        strand.angle * .62, growth * .93);
    }
  }

  function paint() {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);
    for (let i = 0; i < starLimit; i++) {
      const star = field[i];
      const pulse = (.5 + .5 * Math.sin(clock * tau / star.period + star.phase)) ** 2;
      const opacity = mix(...sky.opacity, pulse);
      const tint = star.pale ? palette.ink : palette.gold;
      if (star.flare && pulse > .72) {
        drawStar(ctx, star.flare, star.x * width, star.y * height, 3.8 * scale, 0, (pulse - .72) * 1.9, 3);
      }
      ctx.globalAlpha = opacity;
      ctx.fillStyle = tint;
      dot(ctx, star.x * width, star.y * height, star.size * scale);
    }
    ctx.globalAlpha = 1;
    active.forEach(drawStrand);
    drawGround();
    if (drop) {
      drop.tail.forEach(({ x, y }, i) => {
        const p = (i + 1) / drop.tail.length;
        ctx.fillStyle = i % 3 ? palette.ink : drop.strand.art.color;
        ctx.globalAlpha = p * p * .60;
        dot(ctx, x, y, (.28 + p * 1.14) * scale);
      });
      ctx.globalAlpha = 1;
      drawStar(ctx, drop.strand.art, drop.x, drop.y, sizeOf(drop.strand), drop.angle, 1);
    }
    for (const spark of sparks) {
      const p = clamp(1 - spark.age / spark.life);
      ctx.globalAlpha = p * .83;
      ctx.fillStyle = spark.color;
      dot(ctx, spark.x, spark.y, (.5 + p * 1.25) * scale);
    }
    ctx.globalAlpha = 1;
  }

  function detach() {
    const strand = active[Math.floor(random() * active.length)];
    strand.missing = true;
    strand.regrow = 0;
    drop = {
      strand, x: strand.x + Math.sin(strand.angle) * strand.reach,
      y: Math.cos(strand.angle) * strand.reach + sizeOf(strand) * .92,
      vx: Math.cos(strand.angle) * strand.angularSpeed * strand.reach,
      vy: 8, angle: strand.angle, tail: [], sample: 0,
    };
  }

  function update(dt) {
    if (motion.matches || document.hidden) return;
    dt = Math.min(dt, display.maxStep);
    clock += dt;
    for (const strand of active) {
      const time = clock - strand.x / width * wind.travel;
      const front = ((time % wind.gustEvery) + wind.gustEvery) % wind.gustEvery;
      const gust = front < wind.gustDuration ? Math.sin(Math.PI * front / wind.gustDuration) ** 2 : 0;
      const force = wind.steady * Math.sin(time * wind.pulseSpeed)
        + wind.steady * .37 * Math.sin(time * wind.crossSpeed + strand.index * .23) + gust * wind.gust;
      const acceleration = force - wind.damping * strand.angularSpeed - wind.gravity / strand.reach * Math.sin(strand.angle);
      strand.angularSpeed += acceleration * dt;
      strand.angle += strand.angularSpeed * dt;
      if (!strand.missing) strand.regrow = Math.min(tassel.regrow, strand.regrow + dt);
    }
    if (!drop && clock >= nextFall) detach();
    if (drop) {
      drop.vx *= 1 - falling.airDrag * dt;
      drop.vy += falling.gravity * dt;
      drop.x += drop.vx * dt;
      drop.y += drop.vy * dt;
      drop.angle += dt * .25;
      drop.sample += dt;
      if (drop.sample >= falling.tailStep) {
        drop.sample %= falling.tailStep;
        drop.tail.push({ x: drop.x, y: drop.y });
        if (drop.tail.length > falling.tailCount) drop.tail.shift();
      }
      if (drop.y >= height * ground.y) {
        const floor = height * ground.y;
        const count = width <= display.mobileWidth ? Math.ceil(falling.sparkCount * display.mobileFactor) : falling.sparkCount;
        sparks = Array.from({ length: count }, (_, i) => ({
          x: drop.x, y: floor, vx: range([-46, 46]), vy: range([-53, -14]),
          life: range(falling.sparkLife), age: 0, color: i % 3 ? palette.ink : palette.gold,
        }));
        drop.strand.missing = false;
        drop = null;
        nextFall = clock + range(falling.interval);
      }
    }
    sparks = sparks.filter(spark => spark.age < spark.life);
    for (const spark of sparks) {
      spark.age += dt;
      spark.x += spark.vx * dt;
      spark.y += spark.vy * dt;
      spark.vy += 69 * dt;
    }
    paint();
  }

  return {
    fit, update,
    setRough(renderer) { roughRenderer = renderer; fit(); },
    settle() {
      drop = null;
      sparks = [];
      for (const strand of strands) {
        strand.angle = strand.angularSpeed = 0;
        strand.regrow = tassel.regrow;
        strand.missing = false;
      }
      nextFall = clock + range(falling.first);
      paint();
    },
  };
}

export function mountPicture(host) {
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const scene = document.createElement('section');
  scene.className = 'picture-scene';
  scene.setAttribute('aria-label', 'Picture 星空与流苏');
  scene.style.setProperty('--picture-black', palette.black);
  scene.style.setProperty('--picture-ink', palette.ink);
  scene.innerHTML = `
    <canvas class="picture-sky" aria-hidden="true"></canvas>
    <div class="picture-controls">
      <button type="button" class="picture-upload">添加照片</button>
      <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple hidden>
      <p class="picture-status" role="status"></p>
    </div>`;
  host.append(scene);
  const canvas = scene.querySelector('canvas');
  const upload = scene.querySelector('button');
  const input = scene.querySelector('input');
  const status = scene.querySelector('[role="status"]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const drawing = makeSky(canvas, canvas.getContext('2d'), motion);
  drawing.fit();
  if (motion.matches) drawing.settle();
  const observer = new ResizeObserver(drawing.fit);
  observer.observe(canvas);
  motion.addEventListener('change', () => {
    if (motion.matches) drawing.settle();
  }, { signal });

  // CDN 延迟或离线时使用同一套星形顶点的 Canvas 墨线路径。
  const sketch = document.createElement('script');
  sketch.src = config.display.roughUrl;
  sketch.addEventListener('load', () => {
    if (window.rough) drawing.setRough(window.rough.canvas(canvas));
  }, { signal });
  document.head.append(sketch);

  let library;
  upload.addEventListener('click', () => input.click(), { signal });
  input.addEventListener('change', async () => {
    const files = Array.from(input.files);
    input.value = '';
    if (!files.length) return;
    upload.disabled = true;
    let saved = 0;
    let failed = 0;
    try {
      library ??= await openPhotoLibrary();
      if (signal.aborted) {
        library.close();
        return;
      }
      for (const file of files) {
        try {
          const photo = await preparePhoto(file, signal);
          await library.add(photo);
          saved++;
        } catch {
          if (signal.aborted) return;
          failed++;
        }
      }
      if (!signal.aborted) {
        status.textContent = `已在本地保存 ${saved} 张${failed ? `，${failed} 张无法读取或保存` : ''}。出片将在后续阶段接入。`;
      }
    } catch {
      if (!signal.aborted) status.textContent = '无法打开本地照片库。';
    } finally {
      if (!signal.aborted) upload.disabled = false;
    }
  }, { signal });
  return {
    update: drawing.update,
    destroy() {
      lifetime.abort();
      observer.disconnect();
      sketch.remove();
      library?.close();
      scene.remove();
    },
  };
}
