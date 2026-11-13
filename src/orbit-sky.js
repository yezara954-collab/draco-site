import { ORBIT_SKY as settings } from './motion-config.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = value => Math.max(0, Math.min(1, value));
const mix = (a, b, t) => a + (b - a) * t;
const range = ([a, b], random = Math.random) => mix(a, b, random());

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function canvas(width, height, className) {
  const node = document.createElement('canvas');
  node.width = width;
  node.height = height;
  if (className) {
    node.className = className;
    node.setAttribute('aria-hidden', 'true');
  }
  return node;
}

function glow(ctx, x, y, rx, ry, stops) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

function makeMoon() {
  const texture = canvas(256, 256);
  const ctx = texture.getContext('2d');
  ctx.translate(128, 128);
  ctx.rotate(settings.moon.tilt);
  const fill = ctx.createLinearGradient(-76, -90, 67, 89);
  settings.moon.colors.forEach((color, i) => fill.addColorStop(i / 2, color));
  ctx.shadowColor = settings.moon.colors[0];
  ctx.shadowBlur = 4;
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(0, 0, 96, 0, TAU);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.arc(55, -30, 91, 0, TAU);
  ctx.fill();
  return texture;
}

function makeCloud(index) {
  const texture = canvas(384, 208);
  const ctx = texture.getContext('2d');
  const random = seeded(1921 + index * 83);
  const [rim, shade, mid, core] = settings.cloud.colors;
  const puffs = Array.from({ length: 15 }, (_, i) => {
    const t = i / 14;
    const curl = index === 4 ? -35 * Math.sin(t * Math.PI * 1.7) : -26 * Math.sin(t * Math.PI);
    return [55 + t * 274, 119 + curl + range([-20, 21], random),
      range([30, 65], random), range([27, 49], random)];
  });
  for (const [x, y, rx, ry] of puffs) {
    glow(ctx, x, y, rx * 1.15, ry * 1.12, [[0, shade + 'eb'], [.67, rim + 'ef'], [.85, rim + 'a8'], [1, rim + '00']]);
  }
  for (const [x, y, rx, ry] of puffs) {
    glow(ctx, x, y - ry * .12, rx * .94, ry * .94,
      [[0, mid + 'af'], [.55, shade + 'ab'], [.76, rim + '6e'], [1, rim + '00']]);
    glow(ctx, x - rx * .14, y - ry * .23, rx * .57, ry * .53,
      [[0, core + 'a1'], [.48, mid + '77'], [1, mid + '00']]);
  }
  const image = ctx.getImageData(0, 0, texture.width, texture.height);
  const { data } = image;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const noise = (random() - .5) * settings.cloud.grain;
    for (let channel = 0; channel < 3; channel++) data[i + channel] += noise;
    const x = i / 4 % texture.width;
    const y = Math.floor(i / 4 / texture.width);
    data[i + 3] *= clamp(Math.min(x, texture.width - 1 - x, y, texture.height - 1 - y) / 13);
  }
  ctx.putImageData(image, 0, 0);
  return texture;
}

function makeStar(index) {
  const texture = canvas(48, 48);
  const ctx = texture.getContext('2d');
  const [light, middle, shade] = settings.rain.gold;
  const fill = ctx.createLinearGradient(9, 5, 38, 42);
  fill.addColorStop(0, light);
  fill.addColorStop(.52, middle);
  fill.addColorStop(1, shade);
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = i * TAU / 10 - Math.PI / 2;
    const radius = i % 2 ? 8 + index * 1.3 : 20;
    const x = 24 + Math.cos(a) * radius;
    const y = 24 + Math.sin(a) * radius;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ctx.shadowColor = middle;
  ctx.shadowBlur = 5;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.save();
  ctx.clip();
  glow(ctx, 18, 14, 13, 12, [[0, '#fffbe4c0'], [1, '#fffbe400']]);
  ctx.restore();
  return texture;
}

