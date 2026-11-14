import {
  picture, ROPE_NODES, ROPE_DAMPING, ROPE_STIFFNESS, STAR_MASS, SWAY_AMPLITUDE,
  WIND_NOISE_SPEED, WIND_BASE, WIND_GUST_STRENGTH, WIND_GUST_INTERVAL, WIND_GUST_ATTACK, WIND_GUST_RELEASE,
} from './config.js';

const settings = picture.rope;
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => t * t * (3 - 2 * t);

function hash(x, y) {
  const n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  const value = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((value ^ (value >>> 16)) >>> 0) / 2147483648 - 1;
}

function noise(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const u = ease(x - ix), v = ease(y - iy);
  return mix(mix(hash(ix, iy), hash(ix + 1, iy), u),
    mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), u), v);
}

export function makeWind(range, random) {
  let next = 0;
  let gusts = [];
  return (time, width) => {
    if (time >= next) {
      const attack = range(WIND_GUST_ATTACK);
      const release = range(WIND_GUST_RELEASE);
      gusts.push({ start: time, attack, release, force: range(WIND_GUST_STRENGTH) * (random() < .5 ? -1 : 1) });
      next = time + range(WIND_GUST_INTERVAL);
    }
    gusts = gusts.filter(gust => time < gust.start + gust.attack + gust.release + settings.lag[1]);
    return strand => {
      const x = strand.x / width * 7;
      const t = time - strand.lag;
      const phase = t * WIND_NOISE_SPEED + 12;
      const limit = Math.sin(SWAY_AMPLITUDE) * 1.26;
      let force = WIND_BASE * (noise(x, phase) * .72 + noise(x * 2.1 + 19, phase * .67) * .28);
      for (const gust of gusts) {
        const age = t - gust.start;
        if (age <= 0 || age >= gust.attack + gust.release) continue;
        const envelope = age < gust.attack ? ease(age / gust.attack) : 1 - ease((age - gust.attack) / gust.release);
        force += gust.force * envelope * noise(x * .65 + 8, gust.start * .17);
      }
      return Math.max(-limit, Math.min(limit, force)) * settings.gravity;
    };
  };
}

export function createRope(length, phase, random, reduced, wobble) {
  const count = Math.floor(mix(ROPE_NODES[0], ROPE_NODES[1] + 1, random()));
  const segment = length / (count - 1);
  const step = settings.step;
  const drag = Math.exp(-mix(...ROPE_DAMPING, random()) * step);
  const nodes = Array.from({ length: count }, (_, i) => {
    const f = i / (count - 1);
    const bend = f * f * length * Math.min(SWAY_AMPLITUDE, wobble);
    const x = reduced ? 0 : bend * Math.sin(phase - f * 1.3);
    const y = i * segment - x * x / Math.max(1, 2 * i * segment);
    return {
      x, y, px: x - (reduced ? 0 : Math.cos(phase - f * 1.3) * bend * step),
      py: y, fromX: x, fromY: y, mass: i === 0 ? 0 : i === count - 1 ? 1 / STAR_MASS : 1,
    };
  });
  const samples = Array.from({ length: (count - 1) * settings.curveSteps + 1 }, () => ({ x: 0, y: 0, distance: 0 }));
  return { nodes, segment, drag, samples, lag: mix(...settings.lag, random()) };
}

export function stepRope(rope, force) {
  const { nodes, segment, drag } = rope;
  const dt = settings.step;
  for (let i = 1; i < nodes.length; i++) {
    const node = nodes[i];
    const vx = (node.x - node.px) * drag;
    const vy = (node.y - node.py) * drag;
    node.fromX = node.px = node.x;
    node.fromY = node.py = node.y;
    node.x += vx + force * dt ** 2 * node.mass;
    node.y += vy + settings.gravity * dt ** 2;
  }
  for (let pass = 0; pass < settings.iterations; pass++) {
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1], b = nodes[i];
      const dx = b.x - a.x, dy = b.y - a.y;
      const length = Math.hypot(dx, dy);
      if (length < 1e-6) continue;
      const correction = (1 - segment / length) * ROPE_STIFFNESS / (a.mass + b.mass);
      a.x += dx * correction * a.mass;
      a.y += dy * correction * a.mass;
      b.x -= dx * correction * b.mass;
      b.y -= dy * correction * b.mass;
    }
  }
}

function spline(before, a, b, after, t) {
  return a + .5 * t * (b - before + t * (2 * before - 5 * a + 4 * b - after
    + t * (3 * a - 3 * b + after - before)));
}

export function sampleCurve(rope, alpha) {
  const { nodes, samples } = rope;
  const subdivisions = settings.curveSteps;
  let index = 1;
  for (let edge = 0; edge < nodes.length - 1; edge++) {
    const before = nodes[Math.max(0, edge - 1)], a = nodes[edge];
    const b = nodes[edge + 1], after = nodes[Math.min(nodes.length - 1, edge + 2)];
    const xs = [before, a, b, after].map(node => mix(node.fromX, node.x, alpha));
    const ys = [before, a, b, after].map(node => mix(node.fromY, node.y, alpha));
    for (let part = 1; part <= subdivisions; part++, index++) {
      const t = part / subdivisions;
      const point = samples[index], prev = samples[index - 1];
      point.x = spline(...xs, t);
      point.y = spline(...ys, t);
      point.distance = prev.distance + Math.hypot(point.x - prev.x, point.y - prev.y);
    }
  }
}
