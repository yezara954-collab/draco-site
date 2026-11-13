import { APPLE_JUICE as JUICE, MAGIC_CURSOR as MAGIC } from './motion-config.js';

const TAU = 2 * Math.PI;
const clamp = n => Math.max(0, Math.min(1, n));
const ease = n => {
  const t = clamp(n);
  return t * t * (3 - 2 * t);
};
const random = ([min, max]) => min + (max - min) * Math.random();
const colorFrom = colors => colors[Math.floor(Math.random() * colors.length)];

function starPath(ctx, rays) {
  ctx.beginPath();
  for (let i = 0; i < rays * 2; i++) {
    const angle = i * Math.PI / rays;
    const radius = i % 2 ? .22 : i % 4 ? .76 : 1;
    ctx.lineTo(radius * Math.cos(angle), radius * Math.sin(angle));
  }
  ctx.closePath();
}

function drawCursor(ctx, x, y, hover, reduced) {
  const radius = MAGIC.size * (1 + (MAGIC.hoverScale - 1) * (reduced ? 0 : hover));
  ctx.save();
  ctx.translate(x, y);
  const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, radius * 2);
  halo.addColorStop(0, 'rgba(202,250,246,.47)');
  halo.addColorStop(1, 'rgba(137,229,236,0)');
  ctx.globalAlpha = .55 + .45 * hover;
  ctx.fillStyle = halo;
  ctx.fillRect(-radius * 2, -radius * 2, radius * 4, radius * 4);
  ctx.rotate(-.12);
  ctx.scale(radius, radius);
  starPath(ctx, 8);
  ctx.fillStyle = '#b3f4f2';
  ctx.fill();
  ctx.rotate(Math.PI / 8);
  ctx.scale(.75, .75);
  starPath(ctx, 4);
  ctx.fillStyle = '#fffff2';
  ctx.fill();
  ctx.restore();
}

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.className = 'magic-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.append(canvas);
  const ctx = canvas.getContext('2d');
  let ratio;
  function resize() {
    ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * ratio);
    canvas.height = Math.round(innerHeight * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);
  return { ctx, clear: () => ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio) };
}

function makeApple(apple, burst) {
  const fruit = apple.querySelector('#apple-fruit');
  const core = apple.querySelector('#apple-core');
  let age = null;
  let hovered = false;
  let hoverTime = 0;
  let glow = 0;
  let reduced = false;
  let splashed = false;
  const setPose = (x, y, angle = 0) => {
    fruit.setAttribute('transform', `translate(35 49) rotate(${angle}) scale(${x} ${y}) translate(-35 -49)`);
  };
  function paint(fruitOpacity, coreOpacity) {
    fruit.style.opacity = fruitOpacity;
    core.style.opacity = coreOpacity;
  }
  function reset() {
    paint(1, 0);
    fruit.removeAttribute('transform');
    fruit.style.removeProperty('filter');
    age = null;
    splashed = false;
    apple.removeAttribute('aria-disabled');
  }

  return {
    hover(value) { hovered = value; },
    activate() {
      if (age !== null) return false;
      age = 0;
      apple.setAttribute('aria-disabled', 'true');
      return true;
    },
    setReduced(value) {
      if (reduced === value) return;
      reduced = value;
      if (age !== null) reset();
      glow = 0;
      fruit.style.removeProperty('filter');
      setPose(1, 1);
    },
    update(dt) {
      if (age === null) {
        const target = hovered && !reduced ? 1 : 0;
        if (glow === 0 && target === 0) return;
        glow += (target - glow) * Math.min(1, dt * 12);
        if (glow < .003) glow = 0;
        hoverTime = hovered || glow ? hoverTime + dt : 0;
        fruit.style.filter = glow ? `brightness(${1 + JUICE.hoverGlow * glow}) drop-shadow(0 0 3px #caffad66)` : '';
        setPose(1, 1, Math.sin(hoverTime * 11) * JUICE.hoverTilt * glow);
        return;
      }

      const { squashTime, squashX, squashY, regrowAt, regrowTime, reducedFade } = JUICE;
      age += dt;
      const duration = regrowAt + (reduced ? reducedFade : regrowTime);
      if (age >= duration) {
        reset();
        return;
      }
      fruit.style.removeProperty('filter');
      if (reduced) {
        const amount = ease(age / reducedFade) * (1 - ease((age - regrowAt) / reducedFade));
        paint(1 - amount, amount);
      } else if (age < squashTime) {
        const amount = ease(age / squashTime);
        setPose(1 + (squashX - 1) * amount, 1 + (squashY - 1) * amount);
      } else {
        if (!splashed) {
          splashed = true;
          const box = apple.getBoundingClientRect();
          burst(box.left + box.width * .49, box.top + box.height * .57);
        }
        const growth = clamp((age - regrowAt) / regrowTime);
        const size = .09 + .91 * ease(growth * 1.4) + .075 * Math.sin(Math.PI * ease((growth - .52) / .48));
        setPose(size, size);
        paint(ease(growth * 5), 1 - ease(growth * 3));
      }
    },
  };
}

