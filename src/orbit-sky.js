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

const moonUrl = new URL('./assets/nebula/moon.png', import.meta.url).href;

const cloudUrls = {
  dense: new URL('./assets/nebula/cloud-dense.png', import.meta.url).href,
  mist: new URL('./assets/nebula/cloud-mist.png', import.meta.url).href,
};

function loadCloud(url) {
  const image = new Image();
  image.src = url;
  return image.decode().then(() => {
    const width = 384;
    const height = Math.round(width * image.height / image.width);
    const source = canvas(width, height);
    const ctx = source.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);
    const { data } = ctx.getImageData(0, 0, width, height);
    const edge = [];
    for (let x = 0; x < width; x += 3) {
      for (let y = height - 1; y >= 0; y--) {
        if (data[(y * width + x) * 4 + 3] < 65) continue;
        edge.push([x / width - .5, y / height - .5]);
        break;
      }
    }
    const { backTint, frontTint, moonTint } = settings.cloud;
    const textures = [backTint, frontTint, moonTint].map(color => {
      const texture = canvas(width, height);
      const brush = texture.getContext('2d');
      brush.drawImage(source, 0, 0);
      brush.globalCompositeOperation = 'source-atop';
      brush.globalAlpha = .24;
      brush.fillStyle = color;
      brush.fillRect(0, 0, width, height);
      return texture;
    });
    return { textures, edge, aspect: height / width };
  });
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
  const moon = new Image();
  const halo = canvas(128, 128);
  const haloColor = settings.moon.halo;
  glow(halo.getContext('2d'), 64, 64, 64, 64, [[0, haloColor + 'a8'], [.55, haloColor + '46'], [1, haloColor + '00']]);
  const cloudConfig = settings.cloud;
  const clouds = cloudConfig.sequence.map(type => ({
    type,
    phase: random() * TAU, period: range(cloudConfig.period, random),
    jitter: range([-cloudConfig.sizeJitter, cloudConfig.sizeJitter], random),
    offset: range([-cloudConfig.offset, cloudConfig.offset], random),
    flip: random() < .5 ? -1 : 1, tilt: range([-cloudConfig.rotation, cloudConfig.rotation], random) * DEG,
    glints: Array.from({ length: cloudConfig.glints }, () => ({
      x: range([-.29, .29], random), y: range([-.14, .16], random), phase: random() * TAU,
    })),
  }));
  const textures = {};
  const goldStars = Array.from({ length: 3 }, (_, i) => makeStar(i));
  const tail = canvas(24, 192);
  const tailCtx = tail.getContext('2d');
  const [silver, gold] = settings.rain.tail;
  const tailGradient = tailCtx.createLinearGradient(0, 0, 0, 192);
  tailGradient.addColorStop(0, gold + '00');
  tailGradient.addColorStop(.24, gold + '49');
  tailGradient.addColorStop(.60, silver + 'c3');
  tailGradient.addColorStop(1, silver);
  tailCtx.fillStyle = tailGradient;
  tailCtx.beginPath();
  tailCtx.moveTo(12, 0);
  tailCtx.lineTo(24, 192);
  tailCtx.lineTo(0, 192);
  tailCtx.fill();

  const mistGlow = canvas(128, 48);
  glow(mistGlow.getContext('2d'), 64, 24, 64, 24, [[0, '#71edffb0'], [.5, '#45b1db55'], [1, '#45b1db00']]);
  const rain = settings.rain, sparkConfig = settings.sparks;
  const meteors = pool(rain.limit), sparks = pool(sparkConfig.limit);
  const cardElements = [...screen.querySelectorAll('.orbit-card')];
  const label = screen.querySelector('.orbit-label');
  let w = 0, h = 0, cx = 0, cy = 0, rx = 0, ry = 0, trackLength = 0, arc = [];
  let startPhase = 0;
  let scale = 1, time = 0, slide = 0, spin = 0, inertia = 0, dragging = false;
  let nextDrop = .06, nextBurst = 1.25;
  let burstLeft = 0, burstStep = 0, burstDrop = 0;
  let slow = 0, fast = 0, low = false, fpsTime = 1 / 60;
  let staticScene = false;
  const tilt = settings.ring.tilt * DEG;
  const cos = Math.cos(tilt), sin = Math.sin(tilt);

  function placeClouds() {
    const count = low ? Math.min(cloudConfig.lowCount, clouds.length) : clouds.length;
    const spacing = trackLength / count * cloudConfig.spacing / (1 - cloudConfig.overlap);
    for (const [i, cloud] of clouds.entries()) {
      const position = Math.round(i * count / clouds.length);
      cloud.visible = !low || i === Math.round(position * clouds.length / count);
      const turns = position / count + startPhase + (spin + slide + cloud.offset) / 360;
      const sample = ((turns % 1 + 1) % 1) * (arc.length - 1);
      const lower = Math.floor(sample);
      cloud.angle = mix(arc[lower], arc[lower + 1], sample - lower);
      const a = cloud.angle * DEG;
      const x = rx * Math.cos(a), y = ry * Math.sin(a);
      cloud.depth = (1 + Math.sin(a)) / 2;
      cloud.x = cx + x * cos - y * sin;
      cloud.y = cy + x * sin + y * cos;
      cloud.texture = textures[cloud.type];
      const aspect = cloud.texture?.aspect ?? .44;
      // Compensate for the projected height where clouds round the two ends.
      const tangent = Math.atan2(ry * Math.cos(a), -rx * Math.sin(a)) + tilt - cloud.tilt;
      const spread = Math.hypot(Math.cos(tangent), aspect * Math.sin(tangent));
      cloud.width = Math.min(w * .43, spacing / Math.max(.73, spread))
        * (1 + cloud.jitter) * mix(...cloudConfig.depthScale, cloud.depth);
      cloud.height = cloud.width * aspect;
    }
  }

  function drawCloud(brush, cloud, layerAlpha) {
    const { texture, width, height, depth } = cloud;
    if (!texture || !cloud.visible || layerAlpha <= 0) return;
    const mist = cloud.type === 'mist';
    const opacity = mix(...(mist ? cloudConfig.mistOpacity : cloudConfig.denseOpacity), depth);
    const pulse = mist ? Math.sin(cloud.phase + time * TAU / cloud.period) * cloudConfig.breath : 0;
    const shade = clamp(depth + pulse * 2);
    brush.save();
    brush.translate(cloud.x, cloud.y);
    brush.rotate(cloud.tilt);
    brush.scale(cloud.flip, 1);
    if (mist) {
      brush.globalAlpha = cloudConfig.mistGlow * opacity * layerAlpha;
      brush.drawImage(mistGlow, -width * .54, height * .03, width * 1.08, height * .65);
    }
    brush.globalAlpha = Math.max(mist ? cloudConfig.mistOpacity[0] : 0,
      Math.min(mist ? cloudConfig.mistOpacity[1] : 1, opacity + pulse)) * layerAlpha;
    brush.drawImage(texture.textures[shade < .48 ? 0 : 1], -width / 2, -height / 2, width, height);
    const [moonX, moonY] = w < 600 ? settings.moon.mobilePosition : settings.moon.position;
    const moonlight = clamp(1 - Math.hypot(cloud.x / w - moonX, cloud.y / h - moonY) / .58);
    if (moonlight > 0) {
      brush.globalAlpha *= .36 * moonlight;
      brush.drawImage(texture.textures[2], -width / 2, -height / 2, width, height);
    }
    if (mist) {
      brush.fillStyle = '#d8fbff';
      for (let i = 0; i < (low ? cloudConfig.lowGlints : cloud.glints.length); i++) {
        const point = cloud.glints[i];
        brush.globalAlpha = opacity * layerAlpha * (.12 + .62 * (.5 + .5 * Math.sin(time * 2 + point.phase)) ** 5);
        brush.fillRect(point.x * width, point.y * height, 1.35, 1.35);
      }
    }
    brush.restore();
  }

  function softenForeground() {
    const origin = screen.getBoundingClientRect();
    frontCtx.save();
    frontCtx.globalCompositeOperation = 'destination-out';
    frontCtx.globalAlpha = 1 - cloudConfig.overlapOpacity;
    frontCtx.beginPath();
    for (const element of cardElements) {
      const box = element.getBoundingClientRect();
      frontCtx.roundRect(box.x - origin.x, box.y - origin.y, box.width, box.height, 9);
    }
    frontCtx.fill();
    const box = label.getBoundingClientRect();
    if (box.width && box.height) {
      frontCtx.globalAlpha = .66;
      glow(frontCtx, box.x - origin.x + box.width / 2, box.y - origin.y + box.height / 2,
        box.width * .85, box.height * .86, [[0, '#fff'], [.56, '#fff'], [1, '#fff0']]);
    }
    frontCtx.restore();
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
    const sources = clouds.filter(cloud => cloud.visible && cloud.type === 'dense' && cloud.texture?.edge.length && cloud.x > w * .13);
    const source = sources[Math.floor(Math.random() * sources.length)];
    if (!source) return;
    const edge = source.texture.edge;
    const [u, v] = edge[Math.floor(range([.08, .92]) * edge.length)];
    const localX = u * source.width * source.flip;
    const localY = v * source.height;
    const x = source.x + localX * Math.cos(source.tilt) - localY * Math.sin(source.tilt);
    const y = source.y + localX * Math.sin(source.tilt) + localY * Math.cos(source.tilt);
    const depth = clamp(source.depth * .66 + Math.random() * .34);
    const distance = mix(...rain.distance, depth) * scale * range([.85, 1]);
    const speed = mix(...rain.speed, depth) * scale * range([.92, 1.08]);
    const angle = -range([rain.angle - rain.angleJitter, rain.angle + rain.angleJitter]) * DEG;
    Object.assign(meteor, {
      active: true, x, y, age: 0, life: distance / speed, distance, angle,
      length: range(rain.length) * scale, width: range(rain.lineWidth) * mix(.72, 1, scale),
      size: mix(...rain.starSize, depth) * mix(.77, 1, scale),
      alpha: mix(.44, .96, depth), spin: range(rain.spin) * (Math.random() < .5 ? -1 : 1),
      rotation: Math.random() * TAU, phase: Math.random() * TAU, twinkleRate: range(rain.twinkleRate),
      texture: goldStars[Math.floor(Math.random() * goldStars.length)],
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
      const pulse = (.5 + .5 * Math.sin(item.phase + item.age * TAU * item.twinkleRate)) ** 4;
      const shimmer = 1 + rain.twinkle * pulse;
      const length = Math.min(item.length, fall + 42 * scale);
      ctx.save();
      ctx.translate(item.x + Math.tan(item.angle) * fall, item.y + fall);
      ctx.rotate(-item.angle);
      if (!low) {
        const glowWidth = item.width * rain.glowWidth;
        ctx.globalAlpha = clamp(alpha * rain.tailGlow * shimmer);
        ctx.drawImage(tail, -glowWidth / 2, -length, glowWidth, length);
      }
      ctx.globalAlpha = clamp(alpha * rain.tailBrightness * shimmer);
      ctx.drawImage(tail, -item.width / 2, -length, item.width, length);
      ctx.globalAlpha = clamp(alpha * rain.headBrightness * shimmer);
      ctx.rotate(item.rotation + item.age * item.spin);
      ctx.drawImage(item.texture, -item.size / 2, -item.size / 2, item.size, item.size);
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
  }

  function paint(staticScene) {
    if (!w || !h) return;
    ctx.globalAlpha = frontCtx.globalAlpha = 1;
    ctx.clearRect(0, 0, w, h);
    frontCtx.clearRect(0, 0, w, h);
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
    const size = radius * 2;
    ctx.globalAlpha = moonConfig.haloOpacity + moonConfig.breath * Math.sin(time * TAU / moonConfig.period);
    ctx.drawImage(halo, mx * w - radius * 2, my * h - radius * 2, radius * 4, radius * 4);
    ctx.globalAlpha = 1;
    if (moon.naturalWidth) {
      const height = size * moon.naturalHeight / moon.naturalWidth;
      ctx.drawImage(moon, mx * w - size / 2, my * h - height / 2, size, height);
    }
    const distantMist = textures.mist;
    if (distantMist) for (const [i, [x, y, widthRatio, opacity]] of cloudConfig.backdrop.entries()) {
      if (low && i % 2) continue;
      const width = w * widthRatio;
      const height = width * distantMist.aspect;
      ctx.globalAlpha = opacity;
      ctx.drawImage(distantMist.textures[0], x * w - width / 2, y * h - height / 2, width, height);
    }
    ring(ctx, false);
    if (!staticScene) drawRain();
    for (const cloud of clouds) {
      const frontWeight = clamp((cloud.depth - .43) / .14);
      drawCloud(ctx, cloud, 1 - frontWeight);
      drawCloud(frontCtx, cloud, frontWeight);
    }
    softenForeground();
    ring(frontCtx, true);
    if (debug) {
      frontCtx.fillStyle = '#d5fff6';
      frontCtx.font = '12px system-ui';
      clouds.forEach((cloud, index) => {
        if (!cloud.visible) return;
        frontCtx.beginPath();
        frontCtx.arc(cloud.x, cloud.y, 3, 0, TAU);
        frontCtx.fill();
        frontCtx.fillText(`${index + 1} ${cloud.type} · ${Math.round(cloud.angle)}°`, cloud.x + 7, cloud.y - 7);
      });
    }
  }

  moon.addEventListener('load', () => {
    if (!screen.hidden) paint(staticScene);
  }, { once: true });
  moon.src = moonUrl;

  for (const [type, url] of Object.entries(cloudUrls)) {
    loadCloud(url).then(texture => {
      textures[type] = texture;
      placeClouds();
      if (!screen.hidden) paint(staticScene);
    }).catch(error => console.warn('Nebula texture unavailable:', type, error));
  }

  return {
    fit(width, height, cardWidth, reduced) {
      staticScene = reduced;
      if (w !== width || h !== height) {
        w = width;
        h = height;
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
        rx = Math.min(cardWidth * config.radius[0], w * config.maxWidth / 2);
        ry = Math.min(cardWidth * config.radius[1], h * config.maxHeight / 2);
        const samples = 240;
        const distances = [0];
        trackLength = 0;
        for (let i = 1; i <= samples; i++) {
          const angle = (i - .5) * TAU / samples;
          trackLength += Math.hypot(rx * Math.sin(angle), ry * Math.cos(angle)) * TAU / samples;
          distances.push(trackLength);
        }
        let segment = 1;
        arc = distances.map((_, i) => {
          const distance = i * trackLength / samples;
          while (segment < samples && distances[segment] < distance) segment++;
          const fraction = (distance - distances[segment - 1]) / (distances[segment] - distances[segment - 1]);
          return (segment - 1 + fraction) * 360 / samples;
        });
        const origin = (cloudConfig.startAngle % 360 + 360) % 360;
        const start = origin * samples / 360;
        startPhase = mix(distances[Math.floor(start)], distances[Math.ceil(start)], start % 1) / trackLength;
      }
      placeClouds();
      paint(reduced);
    },
    grab() {
      dragging = true;
      inertia = 0;
    },
    drag(degrees) {
      spin = (spin + degrees) % 360;
    },
    release(velocity) {
      dragging = false;
      const limit = settings.drag.maxSpeed;
      inertia = Math.max(-limit, Math.min(limit, velocity));
    },
    update(dt, rawDt, turnVelocity) {
      staticScene = false;
      if (!dragging) {
        spin = (spin + (settings.drag.idleSpeed + inertia) * dt) % 360;
        inertia *= Math.exp(-dt * settings.drag.damping);
      }
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

      for (const items of [meteors, sparks]) for (const item of items) {
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
      paint(false);
    },
    freeze() {
      staticScene = true;
      dragging = false;
      inertia = 0;
      for (const items of [meteors, sparks]) trim(items, 0);
      slide = 0;
      burstLeft = 0;
      placeClouds();
      paint(true);
    },
  };
}
