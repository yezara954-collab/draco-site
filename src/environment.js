import { INTRO } from './motion-config.js';
import { Container, Graphics, Sprite, Texture } from 'pixi.js';

// 环境动效配置。时间单位是秒，距离是舞台像素，强度 0 为关闭、1 为完全显现。
const ENVIRONMENT = {
  corridor: {
    seconds: 16,         // 从第一道拱门扫到最后一道拱门的周期
    color: '#ffffff',    // 纯白色流光
    tailLength: 76,      // 拖尾沿拱门轮廓逐渐淡去的距离
    archGap: 12,         // 两道拱门之间换接的距离，空隙里不画光
  },
  mirror: {
    interval: 6.8,        // 两次扫光开始之间的间隔
    duration: 2.65,       // 一次扫光的时间
    delay: 1.15,          // 打开页面后多久开始第一次扫光
    angle: 24,            // 光带相对竖直方向的倾斜角度
    width: 112,           // 光带宽度
    color: '#e3fff2',     // 镜面柔光颜色
    strength: 0.31,       // 镜面柔光强度
    dracoColor: 0xe4fff0, // 人物受光的颜色
    dracoStrength: 0.062, // 人物最亮时的增亮幅度
    reflectionStrength: 0.065, // 两块白色光片的增亮幅度
    reflectionColor: 0xf1f0e4, // 白色光片的颜色
    reflectionBase: 0.9,  // 白色光片的静态不透明度
  },
  crane: {
    seconds: 4.8,         // 纸鹤上下往返一次的时间
    height: 22,           // 向上或向下的最大位移
    drift: 8,             // 同时向左或向右轻飘的最大位移
    tilt: 5,              // 向左右摆动的最大角度
  },
  stars: {
    minSeconds: 2.5,      // 最快的星星闪烁周期
    maxSeconds: 8.9,      // 最慢的星星闪烁周期
    darkLevel: 0.025,     // 暗下去时几乎看不见
    dotPeak: 0.94,       // 小星点的最高亮度
    crossPeak: 1,        // 十字星和菱形星的最高亮度
    peakSharpness: 2.8,  // 数值越大，星星停留在高亮的时间越短
    dotGrowth: 0.45,     // 点亮时星点半径最多增加的像素
    dotColor: '#a1b7a4',  // 小星点颜色
    crossColor: '#91a68a', // 十字星和菱形星颜色
    flashColor: '#e8fff3', // 闪烁时的浅青白色
  },
};

const TURN = 2 * Math.PI;

function svgElement(name, attributes) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function makeCorridorSweep() {
  const { seconds, color, tailLength, archGap } = ENVIRONMENT.corridor;
  const arches = document.querySelector('#cloister-arches');
  const sweep = svgElement('g', {
    id: 'corridor-sweep', fill: 'none', stroke: color,
    'stroke-width': arches.getAttribute('stroke-width'), visibility: 'hidden',
  });

  // Overlapping thin strokes make the trailing end fade back into the original line.
  const bands = [
    { fraction: 1, opacity: .12 },
    { fraction: .74, opacity: .17 },
    { fraction: .5, opacity: .28 },
    { fraction: .25, opacity: .98 },
  ];
  const outlines = bands.map(band => {
    const layer = svgElement('g', { opacity: band.opacity });
    sweep.append(layer);
    return layer;
  });
  arches.after(sweep);

  let routeLength = 0;
  const route = [...arches.children].map(arch => {
    const length = arch.getTotalLength();
    const start = routeLength;
    routeLength += length + archGap;
    const strokes = outlines.map(layer => {
      const stroke = svgElement('path', { d: arch.getAttribute('d'), visibility: 'hidden' });
      layer.append(stroke);
      return stroke;
    });
    return { start, length, strokes };
  });
  // Include the tail's exit so the next lap starts with only the original outlines.
  const travel = routeLength - archGap + tailLength;

  return {
    update(time) {
      const cursor = travel * (time % seconds) / seconds;
      for (const { start, length, strokes } of route) {
        const local = cursor - start;
        for (const [index, stroke] of strokes.entries()) {
          const from = Math.max(0, local - tailLength * bands[index].fraction);
          const to = Math.min(length, local);
          if (to <= from) {
            stroke.setAttribute('visibility', 'hidden');
          } else {
            stroke.setAttribute('stroke-dasharray', `0 ${from} ${to - from} ${length}`);
            stroke.removeAttribute('visibility');
          }
        }
      }
      if (sweep.hasAttribute('visibility')) sweep.removeAttribute('visibility');
    },
    reset() {
      sweep.setAttribute('visibility', 'hidden');
    },
  };
}

