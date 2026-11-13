import { ORBIT_SKY as settings } from './motion-config.js';

const TAU = Math.PI * 2;
const clamp = n => Math.max(0, Math.min(1, n));
const mix = (a, b, t) => a + (b - a) * t;
const between = (range, random = Math.random) => mix(...range, random());
const wrap = (n, span) => ((n % span) + span) % span;

function seeded(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function canvas(width, height) {
  const node = document.createElement('canvas');
  node.width = width;
  node.height = height;
  return node;
}

function disk(ctx, x, y, rx, ry, stops) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(rx, ry);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);
  ctx.fillStyle = gradient;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

function grain(ctx, width, height, intensity, random) {
  const pixels = ctx.getImageData(0, 0, width, height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    if (!pixels.data[i + 3]) continue;
    const noise = (random() - .5) * intensity;
    for (let channel = 0; channel < 3; channel++) pixels.data[i + channel] += noise;
  }
  ctx.putImageData(pixels, 0, 0);
}

function moonTexture() {
  const texture = canvas(320, 320);
  const ctx = texture.getContext('2d');
  const { light, middle, shade, craters, grain: intensity } = settings.moon;
  const random = seeded(7021);
  const base = ctx.createRadialGradient(116, 91, 18, 160, 160, 161);
  base.addColorStop(0, light);
  base.addColorStop(.74, middle);
  base.addColorStop(1, shade);
  ctx.beginPath();
  ctx.arc(160, 160, 158, 0, TAU);
  ctx.clip();
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, 320, 320);
  for (let i = 0; i < craters * 2; i++) {
    const x = between([20, 300], random);
    const y = between([20, 300], random);
    const r = between([8, 73], random);
    disk(ctx, x, y, r, r * .72, [[0, '#675e421a'], [.58, '#7669520f'], [1, '#76695200']]);
  }
  for (let i = 0; i < craters; i++) {
    const x = between([24, 298], random);
    const y = between([24, 298], random);
    const r = between([4, 28], random);
    disk(ctx, x, y, r, r * .78, [[0, '#72654d12'], [.65, '#87785c14'], [.79, '#fff4cc25'], [1, '#fff4cc00']]);
  }
  grain(ctx, 320, 320, intensity, random);
  return texture;
}

function cloudTexture(palette, seed) {
  const width = 512, height = 200;
  const texture = canvas(width, height);
  const ctx = texture.getContext('2d');
  const random = seeded(seed);
  // A soft body under several offset banks of billows keeps the silhouette
  // irregular. The highlights are biased toward the upper-left moon.
  disk(ctx, 259, 121, 243, 72, [[0, palette.shade + 'c4'], [.57, palette.shade + '80'], [1, palette.shade + '00']]);
  for (let i = 0; i < 34; i++) {
    const x = 47 + i / 33 * 408 + between([-17, 17], random);
    const envelope = Math.sin(Math.PI * clamp(x / width)) ** .7;
    const y = 129 - 55 * envelope + between([-22, 33], random);
    const rx = between([27, 87], random);
    const ry = between([22, 55], random) * (.65 + .35 * envelope);
    disk(ctx, x, y + ry * .21, rx, ry, [[0, palette.shade + '9c'], [.52, palette.shade + '57'], [1, palette.shade + '00']]);
    disk(ctx, x - 4, y, rx, ry, [[0, palette.light + '62'], [.53, palette.light + '48'], [1, palette.light + '00']]);
    disk(ctx, x - rx * .24, y - ry * .35, rx * .69, ry * .51,
      [[0, palette.rim + '46'], [.48, palette.rim + '23'], [1, palette.rim + '00']]);
  }
  // Feather the texture boundaries, including any billow beyond its canvas.
  ctx.globalCompositeOperation = 'destination-in';
  disk(ctx, width / 2, height / 2, width / 2, height / 2,
    [[0, '#fff'], [.62, '#fff'], [1, '#fff0']]);
  ctx.globalCompositeOperation = 'source-over';
  grain(ctx, width, height, settings.cloudGrain, random);
  return texture;
}

