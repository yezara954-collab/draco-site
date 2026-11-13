import { WAND } from './motion-config.js';

const WIDTH = 1600;
const HEIGHT = 1000;
const TURN = Math.PI * 2;
const clamp = value => Math.max(0, Math.min(1, value));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = value => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};

function curve([a, b, c, d], t) {
  const s = 1 - t;
  return [
    s ** 3 * a[0] + 3 * s * s * t * b[0] + 3 * s * t * t * c[0] + t ** 3 * d[0],
    s ** 3 * a[1] + 3 * s * s * t * b[1] + 3 * s * t * t * c[1] + t ** 3 * d[1],
  ];
}

function sample(path) {
  return Array.from({ length: 97 }, (_, i) => curve(path, i / 96));
}

function at(points, progress) {
  const index = clamp(progress) * (points.length - 1);
  const a = points[Math.floor(index)];
  const b = points[Math.ceil(index)];
  return [mix(a[0], b[0], index % 1), mix(a[1], b[1], index % 1)];
}

function ribbon(ctx, points, from, to, width, opacity, color, glow = 0) {
  if (opacity <= 0 || to <= from) return;
  ctx.save();
  ctx.globalAlpha = clamp(opacity);
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = glow;
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(...at(points, from));
  for (let i = 1; i <= 32; i++) ctx.lineTo(...at(points, mix(from, to, i / 32)));
  ctx.stroke();
  ctx.restore();
}

function halo(ctx, x, y, radius, opacity, color) {
  if (opacity <= 0) return;
  const fill = ctx.createRadialGradient(x, y, 0, x, y, radius);
  fill.addColorStop(0, color);
  fill.addColorStop(.25, color + 'aa');
  fill.addColorStop(.63, color + '25');
  fill.addColorStop(1, color + '00');
  ctx.globalAlpha = clamp(opacity);
  ctx.fillStyle = fill;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
}