function makeFlash() {
  const texture = canvas(64, 64);
  const ctx = texture.getContext('2d');
  const color = settings.sparks.flashColor;
  glow(ctx, 32, 32, 27, 27, [[0, color + 'ab'], [.37, color + '3d'], [1, color + '00']]);
  ctx.fillStyle = color;
  ctx.beginPath();
  for (const [i, [x, y]] of [[32, 3], [34, 30], [57, 32], [34, 34],
    [32, 61], [30, 34], [7, 32], [30, 30]].entries()) {
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.fill();
  return texture;
}

const pool = count => Array.from({ length: count }, () => ({ active: false }));
const slot = (items, limit) => items.find((item, index) => index < limit && !item.active);
const trim = (items, limit) => items.slice(limit).forEach(item => { item.active = false; });

export function makeOrbitSky(screen) {
  const layer = canvas(1, 1, 'orbit-sky');
  const front = canvas(1, 1, 'orbit-sky-front');
  screen.prepend(layer);
  screen.append(front);
  const ctx = layer.getContext('2d');
  const frontCtx = front.getContext('2d');
  const debug = new URLSearchParams(location.search).get('debug') === 'nebula';
  const random = seeded(17840);
  const stars = Array.from({ length: settings.stars.count }, () => ({
    x: random(), y: random(), radius: .33 + random() ** 2.8 * 1.12,
    brightness: range([.15, .78], random), phase: random() * TAU,
    period: range(settings.stars.period, random),
  }));
  const dust = Array.from({ length: settings.stars.dustCount }, () => ({
    x: random(), y: random(), phase: random() * TAU,
  }));
  const moon = makeMoon();
  const halo = canvas(128, 128);
  const haloColor = settings.moon.halo;
  glow(halo.getContext('2d'), 64, 64, 64, 64, [[0, haloColor + 'a8'], [.55, haloColor + '46'], [1, haloColor + '00']]);
  const cloudConfig = settings.cloud;
  const clouds = settings.clouds.map((config, i) => ({
    ...config, texture: makeCloud(i), phase: random() * TAU, period: range(cloudConfig.period, random),
  }));
  const goldStars = Array.from({ length: 3 }, (_, i) => makeStar(i));
  const flashTexture = makeFlash();
  const tail = canvas(1, 128);
  const tailCtx = tail.getContext('2d');
  const tailGradient = tailCtx.createLinearGradient(0, 0, 0, 128);
  tailGradient.addColorStop(0, settings.rain.tail + '00');
  tailGradient.addColorStop(.44, settings.rain.tail + '52');
  tailGradient.addColorStop(1, settings.rain.tail + 'ca');
  tailCtx.fillStyle = tailGradient;
  tailCtx.fillRect(0, 0, 1, 128);

  const rain = settings.rain, sparkConfig = settings.sparks;
  const meteors = pool(rain.limit), sparks = pool(sparkConfig.limit), flashes = pool(sparkConfig.flashLimit);
  let w = 0, h = 0, card = 0, cx = 0, cy = 0, rx = 0, ry = 0;
  let scale = 1, time = 0, slide = 0, nextDrop = .12, nextBurst = 1.25, nextFlash = .6;
  let burstLeft = 0, burstStep = 0, burstDrop = 0;
  let slow = 0, fast = 0, low = false, fpsTime = 1 / 60;
  const tilt = settings.ring.tilt * DEG;
  const cos = Math.cos(tilt), sin = Math.sin(tilt);

  function placeClouds() {
    for (const cloud of clouds) {
      const a = (cloud.angle + slide + Math.sin(time * TAU / cloud.period + cloud.phase) * cloudConfig.drift) * DEG;
      const x = rx * Math.cos(a), y = ry * Math.sin(a);
      cloud.x = cx + x * cos - y * sin;
      cloud.y = cy + x * sin + y * cos;
      cloud.width = card * cloud.size[0];
      cloud.height = card * cloud.size[1];
    }
  }

  function ring(brush, foreground) {
    const { color, frontAlpha, backAlpha } = settings.ring;
    brush.save();
    brush.globalAlpha = debug ? .9 : foreground ? frontAlpha : backAlpha;
    brush.strokeStyle = color;
    brush.shadowColor = color;
    brush.shadowBlur = foreground ? 6 : 3;
    brush.lineWidth = debug ? 1.5 : 1;
    brush.beginPath();
    brush.ellipse(cx, cy, rx, ry, tilt, foreground ? 0 : Math.PI, foreground ? Math.PI : TAU);
    brush.stroke();
    brush.restore();
  }

  function spawn() {
    const meteor = slot(meteors, low ? rain.lowLimit : rain.limit);
    if (!meteor) return;
    const source = clouds[Math.floor(Math.random() * clouds.length)];
    const across = range([-.43, .43]);
    const depth = Math.random();
    const x = source.x + across * source.width;
    const y = source.y + source.height * (.29 - across ** 2 * .46) + across * source.width * Math.sin(source.tilt);
    const distance = mix(...rain.distance, depth) * scale * range([.85, 1]);
    const speed = mix(...rain.speed, depth) * scale * range([.92, 1.08]);
    const angle = range([-rain.tilt, rain.tilt]) * DEG;
    Object.assign(meteor, {
      active: true, x, y, age: 0, life: distance / speed, distance, angle,
      length: range(rain.length) * scale, width: range(rain.lineWidth) * mix(.72, 1, scale),
      size: mix(...rain.starSize, depth) * mix(.77, 1, scale),
      alpha: mix(.44, .96, depth), spin: range(rain.spin) * (Math.random() < .5 ? -1 : 1),
      rotation: Math.random() * TAU,
      texture: Math.random() < rain.dotChance ? null : goldStars[Math.floor(Math.random() * goldStars.length)],
    });
    if (Math.random() >= sparkConfig.chance) return;
    const spark = slot(sparks, low ? sparkConfig.lowLimit : sparks.length);
    if (spark) Object.assign(spark, {
      active: true, x: x + range([-16, 16]), y, age: 0, life: meteor.life * .91,
      speed: speed * range(sparkConfig.speed), angle,
      size: range(sparkConfig.size) * mix(.7, 1, scale), phase: Math.random() * TAU,
      color: sparkConfig.colors[Math.floor(Math.random() * sparkConfig.colors.length)],
    });
  }

  function drawRain() {
    for (const item of meteors) {
      if (!item.active) continue;
      const t = item.age / item.life;
      const fall = item.distance * mix(t, t * t, rain.acceleration);
      if (item.y + fall - item.length > h) continue;
      const alpha = item.alpha * clamp(t * 14) * (1 - t) ** .67;
      const length = Math.min(item.length, fall + 42 * scale);
      ctx.save();
      ctx.translate(item.x + Math.tan(item.angle) * fall, item.y + fall);
      ctx.rotate(-item.angle);
      ctx.globalAlpha = alpha;
      ctx.drawImage(tail, -item.width / 2, -length, item.width, length);
      ctx.globalAlpha = alpha;
      if (item.texture) {
        ctx.rotate(item.rotation + item.age * item.spin);
        ctx.drawImage(item.texture, -item.size / 2, -item.size / 2, item.size, item.size);
      } else {
        ctx.fillStyle = rain.tail;
        ctx.fillRect(-.65, -.65, 1.3, 1.3);
      }
      ctx.restore();
    }
    for (const item of sparks) {
      if (!item.active) continue;
      const fall = item.age * item.speed;
      const pulse = (.5 + .5 * Math.sin(item.phase + item.age * 16)) ** 2;
      ctx.globalAlpha = pulse * .76 * (1 - item.age / item.life);
      ctx.fillStyle = item.color;
      ctx.fillRect(item.x + fall * Math.tan(item.angle), item.y + fall, item.size, item.size);
    }
    for (const item of flashes) {
      if (!item.active) continue;
      ctx.globalAlpha = Math.sin(Math.PI * item.age / item.life) ** 1.5;
      ctx.drawImage(flashTexture, item.x - item.size / 2, item.y - item.size / 2, item.size, item.size);
    }
  }

  function paint(staticScene) {
    if (!w || !h) return;
    ctx.globalAlpha = frontCtx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);
    if (debug) frontCtx.clearRect(0, 0, w, h);
    ctx.fillStyle = settings.stars.color;
    for (let i = 0; i < (low ? settings.stars.lowCount : stars.length); i++) {
      const star = stars[i];
      ctx.globalAlpha = star.brightness * (.62 + .38 * Math.sin(star.phase + time * TAU / star.period));
      ctx.beginPath();
      ctx.arc(star.x * w, star.y * h, star.radius, 0, TAU);
      ctx.fill();
    }
    if (!low && !staticScene) for (const point of dust) {
      ctx.globalAlpha = .10 + .10 * Math.sin(time * .63 + point.phase);
      ctx.fillRect((point.x * w + time * settings.stars.dustSpeed) % w,
        point.y * h + Math.sin(point.phase + time * .24) * 7, 1, 1);
    }
    const moonConfig = settings.moon;
    const [ratio, min, max] = moonConfig.radius;
    const radius = Math.max(min, Math.min(max, Math.min(w, h) * ratio));
    const [mx, my] = w < 600 ? moonConfig.mobilePosition : moonConfig.position;
    const size = radius * 256 / 96;
    ctx.globalAlpha = moonConfig.haloOpacity + moonConfig.breath * Math.sin(time * TAU / moonConfig.period);
    ctx.drawImage(halo, mx * w - radius * 2, my * h - radius * 2, radius * 4, radius * 4);
    ctx.globalAlpha = 1;
    ctx.drawImage(moon, mx * w - size / 2, my * h - size / 2, size, size);
    ring(ctx, false);
    if (!staticScene) drawRain();
    for (const cloud of clouds) {
      ctx.save();
      ctx.globalAlpha = cloudConfig.opacity + cloudConfig.breath * Math.sin(cloud.phase + time * TAU / cloud.period);
      ctx.translate(cloud.x, cloud.y);
      ctx.rotate(cloud.tilt);
      ctx.drawImage(cloud.texture, -cloud.width / 2, -cloud.height / 2, cloud.width, cloud.height);
      ctx.restore();
    }
    if (debug) {
      ring(frontCtx, true);
      frontCtx.fillStyle = '#d5fff6';
      frontCtx.font = '12px system-ui';
      clouds.forEach((cloud, index) => {
        frontCtx.beginPath();
        frontCtx.arc(cloud.x, cloud.y, 3, 0, TAU);
        frontCtx.fill();
        frontCtx.fillText(`${index + 1} · ${cloud.angle}°`, cloud.x + 7, cloud.y - 7);
      });
    }
  }

  return {
    fit(width, height, cardWidth, reduced) {
      if (w !== width || h !== height || card !== cardWidth) {
        w = width;
        h = height;
        card = cardWidth;
        scale = Math.min(1, Math.max(.57, w / 800));
        const { maxDpr, maxPixels } = settings.quality;
        const dpr = Math.min(window.devicePixelRatio || 1, maxDpr, Math.sqrt(maxPixels / (w * h)));
        for (const [surface, brush] of [[layer, ctx], [front, frontCtx]]) {
          surface.width = Math.max(1, Math.round(w * dpr));
          surface.height = Math.max(1, Math.round(h * dpr));
          brush.setTransform(surface.width / w, 0, 0, surface.height / h, 0, 0);
        }
        const config = settings.ring;
        cx = w * config.center[0];
        cy = h * config.center[1];
        rx = Math.min(card * config.radius[0], w * config.maxWidth / 2);
        ry = Math.min(card * config.radius[1], h * config.maxHeight / 2);
        if (!debug) ring(frontCtx, true);
      }
      placeClouds();
      paint(reduced);
    },
    update(dt, rawDt, turnVelocity) {
      const quality = settings.quality;
      fpsTime = mix(fpsTime, rawDt, Math.min(1, dt * 2));
      slow = fpsTime > 1 / quality.lowFps ? slow + dt : 0;
      fast = fpsTime < 1 / quality.recoverFps ? fast + dt : 0;
      if (!low && slow >= quality.lowSeconds) {
        low = true;
        trim(meteors, rain.lowLimit);
        trim(sparks, sparkConfig.lowLimit);
      }
      if (low && fast >= quality.recoverSeconds) low = false;
      time += dt;
      const target = Math.max(-1, Math.min(1, turnVelocity)) * cloudConfig.turnDegrees;
      slide = mix(slide, target, 1 - Math.exp(-dt * (target ? cloudConfig.response : cloudConfig.settle)));
      placeClouds();

      for (const items of [meteors, sparks, flashes]) for (const item of items) {
        if (!item.active) continue;
        item.age += dt;
        if (item.age >= item.life) item.active = false;
      }
      if (time >= nextDrop) {
        spawn();
        nextDrop = time + range(rain.interval) * (low ? 1.65 : 1);
      }
      if (time >= nextBurst) {
        burstLeft = Math.round(range(rain.burstCount) * (low ? .55 : 1));
        burstStep = rain.burstTime / Math.max(1, burstLeft - 1);
        burstDrop = time;
        nextBurst = time + range(rain.burstInterval);
      }
      if (burstLeft && time >= burstDrop) {
        spawn();
        burstLeft--;
        burstDrop += burstStep;
      }
      if (time >= nextFlash) {
        const flash = slot(flashes, low ? 1 : flashes.length);
        if (flash) {
          const source = clouds[Math.floor(Math.random() * clouds.length)];
          Object.assign(flash, { active: true, age: 0, life: sparkConfig.flashLife,
            x: source.x + range([-.46, .46]) * source.width, y: source.y + range([.32, .84]) * source.height,
            size: range([19, 39]) * mix(.73, 1, scale) });
        }
        nextFlash = time + range(sparkConfig.flashEvery) * (low ? 1.55 : 1);
      }
      paint(false);
    },
    freeze() {
      for (const items of [meteors, sparks, flashes]) trim(items, 0);
      slide = 0;
      burstLeft = 0;
      placeClouds();
      paint(true);
    },
  };
}
