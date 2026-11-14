import { instantCamera as c, picture } from './config.js';
import { glow, loadCameraArt, surface } from './picture-camera-art.js';

const { colors } = c;
const TAU = Math.PI * 2;
const rad = degrees => degrees * Math.PI / 180;
const mix = (a, b, progress) => a + (b - a) * progress;
const random = ([a, b]) => mix(a, b, Math.random());
const integer = ([a, b]) => Math.floor(random([a, b + 1]));
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function orbitTexture(rx, ry, tilt, front, dpr) {
  const span = Math.max(rx, ry) * 2 + 18;
  const canvas = surface(span * dpr);
  const ctx = canvas.getContext('2d');
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(dpr, dpr);
  ctx.rotate(tilt);
  ctx.setLineDash(c.ORBIT_DASH);
  ctx.lineCap = 'round';
  ctx.strokeStyle = colors.orbit;
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
  // 虚线的三层柔边只绘一次，逐帧合成时保留亚像素位置。
  ctx.globalCompositeOperation = 'lighter';
  for (const [size, alpha] of [[7, .11], [3.8, .29], [1, 1]]) {
    ctx.globalAlpha = (front ? c.ORBIT_FRONT_ALPHA : c.ORBIT_BACK_ALPHA) *
      (size === 1 ? alpha : alpha * c.ORBIT_GLOW);
    ctx.lineWidth = c.ORBIT_LINE_WIDTH * size;
    ctx.stroke();
  }
  return canvas;
}

function paperTexture(image) {
  const size = 384;
  const canvas = surface(size, size * c.PHOTO_HEIGHT);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = colors.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const margin = size * c.PHOTO_MARGIN;
  const crop = Math.min(image.width, image.height);
  ctx.drawImage(image, (image.width - crop) / 2, (image.height - crop) / 2, crop, crop,
    margin, margin, size - 2 * margin, size - 2 * margin);
  ctx.strokeStyle = colors.paperInk;
  ctx.lineWidth = size * c.PHOTO_INK_WIDTH;
  ctx.beginPath();
  ctx.moveTo(3, 4);
  ctx.bezierCurveTo(size * .27, 1.8, size * .75, 5.1, size - 3, 3);
  ctx.lineTo(size - 4, canvas.height - 4);
  ctx.quadraticCurveTo(size * .44, canvas.height - 2, 3, canvas.height - 5);
  ctx.closePath();
  ctx.stroke();
  return canvas;
}