function makeMirrorMask(glass) {
  const { width, height } = glass.texture.orig;
  const left = [];
  const right = [];
  const step = Math.max(1, Math.floor(3 / glass.scale.y));
  const contains = glass.hitArea.contains;
  // Fit a stencil just inside the painted glass so its antialiased edge stays untouched.
  for (let y = step; y < height - step; y += step) {
    let first = 0;
    let last = width - 1;
    while (first < width && !contains(first, y - step, 220)) first++;
    while (last > first && !contains(last, y - step, 220)) last--;
    const x1 = glass.x + first * glass.scale.x + 1.5;
    const x2 = glass.x + last * glass.scale.x - 1.5;
    if (x2 <= x1) continue;
    const stageY = glass.y + y * glass.scale.y;
    left.push({ x: x1, y: stageY });
    right.push({ x: x2, y: stageY });
  }
  return new Graphics({ label: 'mirror-sweep-stencil', eventMode: 'none' })
    .poly(left.concat(right.reverse())).fill(0xffffff);
}

export function makeMirrorLighting(glass, draco) {
  const { angle, width, color, dracoColor } = ENVIRONMENT.mirror;
  const stencil = makeMirrorMask(glass);
  const sweep = new Container({ label: 'mirror-sweep', eventMode: 'none', visible: false });
  sweep.mask = stencil;

  const strip = document.createElement('canvas');
  strip.width = 128;
  strip.height = 2;
  const context = strip.getContext('2d');
  const gradient = context.createLinearGradient(0, 0, strip.width, 0);
  for (const [offset, alpha] of [[0, 0], [.16, .09], [.36, .45], [.52, 1], [.66, .58], [.83, .15], [1, 0]]) {
    const hexAlpha = Math.round(255 * alpha).toString(16).padStart(2, '0');
    gradient.addColorStop(offset, color + hexAlpha);
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, strip.width, strip.height);

  const beam = new Sprite({ label: 'mirror-sweep-beam', texture: Texture.from(strip), anchor: 0.5 });
  beam.width = width;
  beam.height = (glass.height + width) / Math.cos(angle * Math.PI / 180);
  beam.angle = angle;
  beam.y = glass.y + glass.height / 2;
  sweep.addChild(beam);

  const bounce = new Sprite({
    label: 'draco-mirror-light', texture: draco.texture, tint: dracoColor,
    x: draco.x, y: draco.y, width: draco.width, height: draco.height,
    blendMode: 'add', visible: false, eventMode: 'none',
  });

  return { stencil, sweep, beam, bounce };
}

export function makeReflection(label, points) {
  const { reflectionColor, reflectionBase } = ENVIRONMENT.mirror;
  const layer = new Graphics({ label, alpha: reflectionBase, eventMode: 'none' });
  return layer.poly(points).fill(reflectionColor);
}

export function makeCraneRig(sprite, [left, top, width, height]) {
  const x = left + width / 2;
  const y = top + height / 2;
  const rig = new Container({ label: 'paper-crane-motion', x, y });
  rig.pivot.set(x, y);
  rig.addChild(sprite);
  return rig;
}

function makeTwinkles() {
  const { minSeconds, maxSeconds, dotPeak, crossPeak, dotColor, crossColor } = ENVIRONMENT.stars;
  const dots = document.querySelector('#night-stars');
  const crosses = document.querySelector('#cross-stars');
  dots.setAttribute('fill', dotColor);
  crosses.setAttribute('stroke', crossColor);
  return [...dots.children, ...crosses.children].map((element, index) => ({
    element,
    radius: Number(element.getAttribute('r')),
    colorProperty: element.parentNode === dots ? 'fill' : 'stroke',
    peak: element.parentNode === dots ? dotPeak : crossPeak,
    period: minSeconds + (maxSeconds - minSeconds) * ((index * 0.61803399) % 1),
    phase: TURN * ((index * 0.41421356) % 1),
  }));
}