export function createInteractions(stage, apple, isClickable, pickApple, canInteract) {
  const { ctx, clear } = makeCanvas();
  const pointer = { x: 0, y: 0, visible: false, hover: 0 };
  const pool = Array.from({ length: MAGIC.limit }, () => ({ life: 0 }));
  const drops = Array.from({ length: JUICE.dropCount }, () => ({ life: 0 }));
  const activeClass = 'magic-pointer';
  const supportsFine = matchMedia('(any-pointer: fine)');
  let next = 0;
  let reduced = false;
  let dirty = false;
  let trailX;
  let trailY;

  function sparkle(x, y, vx, vy, life, size, opacity) {
    const p = pool[next];
    next = (next + 1) % pool.length;
    Object.assign(p, { x, y, vx, vy, life, age: 0, size, opacity, color: colorFrom(MAGIC.colors) });
  }

  function juiceBurst(x, y) {
    for (let i = 0; i < drops.length; i++) {
      const angle = TAU * (i + Math.random() * .7) / drops.length;
      const speed = random(JUICE.dropSpeed);
      Object.assign(drops[i], {
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 36,
        life: random(JUICE.dropLife), age: 0, size: random(JUICE.dropSize),
        color: Math.random() < .18 ? JUICE.colors[2] : JUICE.colors[Math.floor(Math.random() * 2)],
      });
    }
  }

  const fruit = makeApple(apple, juiceBurst);
  function hidePointer() {
    pointer.visible = false;
    fruit.hover(false);
    document.documentElement.classList.remove(activeClass);
  }

  function move(event) {
    if (event.pointerType === 'touch' || !supportsFine.matches) {
      hidePointer();
      return;
    }
    const { clientX: x, clientY: y } = event;
    if (!pointer.visible || reduced) {
      trailX = x;
      trailY = y;
    } else {
      const distance = Math.hypot(x - trailX, y - trailY);
      const count = Math.min(10, Math.floor(distance / MAGIC.trailSpacing));
      if (count > 0) {
        for (let i = 1; i <= count; i++) {
          const t = i / count;
          sparkle(trailX + (x - trailX) * t, trailY + (y - trailY) * t,
            random([-9, 9]), random([-8, 4]), MAGIC.trailLife, random([.9, 2.7]), .52);
        }
        trailX = x;
        trailY = y;
      }
    }
    pointer.x = x;
    pointer.y = y;
    pointer.visible = true;
    document.documentElement.classList.add(activeClass);
  }
  window.addEventListener('pointermove', move, { passive: true });
  document.documentElement.addEventListener('pointerleave', hidePointer);
  window.addEventListener('blur', hidePointer);
  window.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch') hidePointer();
  }, { passive: true });

  function clickBurst(x, y) {
    for (let i = 0; i < MAGIC.burstCount; i++) {
      const angle = TAU * i / MAGIC.burstCount + random([-.12, .12]);
      const speed = reduced ? 0 : random(MAGIC.burstSpeed);
      const start = reduced ? random([2, 9]) : 2;
      sparkle(x + Math.cos(angle) * start, y + Math.sin(angle) * start,
        Math.cos(angle) * speed, Math.sin(angle) * speed,
        reduced ? MAGIC.reducedLife : MAGIC.burstLife, random([1.3, 3]), .76);
    }
  }

  stage.addEventListener('click', event => {
    if (!canInteract()) return;
    if (apple.contains(event.target)) {
      if (!fruit.activate()) return;
      pickApple();
    }
    clickBurst(event.clientX, event.clientY);
  });
  apple.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (event.repeat || !canInteract() || !fruit.activate()) return;
    pickApple();
    const box = apple.getBoundingClientRect();
    clickBurst(box.left + box.width / 2, box.top + box.height / 2);
  });

  function drawSparkles(dt) {
    for (const p of pool) {
      if (p.age >= p.life || !p.life) continue;
      p.age += dt;
      const life = clamp(1 - p.age / p.life);
      const size = p.size * (reduced ? 1 : .24 + .76 * life);
      ctx.save();
      ctx.globalAlpha = p.opacity * life;
      ctx.translate(p.x + p.vx * p.age, p.y + p.vy * p.age);
      ctx.scale(size, size);
      if (p.size > 2) {
        starPath(ctx, 4);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, .65, 0, TAU);
      }
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.restore();
    }
  }

  function drawJuice(dt) {
    for (const p of drops) {
      if (p.age >= p.life || !p.life) continue;
      p.age += dt;
      const life = clamp(1 - p.age / p.life);
      const x = p.x + p.vx * p.age;
      const y = p.y + p.vy * p.age + .5 * JUICE.gravity * p.age ** 2;
      const angle = Math.atan2(p.vy + JUICE.gravity * p.age, p.vx) - Math.PI / 2;
      const size = p.size * (.62 + .38 * life);
      ctx.save();
      ctx.globalAlpha = .88 * life;
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.scale(size, size);
      const liquid = ctx.createLinearGradient(-1, 0, 1, .4);
      liquid.addColorStop(0, p.color);
      liquid.addColorStop(.55, `${p.color}70`);
      liquid.addColorStop(1, `${p.color}bc`);
      ctx.beginPath();
      ctx.moveTo(0, -1.9);
      ctx.bezierCurveTo(.18, -.85, 1.08, -.1, 1, .62);
      ctx.bezierCurveTo(.88, 1.63, -.96, 1.6, -1, .64);
      ctx.bezierCurveTo(-1.05, -.1, -.24, -.79, 0, -1.9);
      ctx.fillStyle = liquid;
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(-.36, .2, .14, .41, .27, 0, TAU);
      ctx.fillStyle = '#ffffe7';
      ctx.fill();
      ctx.restore();
    }
  }

  return {
    update(dt) {
      const interactive = canInteract();
      const appleHover = interactive && pointer.visible
        && apple.contains(document.elementFromPoint(pointer.x, pointer.y));
      fruit.hover(appleHover);
      fruit.update(dt);
      const hasEffects = pointer.visible || pool.some(p => p.age < p.life) || drops.some(p => p.age < p.life);
      if (!hasEffects && !dirty) return;
      clear();
      dirty = hasEffects;
      drawSparkles(dt);
      drawJuice(dt);
      if (pointer.visible) {
        const target = interactive && (appleHover || isClickable(pointer.x, pointer.y)) ? 1 : 0;
        pointer.hover += (target - pointer.hover) * Math.min(1, dt * 16);
        drawCursor(ctx, pointer.x, pointer.y, pointer.hover, reduced);
      }
    },
    setReduced(value) {
      if (reduced === value) return;
      reduced = value;
      for (const p of [...pool, ...drops]) p.life = 0;
      fruit.setReduced(value);
    },
    hidePointer,
  };
}