export function makeOrbitSky(screen) {
  const layer = canvas(1, 1);
  layer.className = 'orbit-sky';
  layer.setAttribute('aria-hidden', 'true');
  screen.prepend(layer);
  const ctx = layer.getContext('2d');
  const random = seeded(48722);
  const stars = Array.from({ length: settings.stars.count }, () => ({
    x: random(), y: random(), radius: .36 + random() ** 2 * 1.23,
    brightness: .21 + random() ** 2 * .59, phase: random() * TAU,
    period: between(settings.stars.period, random),
  }));
  const dust = Array.from({ length: settings.stars.dustCount }, () => ({
    x: random(), y: random(), phase: random() * TAU,
  }));
  const moon = moonTexture();
  const halo = canvas(240, 240);
  const haloColor = settings.moon.halo;
  disk(halo.getContext('2d'), 120, 120, 120, 120,
    [[0, haloColor + 'e6'], [.35, haloColor + '93'], [.64, haloColor + '22'], [1, haloColor + '00']]);
  const clouds = settings.clouds.map((config, depth) => {
    const textures = Array.from({ length: settings.textureCount }, (_, i) => cloudTexture(config, 197 + depth * 200 + i * 31));
    return Array.from({ length: config.count }, (_, i) => ({
      config, texture: textures[i % textures.length], position: (i + random() * .6) / config.count,
      y: mix(...config.y, (i + random()) / config.count),
      size: between(config.width, random), speed: between([.85, 1.16], random),
    }));
  });
  const meteors = Array.from({ length: settings.meteor.limit }, () => ({ active: false }));
  let w = 0, h = 0, moonX = 0, moonY = 0, radius = 0;
  let time = 0, nextMeteor = between(settings.meteor.interval), nextBright = between(settings.meteor.brightInterval);
  let parallaxX = 0, parallaxY = 0, drift = 0;
  let slow = 0, fast = 0, low = false, fpsTime = 1 / 60;

  function cloudPosition(cloud, depth) {
    const { config } = cloud;
    const width = cloud.size * Math.max(w, h * .75);
    const span = w + 2 * width;
    const offset = parallaxX * config.parallax + drift * (depth + 1) / 3;
    const x = wrap(cloud.position * span + time * config.speed * cloud.speed + offset, span) - width;
    return { x, y: cloud.y * h + parallaxY * config.parallax, width };
  }

  function drawClouds(depth) {
    if (low && depth === 0) return;
    for (const cloud of clouds[depth]) {
      const { x, y, width } = cloudPosition(cloud, depth);
      if (x >= w || x + width <= 0) continue;
      const height = width * settings.cloudHeight;
      ctx.globalAlpha = cloud.config.opacity;
      ctx.drawImage(cloud.texture, x, y - height / 2, width, height);
    }
  }

  function spawn(bright) {
    const config = settings.meteor;
    const limit = low ? config.reducedLimit : meteors.length;
    const meteor = meteors.find((item, index) => index < limit && !item.active);
    if (!meteor) return;
    const banks = clouds[1].map(cloud => cloudPosition(cloud, 1)).filter(({ x, y, width }) =>
      x + width * .7 > w * .38 && x + width * .3 < w && y < h * .54);
    const bank = banks[Math.floor(Math.random() * banks.length)];
    const x = bank ? Math.min(.98, Math.max(.38, (bank.x + bank.width * between([.34, .66])) / w)) : between([.42, .96]);
    const y = bank ? Math.max(.18, bank.y / h - .035) : between([.27, .39]);
    const maxSpeed = (config.fadeFloor - y) * h / (w * config.slope);
    Object.assign(meteor, {
      active: true, age: 0, life: between(config.life), bright, x, y,
      speed: Math.min(between(config.speed), maxSpeed), length: between(config.length),
    });
  }

  function drawMeteors() {
    const config = settings.meteor;
    for (const meteor of meteors) {
      if (!meteor.active) continue;
      const progress = meteor.age / meteor.life;
      const dx = w * meteor.speed * progress;
      const x = meteor.x * w - dx;
      const y = meteor.y * h + dx * config.slope;
      const length = meteor.length * Math.min(w, h * 1.6) * Math.min(1, progress * 5);
      const opacity = Math.min(1, progress * 9) * (1 - progress) ** .9;
      const size = meteor.bright ? config.brightScale : 1;
      if (length <= 0) continue;
      const tail = ctx.createLinearGradient(x, y, x + length, y - length * config.slope);
      tail.addColorStop(0, config.head);
      tail.addColorStop(.23, config.tail + 'ad');
      tail.addColorStop(1, config.tail + '00');
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = tail;
      ctx.lineWidth = size * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + length, y - length * config.slope);
      ctx.stroke();
      disk(ctx, x, y, 7 * size, 7 * size, [[0, config.head], [.26, config.head + 'b3'], [1, config.head + '00']]);
      ctx.fillStyle = config.tail;
      for (let i = 1; i <= config.sparks; i++) {
        const trail = i / (config.sparks + 1);
        ctx.globalAlpha = opacity * (1 - trail) * .54;
        ctx.fillRect(x + length * trail, y - length * trail * config.slope + Math.sin(i * 9 + progress * 7) * 4, 1, 1);
      }
    }
  }

  function paint(reduced) {
    if (!w || !h) return;
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);
    if (!reduced) {
      ctx.fillStyle = settings.stars.color;
      for (const star of stars) {
        ctx.globalAlpha = star.brightness * (.66 + .34 * Math.sin(star.phase + time * TAU / star.period));
        ctx.beginPath();
        ctx.arc(star.x * w, star.y * h, star.radius, 0, TAU);
        ctx.fill();
      }
      if (!low) for (const point of dust) {
        ctx.globalAlpha = .13 + .12 * Math.sin(time * .63 + point.phase);
        ctx.fillRect(wrap(point.x * w + time * settings.stars.dustSpeed, w),
          point.y * h + Math.sin(point.phase + time * .24) * 7, 1.2, 1.2);
      }
    }
    const { haloRadius, haloOpacity, breath, period } = settings.moon;
    const pulse = reduced ? 0 : Math.sin(time * TAU / period);
    const glow = radius * (haloRadius + pulse * breath);
    ctx.globalAlpha = haloOpacity + pulse * breath;
    ctx.drawImage(halo, moonX - glow, moonY - glow, glow * 2, glow * 2);
    ctx.globalAlpha = 1;
    ctx.drawImage(moon, moonX - radius, moonY - radius, radius * 2, radius * 2);

    drawClouds(0);
    const veil = settings.veil;
    const veilWidth = Math.max(radius * 3.7, w * veil.width);
    const span = w + 2 * veilWidth;
    const veilX = wrap(moonX + veilWidth * .44 + time * settings.clouds[0].speed + parallaxX * 5, span) - veilWidth;
    ctx.globalAlpha = veil.opacity;
    ctx.drawImage(clouds[0][0].texture, veilX, moonY + radius * veil.yOffset - veilWidth * .15,
      veilWidth, veilWidth * settings.cloudHeight);
    drawClouds(1);
    if (!reduced) drawMeteors();
    drawClouds(2);
    ctx.globalAlpha = 1;
  }

  return {
    fit(width, height, reduced) {
      if (w !== width || h !== height) {
        w = width;
        h = height;
        const { maxDpr, maxPixels } = settings.quality;
        const dpr = Math.min(window.devicePixelRatio || 1, maxDpr, Math.sqrt(maxPixels / (w * h)));
        layer.width = Math.max(1, Math.round(w * dpr));
        layer.height = Math.max(1, Math.round(h * dpr));
        ctx.setTransform(layer.width / w, 0, 0, layer.height / h, 0, 0);
        const position = w < 600 ? settings.moon.mobilePosition : settings.moon.position;
        moonX = w * position[0];
        moonY = h * position[1];
        const [ratio, min, max] = settings.moon.radius;
        radius = Math.max(min, Math.min(max, Math.min(w, h) * ratio));
      }
      paint(reduced);
    },
    update(dt, rawDt, mouseX, mouseY, turnVelocity) {
      const { quality, meteor } = settings;
      fpsTime = mix(fpsTime, rawDt, Math.min(1, dt * 2));
      slow = fpsTime > 1 / quality.lowFps ? slow + dt : 0;
      fast = fpsTime < 1 / quality.recoverFps ? fast + dt : 0;
      if (!low && slow >= quality.lowSeconds) {
        low = true;
        meteors.slice(meteor.reducedLimit).forEach(item => { item.active = false; });
      }
      if (low && fast >= quality.recoverSeconds) low = false;
      time += dt;
      const follow = 1 - Math.exp(-dt * settings.parallaxResponse);
      parallaxX = mix(parallaxX, mouseX, follow);
      parallaxY = mix(parallaxY, mouseY, follow);
      const target = Math.max(-1, Math.min(1, turnVelocity)) * settings.turnPush;
      drift = mix(drift, target, 1 - Math.exp(-dt * (target ? settings.turnResponse : settings.turnSettle)));

      for (const item of meteors) {
        if (!item.active) continue;
        item.age += dt;
        if (item.age >= item.life) {
          item.active = false;
        }
      }
      if (time >= nextBright) {
        spawn(true);
        nextBright = time + between(meteor.brightInterval);
      }
      if (time >= nextMeteor) {
        spawn(false);
        if (!low && Math.random() < meteor.doubleChance) spawn(false);
        nextMeteor = time + between(meteor.interval);
      }
      paint(false);
    },
    freeze() {
      parallaxX = parallaxY = drift = 0;
      meteors.forEach(item => { item.active = false; });
      paint(true);
    },
  };
}