export function startEnvironment(app, { glass, lighting, reflections, crane, wind, intro, interactions, ferret }) {
  const corridor = makeCorridorSweep();
  const stars = makeTwinkles();
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const mirror = ENVIRONMENT.mirror;
  const { sweep, beam, bounce } = lighting;
  const craneRestX = crane.x;
  const craneRestY = crane.y;
  const beamReach = mirror.width / 2 / Math.cos(beam.rotation)
    + Math.abs(Math.tan(beam.rotation)) * glass.height / 2 + 2;
  let request = null;
  let previousFrame = null;
  let elapsed = 0;
  let previousStarUpdate = -Infinity;
  let introSkipped = motionPreference.matches;

  function updateMirror(time, enabled = true) {
    const phase = time < mirror.delay ? -1 : (time - mirror.delay) % mirror.interval;
    const scanning = enabled && phase >= 0 && phase < mirror.duration;
    sweep.visible = scanning;
    bounce.visible = scanning;
    let illumination = 0;
    if (scanning) {
      const progress = phase / mirror.duration;
      beam.x = glass.x - beamReach + progress * (glass.width + 2 * beamReach);
      beam.alpha = mirror.strength;
      illumination = Math.sin(Math.PI * progress) ** 3;
    }
    bounce.alpha = mirror.dracoStrength * illumination;
    for (const reflection of reflections) {
      reflection.alpha = mirror.reflectionBase + mirror.reflectionStrength * illumination;
    }
  }

  function draw(now) {
    const dt = previousFrame === null ? 0 : (now - previousFrame) / 1000;
    previousFrame = now;
    interactions.update(dt);
    request = requestAnimationFrame(draw);
    const ferretMoved = ferret.update(dt);
    if (motionPreference.matches) {
      if (ferretMoved) app.render();
      return;
    }

    elapsed += dt;
    const opening = !introSkipped && elapsed < INTRO.duration;
    if (opening) corridor.reset();
    else corridor.update(introSkipped ? elapsed : elapsed - INTRO.duration);
    intro.update(elapsed);
    updateMirror(elapsed);
    const cranePhase = TURN * elapsed / ENVIRONMENT.crane.seconds;
    crane.x = craneRestX + ENVIRONMENT.crane.drift * Math.sin(cranePhase / 2);
    crane.y = craneRestY + ENVIRONMENT.crane.height * Math.sin(cranePhase);
    crane.angle = ENVIRONMENT.crane.tilt * Math.sin(cranePhase - Math.PI / 4);
    wind.update(elapsed, opening ? elapsed : null);

    if (elapsed - previousStarUpdate >= 1 / 30) {
      const { darkLevel, peakSharpness, dotGrowth, flashColor } = ENVIRONMENT.stars;
      for (const { element, radius, colorProperty, peak, period, phase } of stars) {
        const beat = TURN * elapsed / period + phase;
        const shimmer = Math.sin(beat + .62 * Math.sin(beat * .37 + phase));
        const twinkle = ((1 + shimmer) / 2) ** peakSharpness;
        element.style.opacity = (darkLevel + (peak - darkLevel) * twinkle).toFixed(3);
        if (twinkle > .5) element.style.setProperty(colorProperty, flashColor);
        else element.style.removeProperty(colorProperty);
        if (radius) element.style.setProperty('r', `${(radius + dotGrowth * twinkle).toFixed(2)}px`);
      }
      previousStarUpdate = elapsed;
    }

    app.render();
  }

  function syncMotion() {
    interactions.setReduced(motionPreference.matches);
    ferret.setReduced(motionPreference.matches);
    if (motionPreference.matches || document.hidden) {
      if (request !== null) cancelAnimationFrame(request);
      request = null;
      previousFrame = null;
      if (document.hidden) interactions.hidePointer();
      if (motionPreference.matches) {
        introSkipped = true;
        intro.finish();
        corridor.reset();
        updateMirror(0, false);
        crane.x = craneRestX;
        crane.y = craneRestY;
        crane.angle = 0;
        wind.reset();
        for (const { element, colorProperty } of stars) {
          element.style.removeProperty('opacity');
          element.style.removeProperty(colorProperty);
          element.style.removeProperty('r');
        }
        previousStarUpdate = -Infinity;
        elapsed = 0;
        app.render();
      }
    }
    if (!document.hidden && request === null) {
      request = requestAnimationFrame(draw);
    }
  }

  motionPreference.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  if (!motionPreference.matches && !document.hidden) draw(performance.now());
  else {
    if (!motionPreference.matches) intro.update(0);
    syncMotion();
  }
}
