import {
  picture, TASSEL_COUNT, TASSEL_LENGTH_MIN, TASSEL_LENGTH_MAX, CHROMATIC_OFFSET,
  WIND_BASE, WIND_GUST_STRENGTH, WIND_GUST_INTERVAL, SWAY_AMPLITUDE,
  DROP_INTERVAL_MIN, DROP_INTERVAL_MAX, DROP_COUNT_MIN, DROP_COUNT_MAX, DROP_FALL_TIME, SPARK_COUNT,
} from './config.js';

const { palette, display, sky, tassel, wind, falling, ground } = picture;
const tau = 2 * Math.PI;
const clamp = x => Math.max(0, Math.min(1, x));
const mix = (a, b, t) => a + (b - a) * t;
const wave = x => .5 + .5 * Math.sin(x);

function makeRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function sprite(size, paint) {
  const image = document.createElement('canvas');
  image.width = image.height = size;
  const ctx = image.getContext('2d');
  ctx.translate(size / 2, size / 2);
  paint(ctx);
  return image;
}

function glow(ctx, color, radius, alpha) {
  const fill = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  fill.addColorStop(0, color);
  fill.addColorStop(.29, color + '81');
  fill.addColorStop(1, color + '00');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
}

function shape(ctx, arms, outer, inner, seed) {
  ctx.beginPath();
  for (let i = 0; i < arms * 2; i++) {
    const a = i * Math.PI / arms - Math.PI / 2;
    const radius = (i % 2 ? inner : outer) * (1 + Math.sin(i * 3 + seed) * .11);
    ctx.lineTo(Math.cos(a) * radius, Math.sin(a) * radius * (arms === 4 ? 1.14 : 1));
  }
  ctx.closePath();
  ctx.fill();
}