function dot(ctx, x, y, size, alpha, color, star) {
  if (alpha <= 0 || size <= 0) return;
  ctx.globalAlpha = clamp(alpha);
  ctx.fillStyle = color;
  if (star) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const radius = size * (i % 2 ? .23 : 1);
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius * 1.45;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(x, y, size, 0, TURN);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

export function createWand(stage, crane, craneGlow, route, debug, showPose) {
  const canvas = document.createElement('canvas');
  canvas.className = 'wand-effects';
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.setAttribute('aria-hidden', 'true');
  stage.append(canvas);
  const ctx = canvas.getContext('2d');
  const [white, gold, mint] = WAND.colors;
  const [a, b, c, d] = WAND.crescent;
  const arc = [
    ...sample([WAND.idleTip, a, b, WAND.midTip]),
    ...sample([WAND.midTip, c, d, WAND.castTip]).slice(1),
  ];
  const arcColor = ctx.createLinearGradient(...WAND.idleTip, ...WAND.castTip);
  arcColor.addColorStop(0, gold);
  arcColor.addColorStop(.44, white);
  arcColor.addColorStop(1, mint);
  const particles = Array.from({ length: Math.min(120, WAND.particleLimit) }, (_, i) => ({
    t: Math.random(), offset: Math.random() * 2 - 1, angle: Math.random() * TURN,
    size: .5 + Math.random() ** 2 * 2.1, star: i % 7 === 0, color: WAND.colors[i % 3],
    x: -60 + Math.random() * (WIDTH + 100), y: -60 + Math.random() * (HEIGHT + 100),
  }));
  const swingStart = WAND.chargeTime;
  const midTime = swingStart + WAND.swingTime * WAND.midAt;
  const linkStart = swingStart + WAND.swingTime;
  const flightStart = linkStart + WAND.linkTime;
  const curtainStart = flightStart + WAND.flightTime - WAND.curtainLead;
  const end = curtainStart + WAND.curtainTime;
  const defaultFlight = sample([WAND.crane, ...WAND.flight]);
  let age = null;
  let reduced = false;
  let departure = null;
  let mirrorLight = 0;
  let gust = 0;
  let fadeOnly = false;
  let link = sample([WAND.castTip, ...WAND.link, WAND.crane]);
  let flight = defaultFlight;

  function drawDebug() {
    if (!debug) return;
    ribbon(ctx, defaultFlight, 0, 1, 2, .9, mint);
    ribbon(ctx, link, 0, 1, 1, .6, gold);
    ribbon(ctx, arc, 0, 1, 1, .45, white);
    for (const [[x, y], label, color] of [
      [WAND.idleTip, '① 待机杖尖', gold], [WAND.midTip, '② 中间杖尖', white],
      [WAND.castTip, '③ 完成杖尖', mint], [WAND.crane, '纸鹤原位 / 魔法落点', mint],
      [at(defaultFlight, .79), '飞往左上画外', mint],
    ]) {
      dot(ctx, x, y, 5, 1, color, true);
      ctx.font = '18px system-ui';
      ctx.fillStyle = color;
      ctx.fillText(label, x + 10, y - 8);
    }
  }

  function crescent(progress, opacity) {
    if (opacity <= 0) return;
    for (const [width, alpha, blur] of [[WAND.arcWidth, .4, 16], [WAND.arcWidth / 2, .9, 3]]) {
      ctx.save();
      ctx.globalAlpha = clamp(alpha * opacity);
      ctx.fillStyle = arcColor;
      ctx.shadowColor = gold;
      ctx.shadowBlur = blur;
      ctx.beginPath();
      for (const side of [1, -1]) {
        for (let i = 0; i <= 48; i++) {
          const t = progress * (side === 1 ? i : 48 - i) / 48;
          const [x, y] = at(arc, t);
          const [ax, ay] = at(arc, t - .015);
          const [bx, by] = at(arc, t + .015);
          const length = Math.hypot(bx - ax, by - ay) || 1;
          const weight = side * width / 2 * Math.sin(t * Math.PI) ** .74
            * smooth((progress - t) / .09);
          const px = x - (by - ay) / length * weight;
          const py = y + (bx - ax) / length * weight;
          if (i === 0 && side === 1) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function paintLink(progress, opacity) {
    if (opacity <= 0 || progress <= 0) return;
    ribbon(ctx, link, 0, progress, 9, opacity * .15, mint, 15);
    ribbon(ctx, link, 0, progress, 1.5, opacity * .68, gold, 5);
    for (const p of particles) {
      const t = (p.t + age * .48) % 1 * progress;
      const [x, y] = at(link, t);
      dot(ctx, x, y + p.offset * 13 * Math.sin(t * Math.PI), p.size,
        opacity * (.25 + .65 * t), p.color, p.star);
    }
    const [x, y] = at(link, progress);
    halo(ctx, x, y, 26, opacity * .47, white);
  }

  function fly(raw) {
    if (!departure) {
      departure = { x: crane.x, y: crane.y, angle: crane.angle };
      flight = sample([[crane.x, crane.y], ...WAND.flight]);
    }
    const progress = clamp(raw) ** 1.65;
    const from = clamp(raw - WAND.trailLength) ** 1.65;
    // 位置连续取值，纸鹤放大观察时也不会沿着取样点跳动。
    const [x, y] = curve([[departure.x, departure.y], ...WAND.flight], progress);
    crane.position.set(x, y);
    crane.angle = departure.angle + 19 * smooth(raw / .27) - 9 * smooth((raw - .42) / .58);
    const size = mix(1, WAND.minCraneScale, smooth(raw));
    const turn = Math.cos(Math.PI * smooth(raw / .26));
    crane.scale.set(size * turn, size);
    crane.alpha = 1 - smooth((raw - .86) / .14);
    craneGlow.alpha = .54 * (1 - smooth(raw / .55));
    halo(ctx, x, y, 100 * size, craneGlow.alpha * .42, mint);
    const opacity = 1 - smooth((raw - .86) / .26);
    for (let i = 0; i < 6; i++) {
      const start = mix(from, progress, i / 6);
      const finish = mix(from, progress, (i + 1.08) / 6);
      ribbon(ctx, flight, start, Math.min(progress, finish), 2 + i * .5, opacity * (.08 + i * .09),
        i % 2 ? gold : mint, 9);
    }
    for (const p of particles) {
      const t = mix(from, progress, p.t);
      const [px, py] = at(flight, t);
      const spread = (1 - p.t) * 23 + 2;
      dot(ctx, px + Math.cos(p.angle) * spread, py + Math.sin(p.angle) * spread, p.size,
        opacity * p.t ** .7, p.color, p.star);
    }
  }

  function curtain(t) {
    const spread = smooth(t / .68);
    const darkness = smooth((t - .50) / .50);
    halo(ctx, 0, 0, 200 + 3900 * spread, .88 * smooth(t / .23), mint);
    for (const p of particles) {
      const distance = Math.hypot(p.x, p.y) / 1900;
      const pass = (spread - distance) * 5;
      const opacity = Math.sin(Math.PI * clamp(pass)) * (1 - darkness);
      dot(ctx, p.x + 20 * spread, p.y + 14 * spread, p.size * 1.4, opacity, p.color, p.star);
    }
    blackout(darkness);
  }

  function blackout(opacity) {
    ctx.fillStyle = '#000';
    ctx.globalAlpha = opacity;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = 1;
  }

  drawDebug();
  return {
    get active() { return age !== null; },
    get inNext() { return route.inNext; },
    get freezesCrane() { return departure !== null; },
    get mirrorLight() { return mirrorLight; },
    get gust() { return gust; },
    start() {
      if (age !== null || route.inNext) return;
      age = 0;
      fadeOnly = reduced;
    },
    setReduced(value) {
      if (value && !fadeOnly && age !== null && !route.inNext) {
        age = 0;
        mirrorLight = 0;
        gust = 0;
        craneGlow.alpha = 0;
        departure = null;
        fadeOnly = true;
        showPose(0);
      }
      reduced = value;
    },
    update(dt) {
      route.update(dt);
      if (age === null || route.inNext) return;
      age += dt;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      if (fadeOnly) {
        blackout(smooth(age / WAND.reducedFade));
        if (age >= WAND.reducedFade) route.enter();
        return;
      }
      const charge = clamp(age / swingStart);
      const swing = clamp((age - swingStart) / WAND.swingTime);
      const connection = clamp((age - linkStart) / WAND.linkTime);
      const rawFlight = (age - flightStart) / WAND.flightTime;
      mirrorLight = WAND.mirrorLight * smooth(charge) * (1 - smooth(swing * 1.6));
      const midAge = age - midTime;
      const pose = age >= linkStart ? 2 : age >= midTime ? 1 : 0;
      const poseAge = pose === 2 ? age - linkStart : midAge;
      const blend = pose ? smooth(poseAge / WAND.poseFade) : 1;
      const ghost = poseAge < WAND.poseFade
        ? mix(1, WAND.ghostOpacity, blend)
        : WAND.ghostOpacity * (1 - smooth((poseAge - WAND.poseFade) / (WAND.ghostTime - WAND.poseFade)));
      showPose(pose, pose ? ghost : 0, blend, age >= swingStart);
      gust = WAND.gustStrength * smooth(1 + midAge / WAND.gustRise)
        * (1 - smooth(midAge / WAND.gustFall));

      // At exactly midTime the arc head is at the shared Bézier knot.
      const progress = age < midTime
        ? .5 * smooth(swing) / smooth(WAND.midAt)
        : .5 + .5 * (smooth(swing) - smooth(WAND.midAt)) / (1 - smooth(WAND.midAt));
      const tip = at(arc, progress);
      const tipLight = age < swingStart ? smooth(charge)
        : 1 - smooth((age - linkStart) / WAND.tipAfterglow);
      halo(ctx, ...tip, 32 + 12 * swing, tipLight * .78, swing < WAND.midAt ? gold : mint);
      dot(ctx, ...tip, 5, tipLight, white, true);
      if (swing > 0) {
        const arcLight = 1 - smooth((age - linkStart) / WAND.linkTime);
        crescent(progress, arcLight);
      }
      if (!departure && connection > 0) link = sample([WAND.castTip, ...WAND.link, [crane.x, crane.y]]);
      paintLink(smooth(connection), 1 - smooth((age - flightStart) / WAND.linkFade));
      if (rawFlight >= 0) fly(rawFlight);
      drawDebug();
      if (age >= curtainStart) curtain(clamp((age - curtainStart) / WAND.curtainTime));
      if (age >= end) route.enter();
    },
  };
}
