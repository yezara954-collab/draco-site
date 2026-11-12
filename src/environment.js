import { Container, Graphics, Sprite, Texture } from 'pixi.js';

// 环境动效配置。时间单位是秒，距离是舞台像素，强度 0 为关闭、1 为完全显现。
const ENVIRONMENT = {
  corridor: {
    seconds: 8,            // 每次从左到右扫过的时间
    color: '#c8f4de',     // 回廊被点亮时的浅青绿色
    strength: 0.64,       // 光带最亮处的强度
    width: 480,           // 光带宽度，越大，经过后暗下来的时间越长
    lineWidth: 1.5,       // 流光描边粗细
    glowWidth: 5,         // 描边外侧柔光的宽度
    glowStrength: 0.21,   // 描边外侧柔光的强度
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
    seconds: 5,           // 纸鹤上下往返一次的时间
    height: 6,            // 向上或向下的最大位移
    tilt: 1.45,           // 向左右摆动的最大角度
  },
  stars: {
    minSeconds: 3.9,      // 最快的星星闪烁周期
    maxSeconds: 9.8,      // 最慢的星星闪烁周期
    dotStrength: 0.64,    // 小星点的明暗变化幅度
    crossStrength: 0.48,  // 十字星和菱形星的明暗变化幅度
    dotColor: '#a1b7a4',  // 小星点颜色
    crossColor: '#91a68a', // 十字星和菱形星颜色
  },
};

const TURN = 2 * Math.PI;

function svgElement(name, attributes) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function makeCorridorSweep(stageWidth) {
  const { seconds, color, strength, width, lineWidth, glowWidth, glowStrength } = ENVIRONMENT.corridor;
  const arches = document.querySelector('#cloister-arches');
  const gradient = svgElement('linearGradient', {
    id: 'corridor-sweep-gradient', gradientUnits: 'userSpaceOnUse',
    x1: 0, y1: 0, x2: width, y2: 0,
  });
  // The long, dim end of the gradient trails behind the moving highlight.
  for (const [offset, opacity] of [[0, 0], [.22, .11], [.46, .4], [.68, .9], [.77, 1], [.88, .54], [1, 0]]) {
    gradient.append(svgElement('stop', { offset, 'stop-color': color, 'stop-opacity': opacity * strength }));
  }
  arches.ownerSVGElement.querySelector('defs').append(gradient);

  const sweep = svgElement('g', {
    id: 'corridor-sweep', fill: 'none', stroke: 'url(#corridor-sweep-gradient)',
    'stroke-width': lineWidth, visibility: 'hidden',
  });
  const halo = svgElement('g', { 'stroke-width': glowWidth, opacity: glowStrength });
  sweep.append(halo);
  for (const arch of arches.children) {
    const href = `#${arch.id}`;
    halo.append(svgElement('use', { href }));
    sweep.append(svgElement('use', { href }));
  }
  arches.after(sweep);

  return {
    update(time) {
      const x = -width + (stageWidth + width) * (time % seconds) / seconds;
      gradient.setAttribute('gradientTransform', `translate(${x} 0)`);
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

export function makeCraneRig(sprite) {
  const x = sprite.x + sprite.width / 2;
  const y = sprite.y + sprite.height / 2;
  const rig = new Container({ label: 'paper-crane-motion', x, y });
  rig.pivot.set(x, y);
  rig.addChild(sprite);
  return rig;
}

function makeTwinkles() {
  const { minSeconds, maxSeconds, dotStrength, crossStrength, dotColor, crossColor } = ENVIRONMENT.stars;
  const dots = document.querySelector('#night-stars');
  const crosses = document.querySelector('#cross-stars');
  dots.setAttribute('fill', dotColor);
  crosses.setAttribute('stroke', crossColor);
  return [...dots.children, ...crosses.children].map((element, index) => ({
    element,
    opacity: Number(element.getAttribute('opacity')),
    strength: element.parentNode === dots ? dotStrength : crossStrength,
    period: minSeconds + (maxSeconds - minSeconds) * ((index * 0.61803399) % 1),
    phase: TURN * ((index * 0.41421356) % 1),
  }));
}

export function startEnvironment(app, { stageWidth, glass, lighting, reflections, crane }) {
  const corridor = makeCorridorSweep(stageWidth);
  const stars = makeTwinkles();
  const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
  const mirror = ENVIRONMENT.mirror;
  const { sweep, beam, bounce } = lighting;
  const craneRestY = crane.y;
  const beamReach = mirror.width / 2 / Math.cos(beam.rotation)
    + Math.abs(Math.tan(beam.rotation)) * glass.height / 2 + 2;
  let request = null;
  let previousFrame = null;
  let elapsed = 0;
  let previousStarUpdate = -Infinity;

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
    if (previousFrame !== null) elapsed += (now - previousFrame) / 1000;
    previousFrame = now;
    corridor.update(elapsed);
    updateMirror(elapsed);
    const cranePhase = TURN * elapsed / ENVIRONMENT.crane.seconds;
    crane.y = craneRestY + ENVIRONMENT.crane.height * Math.sin(cranePhase);
    crane.angle = ENVIRONMENT.crane.tilt * Math.sin(cranePhase - Math.PI / 4);

    if (elapsed - previousStarUpdate >= 1 / 30) {
      for (const { element, opacity, strength, period, phase } of stars) {
        const twinkle = (1 + Math.sin(TURN * elapsed / period + phase)) / 2;
        element.style.opacity = (opacity * (1 - strength + strength * 1.34 * twinkle)).toFixed(3);
      }
      previousStarUpdate = elapsed;
    }

    app.render();
    request = requestAnimationFrame(draw);
  }

  function syncMotion() {
    if (motionPreference.matches || document.hidden) {
      if (request !== null) cancelAnimationFrame(request);
      request = null;
      previousFrame = null;
      if (motionPreference.matches) {
        corridor.reset();
        updateMirror(0, false);
        crane.y = craneRestY;
        crane.angle = 0;
        for (const { element } of stars) element.style.removeProperty('opacity');
        previousStarUpdate = -Infinity;
        elapsed = 0;
        app.render();
      }
    } else if (request === null) {
      request = requestAnimationFrame(draw);
    }
  }

  motionPreference.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  syncMotion();
}