function makeSprites() {
  const star = (arms, warm, seed) => sprite(100, ctx => {
    glow(ctx, warm ? palette.goldGlow : palette.coldGlow, 42, .52);
    ctx.fillStyle = warm ? palette.goldCore : palette.white;
    shape(ctx, arms, 20, arms === 4 ? 5 : 9, seed);
    ctx.globalAlpha = .39;
    ctx.fillStyle = palette.white;
    shape(ctx, 4, 26, 1.2, seed + 2);
  });
  const pearl = (core, haze) => sprite(32, ctx => {
    glow(ctx, haze, 15, .39);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(0, 0, 3.8, 0, tau);
    ctx.fill();
  });
  const white = pearl(palette.white, palette.coldGlow);
  const gold = pearl(palette.goldCore, palette.goldGlow);
  const fringe = palette.fringes.map(color => pearl(color, color));
  const accents = [1, .75].map(scale => [white, gold].map(core => sprite(64, ctx => {
    ctx.globalCompositeOperation = 'lighter';
    const shift = CHROMATIC_OFFSET * scale * 4;
    if (shift > 0) {
      for (const [i, [x, y, alpha]] of [[-1, .12, .66], [.1, -.56, .56], [1, .21, .69]].entries()) {
        ctx.globalAlpha = alpha;
        ctx.drawImage(fringe[i], x * shift - 17, y * shift - 17, 34, 34);
      }
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(core, -17.4, -17.4, 34.8, 34.8);
  })));
  return {
    stars: [false, true].map(warm => [star(4, warm, 1), star(5, warm, 4)]),
    white, gold, accents,
  };
}

export function makeSky(canvas, motion, onImpact) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const sprites = makeSprites();
  const rng = makeRandom(display.seed);
  const range = ([a, b], random = rng) => mix(a, b, random());
  const integer = (a, b, random = rng) => Math.floor(mix(a, b + 1, random()));
  const field = Array.from({ length: sky.count + sky.dust }, (_, i) => ({
    x: rng(), y: rng(), phase: rng() * tau, period: range(sky.period),
    size: range(i < sky.count ? [1.7, 4.6] : [1.4, 3.4]), dust: i >= sky.count,
  }));
  let width = 1, height = 1, mobile = false;
  let clock = 0, strands = [], gusts = [], drops = [], sparks = [], ripples = [];
  let nextDrop = range([DROP_INTERVAL_MIN, DROP_INTERVAL_MAX]);
  let nextGust = 0;
  let horizon;

  function fit() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const ratio = Math.min(devicePixelRatio || 1, display.maxDpr);
    const pixelWidth = Math.round(w * ratio);
    const pixelHeight = Math.round(h * ratio);
    if (width === w && height === h && canvas.width === pixelWidth && canvas.height === pixelHeight && strands.length) return;
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
    ctx.setTransform(pixelWidth / w, 0, 0, pixelHeight / h, 0, 0);
    width = w;
    height = h;
    mobile = w <= display.mobileWidth;
    const count = mobile ? TASSEL_COUNT.mobile : TASSEL_COUNT.desktop;
    const layout = makeRandom(display.seed + 581);
    let x = 0;
    strands = Array.from({ length: count }, (_, i) => {
      x += range([.20, 1.6], layout) * (1 + .52 * Math.sin(i * .47 + 1));
      const length = range([TASSEL_LENGTH_MIN, TASSEL_LENGTH_MAX], layout) * h;
      const beads = [];
      let accentAt = integer(...tassel.accentEvery, layout);
      for (let y = range([1, 4], layout); y < length; y += range(tassel.spacing, layout)) {
        const isAccent = beads.length === accentAt;
        beads.push({ f: y / length, phase: layout() * tau, accent: isAccent, warm: layout() < .12, speed: range([1.5, 5], layout) });
        if (isAccent) accentAt += integer(...tassel.accentEvery, layout);
      }
      const phase = layout() * tau;
      const wobble = range([.025, .082], layout);
      return {
        x, length, beads, phase, wobble, radius: range(tassel.starRadius, layout) * (mobile ? .76 : 1),
        glintAt: i % tassel.glintEvery === 0 ? range([.32, .81], layout) : 0,
        warm: Boolean(i % 2) !== (layout() < .085), arms: integer(0, 1, layout),
        angle: motion.matches ? 0 : Math.sin(phase) * wobble,
        speed: Math.cos(phase) * wobble * Math.sqrt(wind.gravity / length),
        damping: range(wind.damping, layout), lag: range(wind.lag, layout), next: 0, regrow: -Infinity,
      };
    });
    const span = strands.at(-1).x - strands[0].x || 1;
    const first = strands[0].x;
    for (const strand of strands) strand.x = mix(.014, .986, (strand.x - first) / span) * w;
    horizon = new Path2D();
    const left = w * ground.span[0], gap = w * (ground.span[1] - ground.span[0]) / ground.segments;
    const y = h * ground.y;
    for (let i = 0; i < ground.segments; i++) {
      const x = left + i * gap;
      horizon.moveTo(x, y + Math.sin(i * 2) * ground.waviness * .5);
      horizon.bezierCurveTo(x + gap * .19, y - ground.waviness, x + gap * .52,
        y + ground.waviness * Math.cos(i * 1.8), x + gap * (.82 + .11 * Math.sin(i * 4)), y);
    }
    clearFalls();
    paint();
  }

  function clearFalls() {
    drops = [];
    sparks = [];
    ripples = [];
    nextDrop = clock + range([DROP_INTERVAL_MIN, DROP_INTERVAL_MAX]);
    for (const strand of strands) {
      strand.regrow = -Infinity;
      strand.next = 0;
    }
  }

  function stamp(image, x, y, diameter, opacity) {
    ctx.globalAlpha = Math.min(1, opacity);
    ctx.drawImage(image, x - diameter / 2, y - diameter / 2, diameter, diameter);
  }

  function star(strand, x, y, fraction, alpha) {
    const pulse = wave(clock * 1.8 + strand.phase);
    stamp(sprites.stars[Number(strand.warm)][strand.arms], x, y,
      strand.radius * tassel.glow * 2 * fraction * mix(.90, 1.05, pulse), alpha * mix(.72, 1, pulse));
  }

  function paint() {
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.black;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = ground.alpha;
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = ground.lineWidth;
    ctx.stroke(horizon);
    ctx.globalCompositeOperation = 'lighter';

    let backgroundCount = 0, dustCount = 0;
    const factor = mobile ? display.mobileFactor : 1;
    for (let i = 0; i < field.length; i++) {
      const point = field[i];
      if (point.dust ? dustCount++ >= sky.dust * factor : backgroundCount++ >= sky.count * factor) continue;
      const t = clock * tau / point.period + point.phase;
      const pulse = wave(t);
      const x = point.x * width + (point.dust ? Math.sin(t * .43) * 11 : 0);
      const y = point.y * height + (point.dust ? Math.cos(t * .36) * 8 : 0);
      if (i < sky.flares * factor && pulse > .76) stamp(sprites.stars[0][0], x, y, 15, (pulse - .76) * 1.5);
      stamp(sprites.white, x, y, point.size, mix(.13, point.dust ? .43 : .70, pulse));
    }

    for (const strand of strands) {
      const dx = Math.sin(strand.angle) * strand.length;
      const dy = Math.cos(strand.angle) * strand.length;
      const shimmer = clock + strand.phase;
      for (const bead of strand.beads) {
        const f = bead.f;
        const x = strand.x + dx * (f + .10 * f * (1 - f));
        const y = dy * f;
        const pulse = wave(shimmer * bead.speed + bead.phase);
        const opacity = mix(...(bead.accent ? tassel.accentOpacity : tassel.pearlOpacity), pulse);
        const image = bead.accent ? sprites.accents[Number(mobile)][Number(bead.warm)]
          : bead.warm ? sprites.gold : sprites.white;
        stamp(image, x, y, bead.accent ? 16 : 3.8, opacity);
      }
      if (strand.glintAt) {
        const f = strand.glintAt;
        const pulse = wave(clock * 1.3 + strand.phase);
        star(strand, strand.x + dx * (f + .10 * f * (1 - f)), dy * f, .40, pulse * .57);
      }
      const growth = clamp((clock - strand.regrow) / tassel.regrowFade);
      if (growth > 0) star(strand, strand.x + dx, dy + strand.radius * .44, mix(.62, 1, growth), growth);
    }

    for (const drop of drops) {
      if (!drop.started) continue;
      const age = clock - drop.start;
      const count = mobile ? Math.ceil(falling.tailCount * factor) : falling.tailCount;
      for (let i = count; i >= 1; i--) {
        const f = i / count;
        const t = age - falling.tailDuration * f;
        if (t < 0) continue;
        stamp(i % 5 ? sprites.white : sprites.gold, drop.x + drop.vx * t + Math.sin(i * 2.2) * f * 2.8,
          fallY(drop, t), mix(6.4, 1.8, f), (1 - f) ** 1.4 * .91);
      }
      star(drop.strand, drop.x + drop.vx * age, fallY(drop, age), 1, .98);
    }

    for (const ring of ripples) {
      const f = (clock - ring.time) / falling.rippleLife;
      ctx.globalAlpha = (1 - f) ** 2 * .30;
      ctx.strokeStyle = ring.warm ? palette.goldCore : palette.coldGlow;
      ctx.lineWidth = .85;
      ctx.beginPath();
      ctx.ellipse(ring.x, height * ground.y, 2 + f * 43, 1 + f * 7, 0, 0, tau);
      ctx.stroke();
    }
    for (const spark of sparks) {
      const t = clock - spark.time;
      const f = 1 - t / spark.life;
      const y = height * ground.y - spark.lift * t + 180 * t * t;
      if (y <= height * ground.y + 1) stamp(spark.image, spark.x + spark.vx * t, y,
        spark.size * (.55 + .45 * f), f * f);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function fallY(drop, age) {
    return drop.y + (height * ground.y - drop.y) * (age / drop.duration) ** 2;
  }

  function releaseGroup() {
    const candidates = strands.filter(strand => !strand.next && clock >= strand.regrow + tassel.regrowFade);
    const count = Math.min(integer(DROP_COUNT_MIN, DROP_COUNT_MAX), candidates.length);
    for (let i = 0; i < count; i++) {
      const [strand] = candidates.splice(integer(0, candidates.length - 1), 1);
      const start = clock + (i > 0 ? rng() * falling.stagger : 0);
      strand.next = start;
      drops.push({ strand, start, duration: range(DROP_FALL_TIME), started: false });
    }
    nextDrop = clock + range([DROP_INTERVAL_MIN, DROP_INTERVAL_MAX]);
  }

  function impact(drop) {
    const x = drop.x + drop.vx * drop.duration;
    const count = integer(...SPARK_COUNT);
    for (let i = 0; i < (mobile ? Math.ceil(count * display.mobileFactor) : count); i++) {
      sparks.push({ x, time: clock, vx: range([-136, 136]), lift: range([48, 144]),
        life: range(falling.sparkLife), size: range([3, 9]),
        image: i % 5 === 0 ? sprites.stars[i % 2][0] : i % 3 === 0 ? sprites.gold : sprites.white });
    }
    ripples.push({ x, time: clock, warm: drop.strand.warm });
    drop.strand.next = 0;
    drop.strand.regrow = clock + range(tassel.regrowDelay);
    onImpact();
  }

  function update(dt) {
    if (motion.matches || document.hidden) return;
    dt = Math.min(dt, display.maxStep);
    clock += dt;
    if (clock >= nextGust) {
      gusts.push({ start: clock, duration: range(wind.gustLife), strength: range(WIND_GUST_STRENGTH) * (rng() < .5 ? -1 : 1) });
      nextGust = clock + range(WIND_GUST_INTERVAL);
    }
    gusts = gusts.filter(gust => clock < gust.start + gust.duration + wind.lag[1]);
    for (const strand of strands) {
      const local = clock - strand.lag;
      let force = WIND_BASE * wind.frequencies.reduce((sum, f, i) =>
        sum + Math.sin(local * f + strand.phase * (i + 1)) / (i + 1), 0);
      for (const gust of gusts) {
        const p = (local - gust.start) / gust.duration;
        if (p > 0 && p < 1) force += Math.sin(p * Math.PI) ** 2 * gust.strength;
      }
      const damping = strand.damping;
      const individual = .32 * Math.sin(local * (.75 + 2.7 / Math.sqrt(strand.length)) + strand.phase);
      strand.speed += (force + individual - damping * strand.speed - wind.gravity / strand.length * Math.sin(strand.angle)) * dt;
      strand.angle += strand.speed * dt;
      if (Math.abs(strand.angle) > SWAY_AMPLITUDE) {
        strand.angle = Math.sign(strand.angle) * SWAY_AMPLITUDE;
        strand.speed *= -.22;
      }
    }
    if (clock >= nextDrop) releaseGroup();
    drops = drops.filter(drop => {
      if (clock < drop.start) return true;
      const strand = drop.strand;
      if (!drop.started) {
        drop.x = strand.x + Math.sin(strand.angle) * strand.length;
        drop.y = Math.cos(strand.angle) * strand.length + strand.radius * .44;
        drop.vx = Math.max(-48, Math.min(48, strand.speed * strand.length * .32));
        drop.started = true;
        strand.regrow = Infinity;
      }
      if (clock - drop.start < drop.duration) return true;
      impact(drop);
      return false;
    });
    sparks = sparks.filter(spark => clock - spark.time < spark.life);
    ripples = ripples.filter(ring => clock - ring.time < falling.rippleLife);
    paint();
  }

  return {
    fit, update,
    settle() {
      clearFalls();
      for (const strand of strands) strand.angle = strand.speed = 0;
      paint();
    },
  };
}