export function makeCamera(canvas, trigger, motion, signal) {
  const ctx = canvas.getContext('2d');
  const warm = glow(colors.warmLight);
  const white = glow(colors.white);
  const flashSprite = glow(colors.star, true);
  const planet = surface(96);
  const ball = planet.getContext('2d');
  const shine = ball.createRadialGradient(36, 31, 1, 48, 48, 45);
  shine.addColorStop(0, colors.planetHighlight);
  shine.addColorStop(.49, colors.planet);
  shine.addColorStop(1, colors.planetShade);
  ball.arc(48, 48, 44, 0, TAU);
  ball.fillStyle = shine;
  ball.fill();
  ball.lineWidth = 2;
  ball.strokeStyle = colors.orbit;
  ball.stroke();

  const heading = rad(c.PRINT_DIRECTION_DEG - 90);
  const tilt = rad(c.ORBIT_TILT_DEG);
  const tiltCos = Math.cos(tilt);
  const tiltSin = Math.sin(tilt);
  const along = [-Math.sin(heading), Math.cos(heading)];
  let art, bounds, tracks, shadowDirection;
  let clock = 0, lastFlash = -Infinity, lastManual = -Infinity, nextGlint = random(c.LENS_GLINT_INTERVAL);
  let nextAuto = Infinity, pending = [], photos = [], lastDoodle = -1;

  function fit() {
    const w = Math.max(1, canvas.clientWidth);
    const h = Math.max(1, canvas.clientHeight);
    const dpr = Math.min(devicePixelRatio || 1, picture.display.maxDpr);
    const wp = Math.ceil(w * dpr), hp = Math.ceil(h * dpr);
    if (bounds?.viewWidth === w && bounds.viewHeight === h && canvas.width === wp && canvas.height === hp) return;
    canvas.width = wp;
    canvas.height = hp;
    ctx.setTransform(wp / w, 0, 0, hp / h, 0, 0);
    if (!art) return;
    const mobile = w <= picture.display.mobileWidth;
    const aspect = art.body.width / art.body.height;
    const width = Math.min(h * (mobile ? c.CAMERA_HEIGHT_MOBILE : c.CAMERA_HEIGHT) * aspect, w * c.CAMERA_MAX_WIDTH);
    const height = width / aspect;
    const x = w * c.CAMERA_X;
    const y = h * (picture.ground.y + c.GROUND_OFFSET);
    const rx = Math.min(width * c.ORBIT_RX, w * c.ORBIT_MAX_VIEW_RX), ry = width * c.ORBIT_RY;
    bounds = { viewWidth: w, viewHeight: h, x, y, width, height, rx, ry, mobile, dpr,
      trackY: y - height * c.ORBIT_Y };
    tracks = [false, true].map(front => orbitTexture(rx, ry, tilt, front, dpr));
    Object.assign(trigger.style, {
      left: x - width / 2 + 'px', top: y - height + 'px',
      width: width + 'px', height: height + 'px',
    });
    const limit = mobile ? c.PHOTO_LIMIT_MOBILE : c.PHOTO_LIMIT;
    if (photos.length > limit) photos.splice(0, photos.length - limit);
    paint();
  }

  function stamp(bitmap, x, y, width, height, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(bitmap, x - width / 2, y - height / 2, width, height);
    ctx.globalAlpha = 1;
  }

  function orbitPosition(time) {
    const angle = rad(c.ORBIT_START_DEG) + time / c.ORBIT_PERIOD * TAU;
    const depth = Math.sin(angle);
    const x = bounds.rx * Math.cos(angle);
    const y = bounds.ry * depth;
    return { x: x * tiltCos - y * tiltSin, y: x * tiltSin + y * tiltCos, depth };
  }

  function drawOrbit(front, position) {
    const { x, trackY, width, dpr } = bounds;
    const track = tracks[Number(front)];
    ctx.drawImage(track, x - track.width / dpr / 2, trackY - track.height / dpr / 2,
      track.width / dpr, track.height / dpr);
    if (front !== (position.depth >= 0)) return;
    const depth = (position.depth + 1) / 2;
    const size = width * c.PLANET_SIZE * mix(...c.PLANET_DEPTH_SCALE, depth);
    ctx.save();
    ctx.translate(x + position.x, trackY + position.y);
    ctx.globalCompositeOperation = 'lighter';
    stamp(warm, 0, 0, size * c.PLANET_GLOW_SIZE, size * c.PLANET_GLOW_SIZE, c.ORBIT_GLOW * mix(.65, 1, depth));
    ctx.globalCompositeOperation = 'source-over';
    const ringAngle = rad(mix(...c.PLANET_RING_TILT, depth));
    for (const start of [Math.PI, 0]) {
      if (start === 0) ctx.drawImage(planet, -size / 2, -size / 2, size, size);
      for (const [line, alpha] of [[2.45, c.ORBIT_GLOW * .36], [.8, .92]]) {
        ctx.lineWidth = line;
        ctx.strokeStyle = colors.orbit;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.ellipse(0, 0, size * c.PLANET_RING_RATIO[0] / 2, size * c.PLANET_RING_RATIO[1] / 2,
          ringAngle, start, start + Math.PI);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function lightOnGround(position, delta) {
    const { x, y, width, height, rx } = bounds;
    const { shadow, pad, maskWidth, maskHeight } = art;
    if (c.REFLECTION_ENABLED) {
      ctx.globalAlpha = c.REFLECTION_ALPHA;
      ctx.drawImage(art.reflection, x - width / 2, y, width, height * c.REFLECTION_SQUASH);
      ctx.globalAlpha = 1;
    }
    if (c.SHADOW_ENABLED) {
      const sideways = -position.x / rx;
      const depth = -position.depth;
      const extension = c.SHADOW_FOLLOWS_PLANET ? clamp(.56 + .46 * depth, 0, 1) :
        (Math.sin(rad(c.SHADOW_FIXED_DEG)) + 1) / 2;
      const length = width * mix(c.SHADOW_LENGTH_MIN, c.SHADOW_LENGTH_MAX, extension);
      const target = c.SHADOW_FOLLOWS_PLANET
        ? { x: sideways * length, y: depth * length * c.SHADOW_SQUASH }
        : { x: Math.cos(rad(c.SHADOW_FIXED_DEG)) * length,
          y: Math.sin(rad(c.SHADOW_FIXED_DEG)) * length * c.SHADOW_SQUASH };
      if (!shadowDirection || !delta) shadowDirection = target;
      else {
        const blend = 1 - Math.exp(-delta * c.SHADOW_EASE);
        shadowDirection.x = mix(shadowDirection.x, target.x, blend);
        shadowDirection.y = mix(shadowDirection.y, target.y, blend);
      }
      const { x: dx, y: dy } = shadowDirection;
      const squash = c.SHADOW_FOLLOWS_PLANET ? mix(.44, 1, extension) : 1;
      ctx.save();
      ctx.globalAlpha = c.SHADOW_ALPHA * squash;
      // 微小的横轴纵向压缩让侧向剪影也有厚度。前景来光时，投影收进机身。
      const shear = -dx * c.SHADOW_SQUASH;
      ctx.transform(width / maskWidth, shear / maskWidth,
        dx / maskHeight, dy / maskHeight, x - width / 2, y - shear / 2);
      ctx.drawImage(shadow, -pad, -pad);
      ctx.restore();
    }
    stamp(white, x, y, width * c.CONTACT_GLOW_SIZE[0], width * c.CONTACT_GLOW_SIZE[1], c.CONTACT_GLOW_ALPHA);
  }

  function burst() {
    const count = integer(c.BURST_COUNT);
    let start = Math.max(clock, (pending.at(-1) ?? -Infinity) + random(c.BURST_INTERVAL));
    for (let i = 0; i < count; i++) {
      pending.push(start);
      start += random(c.BURST_INTERVAL);
    }
  }

  function shoot() {
    const count = art.papers.length;
    const choice = count > 1 && lastDoodle >= 0 ? integer([0, count - 2]) : integer([0, count - 1]);
    lastDoodle = count > 1 && lastDoodle >= 0 && choice >= lastDoodle ? choice + 1 : choice;
    const spread = random(c.PHOTO_LANDING_SPREAD);
    const sign = Math.random() < .5 ? -1 : 1;
    const sparkCount = Math.ceil(c.PHOTO_SPARK_COUNT * (bounds.mobile ? picture.display.mobileFactor : 1));
    photos.push({
      art: art.papers[lastDoodle], start: clock, slide: random(c.SLIDE_TIME),
      phase: Math.random() * TAU, spread: spread * sign,
      angle: rad(random([-c.PHOTO_ROTATION, c.PHOTO_ROTATION])),
      sparks: Array.from({ length: sparkCount }, (_, i) => ({
        x: random([-.46, .46]), y: random([-.13, .13]), drift: random([-.1, .1]),
        lift: random(c.PHOTO_SPARK_DRIFT), size: random(c.PHOTO_SPARK_SIZE), warm: i % 3 === 0,
      })),
    });
    lastFlash = clock;
  }

  function paperPose(photo, x, y, w, h) {
    const delta = clock - photo.start;
    const paperWidth = w * c.PHOTO_WIDTH;
    const paperHeight = paperWidth * c.PHOTO_HEIGHT;
    const slotX = x + (art.slot[0] - .5) * w;
    const slotY = y - (1 - art.slot[1]) * h;
    const feed = c.PHOTO_FEED_SQUASH;
    const exit = paperHeight * feed / 2 + w * c.PHOTO_EXIT_EXTRA;
    const feedRoll = Math.sin(photo.phase) * rad(c.PHOTO_ROTATION) * .55;
    if (delta < photo.slide) {
      const progress = 1 - (1 - delta / photo.slide) ** c.SLIDE_EASE;
      const distance = mix(-paperHeight * feed / 2, exit, progress);
      const wobble = Math.sin(progress * Math.PI) *
        Math.sin(progress * TAU + photo.phase) * w * c.PHOTO_FEED_WOBBLE;
      return { x: slotX + along[0] * distance + wobble, y: slotY + along[1] * distance,
        roll: heading + feedRoll * progress, squeeze: feed, paperWidth, paperHeight,
        feed: true, front: progress >= c.PHOTO_FRONT_AT, slotX, slotY };
    }
    const releaseX = slotX + along[0] * exit;
    const releaseY = slotY + along[1] * exit;
    const air = delta - photo.slide;
    const fall = clamp(air / c.PHOTO_FALL_TIME, 0, 1);
    const groundX = clamp(x + w * photo.spread, paperWidth * .6, bounds.viewWidth - paperWidth * .6);
    const halfHeight = (Math.abs(Math.sin(photo.angle)) * paperWidth +
      Math.abs(Math.cos(photo.angle)) * paperHeight * c.PHOTO_REST_SQUASH) / 2;
    const groundY = Math.min(bounds.viewHeight * c.PHOTO_GROUND_Y,
      bounds.viewHeight * (1 - c.PHOTO_VIEW_MARGIN) - halfHeight);
    const bounce = clamp((air - c.PHOTO_FALL_TIME) / c.PHOTO_BOUNCE_TIME, 0, 1);
    return { x: mix(releaseX, groundX, fall), y: mix(releaseY, groundY, fall * fall) -
      Math.sin(Math.PI * bounce) * w * c.PHOTO_BOUNCE_HEIGHT,
    roll: mix(heading + feedRoll, photo.angle, fall), squeeze: mix(feed, c.PHOTO_REST_SQUASH, fall),
    paperWidth, paperHeight, front: true, groundX, groundY, landed: fall >= 1,
    fade: clamp((air - c.PHOTO_FALL_TIME - c.PHOTO_BOUNCE_TIME - c.PHOTO_REST_TIME) / c.PHOTO_SCATTER_TIME, 0, 1) };
  }

  function drawPaper(photo, pose, width) {
    const { x, y, roll, squeeze, paperWidth, paperHeight, landed, fade } = pose;
    if (landed && c.PHOTO_SHADOW_ENABLED) {
      stamp(white, pose.groundX, pose.groundY + paperHeight * squeeze * .27,
        paperWidth * c.PHOTO_SHADOW_SIZE[0], paperHeight * c.PHOTO_SHADOW_SIZE[1],
        c.PHOTO_SHADOW_ALPHA * (1 - fade));
    }
    ctx.save();
    if (pose.feed) {
      // 送料平面沿出片方向裁切，前后换层时机身内部的纸不会突然显露。
      ctx.translate(pose.slotX, pose.slotY);
      ctx.rotate(heading);
      const opening = width * art.slot[2];
      ctx.beginPath();
      ctx.moveTo(-opening / 2, 0);
      ctx.lineTo(opening / 2, 0);
      ctx.lineTo(opening, paperHeight);
      ctx.lineTo(-opening, paperHeight);
      ctx.closePath();
      ctx.clip();
      ctx.rotate(-heading);
      ctx.translate(-pose.slotX, -pose.slotY);
    }
    ctx.translate(x, y);
    ctx.rotate(roll);
    stamp(warm, 0, 0, paperWidth * c.PHOTO_GLOW_SIZE[0], paperHeight * squeeze * c.PHOTO_GLOW_SIZE[1],
      c.PHOTO_GLOW_ALPHA * (1 - fade));
    ctx.globalAlpha = (1 - fade) ** 1.5;
    ctx.drawImage(photo.art, -paperWidth / 2, -paperHeight * squeeze / 2, paperWidth, paperHeight * squeeze);
    ctx.restore();
    if (fade > 0) {
      for (const spark of photo.sparks) {
        const size = spark.size * (1 - fade * .72) * 3;
        stamp(spark.warm ? warm : white, x + (spark.x + spark.drift * fade) * paperWidth,
          y + spark.y * paperWidth - spark.lift * fade * width, size, size,
          Math.sin(Math.PI * fade) * (1 - fade * .55));
      }
    }
  }

  function paint(dt = 0) {
    if (!bounds) return;
    const { viewWidth, viewHeight, x, y, width, height } = bounds;
    ctx.clearRect(0, 0, viewWidth, viewHeight);
    const time = motion.matches ? 0 : clock;
    const position = orbitPosition(time);
    lightOnGround(position, dt);
    drawOrbit(false, position);
    const shake = motion.matches ? 0 : Math.max(0, 1 - (clock - lastFlash) / c.SHUTTER_TIME);
    const offset = Math.sin((1 - shake) * TAU * 1.65) * shake * c.SHUTTER_SHAKE;
    const breath = 1 + c.CAMERA_BREATH * (.5 - .5 * Math.cos(time / c.BREATH_PERIOD * TAU));
    const w = width * breath, h = height * breath;
    const placements = photos.map(photo => [photo, paperPose(photo, x + offset, y, w, h)]);
    stamp(warm, x, y - h * .5, w * c.CAMERA_GLOW_SIZE[0], h * c.CAMERA_GLOW_SIZE[1], c.CAMERA_GLOW_ALPHA);
    for (const [photo, pose] of placements) if (!pose.front) drawPaper(photo, pose, w);
    ctx.drawImage(art.body, x + offset - w / 2, y - h, w, h);
    drawOrbit(true, position);
    for (const [photo, pose] of placements) if (pose.front) drawPaper(photo, pose, w);

    const flash = motion.matches ? 0 : clamp(1 - (clock - lastFlash) / c.FLASH_TIME, 0, 1);
    const glintProgress = (clock - nextGlint) / c.LENS_GLINT_TIME;
    const glint = !motion.matches && glintProgress >= 0 && glintProgress < 1 ? Math.sin(glintProgress * Math.PI) : 0;
    if (flash || glint) {
      const size = w * (flash ? c.FLASH_SIZE : c.LENS_GLINT_SIZE);
      stamp(flashSprite, x + offset + (art.lens[0] - .5) * w, y - (1 - art.lens[1]) * h,
        size, size, flash ? flash ** 1.4 : glint * .62);
    }
  }

  trigger.addEventListener('click', () => {
    if (!art || motion.matches || document.hidden || clock - lastManual < c.MANUAL_COOLDOWN ||
        pending.length >= c.BURST_COUNT[1]) return;
    lastManual = clock;
    burst();
  }, { signal });
  loadCameraArt().then(result => {
    if (signal.aborted) return;
    art = { ...result, papers: result.doodles.map(paperTexture) };
    nextAuto = clock + random(c.AUTO_INTERVAL);
    trigger.hidden = false;
    fit();
  }).catch(error => {
    if (!signal.aborted) console.warn('Picture 相机素材未能初始化。', error);
  });

  function settle() {
    photos = [];
    pending = [];
    lastFlash = -Infinity;
    nextAuto = clock + random(c.AUTO_INTERVAL);
    paint();
  }

  function update(dt) {
    if (!bounds || motion.matches || document.hidden) return;
    const step = Math.min(dt, picture.display.maxStep);
    clock += step;
    if (clock >= nextAuto) {
      if (!pending.length) burst();
      nextAuto = clock + random(c.AUTO_INTERVAL);
    }
    if (clock >= nextGlint + c.LENS_GLINT_TIME) nextGlint = clock + random(c.LENS_GLINT_INTERVAL);
    const afterSlide = c.PHOTO_FALL_TIME + c.PHOTO_BOUNCE_TIME + c.PHOTO_REST_TIME + c.PHOTO_SCATTER_TIME;
    photos = photos.filter(photo => clock - photo.start < photo.slide + afterSlide);
    if (pending.length && clock >= pending[0]) {
      pending.shift();
      if (photos.length < (bounds.mobile ? c.PHOTO_LIMIT_MOBILE : c.PHOTO_LIMIT)) shoot();
    }
    paint(step);
  }

  return { fit, settle, update };
}
