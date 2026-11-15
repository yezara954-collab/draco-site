import { album, photoFlight as c } from './config.js';
import { arch } from './picture-album-paper.js';
import { loadPhotoTextures, photoMaterial } from './picture-photo-art.js';
import { makePhotoDust } from './picture-photo-dust.js';

const clamp = t => Math.min(1, Math.max(0, t));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const radians = degrees => degrees * Math.PI / 180;

export function makePhotoFlight(T, scene, camera, book) {
  const group = new T.Group();
  scene.add(group);
  const dust = makePhotoDust(T, group);
  const capacity = Math.max(c.PHOTO_MAX_ONSCREEN.desktop, c.PHOTO_MAX_ONSCREEN.mobile);
  const geometry = new T.BoxGeometry(1, c.PHOTO_ASPECT, c.PHOTO_THICKNESS, 8, 10, 1);
  const right = new T.Vector3();
  const up = new T.Vector3();
  const probe = new T.Vector3();
  const particle = new T.Vector3();
  const velocity = new T.Vector3();
  const flat = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2);
  const zAxis = new T.Vector3(0, 0, 1);
  const spinAxis = new T.Vector3(.35, .82, .45).normalize();
  const twist = new T.Quaternion();
  const heading = new T.Quaternion();
  const pushes = { count: 0, xy: new Float32Array(capacity * 2) };
  const slots = Array.from({ length: capacity }, () => {
    const material = photoMaterial(T);
    const mesh = new T.Mesh(geometry, material);
    mesh.visible = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    const frameGeo = new T.BufferGeometry();
    const framePositions = new T.BufferAttribute(new Float32Array(32 * 3), 3).setUsage(T.DynamicDrawUsage);
    frameGeo.setAttribute('position', framePositions);
    const frameMat = new T.LineBasicMaterial({
      color: c.PHOTO_FRAME_COLOR, transparent: true, depthWrite: false, blending: T.AdditiveBlending,
    });
    const frame = new T.LineLoop(frameGeo, frameMat);
    frame.visible = false;
    frame.frustumCulled = false;
    group.add(frame);
    return { mesh, material, frame, framePositions, origin: new T.Vector3(), rest: new T.Quaternion(), width: 1 };
  });

  let textures, disposed = false;
  let width, height, limit = capacity, count = 0, clock = 0, charge = 0, lastDoodle = -1;
  // 相纸有自己的随机序列，出片与喷尘不会重新排列翻页的随机节奏。
  const entropy = new Uint32Array(1);
  globalThis.crypto.getRandomValues(entropy);
  let seed = entropy[0];
  function nextRandom() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const random = ([a, b]) => mix(a, b, nextRandom());
  let interval = random(c.EMIT_END_INTERVAL);
  loadPhotoTextures(T).then(result => {
    if (disposed) result.forEach(texture => texture.dispose());
    else textures = result;
  }).catch(error => { if (!disposed) console.warn('Picture 相纸纹理未加载', error); });

  function frameGlow(slot, anchor) {
    const { frame, framePositions } = slot;
    const [u, v, span] = anchor.frame;
    const depth = span * album.PAGE_WIDTH / album.PAGE_DEPTH;
    const base = album.COVER_DEPTH + Math.max(1, anchor.count) * album.PAGE_THICKNESS;
    for (let edge = 0; edge < 4; edge++) {
      for (let i = 0; i < 8; i++) {
        const f = i / 8;
        const x = u + span * (edge === 0 ? f : edge === 1 ? 1 : edge === 2 ? 1 - f : 0);
        const z = v + depth * (edge === 0 ? 0 : edge === 1 ? f : edge === 2 ? 1 : 1 - f);
        probe.set(anchor.side * (album.SPINE_GAP + x * album.PAGE_WIDTH), base + arch(x) + .008,
          (z - .5) * album.PAGE_DEPTH);
        book.localToWorld(probe);
        framePositions.setXYZ(edge * 8 + i, probe.x, probe.y, probe.z);
      }
    }
    framePositions.needsUpdate = true;
    frame.visible = true;
  }

  function emit(anchors) {
    const slot = slots.find(photo => !photo.mesh.visible);
    const anchor = anchors[Math.floor(nextRandom() * anchors.length)];
    const [u, v, span] = anchor.frame;
    const size = span * album.PAGE_WIDTH * c.PHOTO_SIZE_SCALE;
    const center = u + span * (.5 + (nextRandom() - .5) * c.PHOTO_ANCHOR_JITTER);
    const depth = (v - .5) * album.PAGE_DEPTH + span * album.PAGE_WIDTH *
      (.5 + (nextRandom() - .5) * c.PHOTO_ANCHOR_JITTER);
    const base = album.COVER_DEPTH + Math.max(1, anchor.count) * album.PAGE_THICKNESS;
    slot.origin.set(anchor.side * (album.SPINE_GAP + center * album.PAGE_WIDTH), base + arch(center) + .013, depth);
    book.localToWorld(slot.origin);
    const slope = (album.OPEN_ARCH * Math.PI * Math.cos(Math.PI * center) + album.FREE_EDGE_LIFT) /
      album.PAGE_WIDTH * anchor.side;
    slot.angle = radians(random(c.PHOTO_ROTATION));
    slot.rest.copy(book.quaternion).multiply(twist.setFromAxisAngle(zAxis, Math.atan(slope))).multiply(flat);
    slot.rest.multiply(twist.setFromAxisAngle(zAxis, slot.angle));
    const { mesh, material } = slot;
    const uniforms = material.uniforms;
    uniforms.curvature.value.set(center, Math.PI * size / album.PAGE_WIDTH * anchor.side, album.OPEN_ARCH / size);
    let texture = Math.floor(nextRandom() * (textures.length - (lastDoodle >= 0 ? 1 : 0)));
    if (lastDoodle >= 0 && texture >= lastDoodle) texture++;
    lastDoodle = texture;
    uniforms.doodle.value = textures[texture];
    uniforms.seed.value = nextRandom() * 60;
    uniforms.dissolve.value = -1;
    slot.width = size;
    slot.birth = clock;
    slot.rise = random([c.PHOTO_RISE_SPEED_MIN, c.PHOTO_RISE_SPEED_MAX]);
    slot.drift = random(c.PHOTO_X_DRIFT);
    slot.spin = radians(c.PHOTO_SPIN_SPEED) * (nextRandom() * 2 - 1);
    slot.phase = nextRandom() * 6.283;
    const originScreenY = (1 - probe.copy(slot.origin).project(camera).y) * .5;
    slot.height = Math.min(random([c.PHOTO_DISSOLVE_HEIGHT_MIN, c.PHOTO_DISSOLVE_HEIGHT_MAX]),
      Math.max(c.PHOTO_DISSOLVE_HEIGHT_MIN, originScreenY - c.PHOTO_DISSOLVE_TOP_ROOM));
    slot.duration = random([c.PHOTO_DISSOLVE_DURATION_MIN, c.PHOTO_DISSOLVE_DURATION_MAX]);
    slot.dy = slot.dx = slot.released = slot.dustCarry = 0;
    mesh.position.copy(slot.origin);
    mesh.quaternion.copy(slot.rest);
    mesh.scale.setScalar(size);
    mesh.visible = true;
    count++;
    frameGlow(slot, anchor);
  }

  function dustFrom(slot, level, dt, viewScale) {
    const { mesh, material } = slot;
    const seed = material.uniforms.seed.value;
    slot.dustCarry += c.DUST_PER_PHOTO * dt / slot.duration;
    while (slot.dustCarry >= 1) {
      slot.dustCarry--;
      const x = nextRandom();
      let y = clamp(level);
      for (let i = 0; i < 3; i++) {
        const noise = Math.sin(x * 31 + seed + y * 9) * .58 +
          Math.sin(x * 47 - y * 26 + seed * 1.31) * .25 +
          Math.sin(x * 101 + y * 72 + seed) * .17;
        y = clamp(level - c.PHOTO_DISSOLVE_NOISE * noise);
      }
      particle.set(x - .5, (y - .5) * c.PHOTO_ASPECT, c.PHOTO_THICKNESS);
      mesh.localToWorld(particle);
      velocity.copy(right).multiplyScalar(viewScale * random(c.DUST_SPEED_X))
        .addScaledVector(up, viewScale * random(c.DUST_SPEED_Y));
      const glint = nextRandom() < c.DUST_GLINT_CHANCE;
      dust.emit(particle, velocity, random(c.DUST_LIFE), random(c.DUST_SIZE) * (glint ? 1.65 : 1),
        (glint ? 1 : 0) + nextRandom() * .96);
    }
  }

  function update(dt, anchors, flipping, launches, readWind) {
    clock += dt;
    const ramp = smooth(clamp(clock / c.EMIT_RAMP_SECONDS));
    const gap = mix(c.EMIT_START_INTERVAL, interval, ramp);
    const boost = flipping ? c.EMIT_FLURRY_BOOST : 1;
    charge = Math.min(1, charge + dt / gap * boost + launches * c.EMIT_FLIP_NUDGE);
    if (textures && anchors.length && count < limit && charge >= 1) {
      emit(anchors);
      charge = 0;
      interval = random(c.EMIT_END_INTERVAL) * (.96 + .10 * Math.sin(clock * 1.67));
    }
    right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    pushes.count = 0;
    for (const slot of slots) {
      const { mesh, frame, material } = slot;
      if (!mesh.visible) continue;
      const age = clock - slot.birth;
      const lift = clamp(age / c.PHOTO_LIFT_DURATION);
      const open = smooth(clamp((lift - .20) / .80));
      const airtime = Math.max(0, age - c.PHOTO_LIFT_DURATION);
      const opacity = 1 - clamp(age / c.PHOTO_FRAME_FLASH);
      frame.material.opacity = opacity * .74;
      frame.visible = opacity > 0;
      const viewScale = -probe.copy(slot.origin).applyMatrix4(camera.matrixWorldInverse).z *
        2 * Math.tan(radians(camera.fov / 2));
      if (lift >= 1) {
        probe.copy(mesh.position).project(camera);
        const x = clamp((probe.x + 1) * .5);
        const wind = readWind?.(x) ?? 0;
        slot.dx += dt * Math.max(.003, c.PHOTO_WIND_DRIFT + slot.drift + wind * c.PHOTO_WIND_SENSITIVITY);
        slot.dy += dt * slot.rise * (slot.released ? c.PHOTO_DISSOLVE_RISE_SCALE : 1);
      }
      const bob = c.PHOTO_BOB * Math.sin(airtime * 4.1 + slot.phase) * clamp(airtime * 2);
      mesh.position.copy(slot.origin)
        .addScaledVector(right, (slot.dx + .011 * open) * viewScale)
        .addScaledVector(up, (slot.dy + .061 * open + bob) * viewScale);
      heading.copy(camera.quaternion).multiply(twist.setFromAxisAngle(zAxis, slot.angle + .10 * Math.sin(airtime * 2 + slot.phase) * clamp(airtime)))
        .multiply(twist.setFromAxisAngle(spinAxis, airtime * slot.spin));
      mesh.quaternion.copy(slot.rest).slerp(heading, open);
      mesh.scale.setScalar(slot.width * (1 - c.PHOTO_SHRINK * clamp(slot.dy)));
      material.uniforms.peel.value = Math.sin(Math.PI * lift) * .57 + open * .03 * Math.sin(airtime * 3.2);
      material.uniforms.arch.value = 1 - open;

      if (c.PHOTO_DISTURBS_TASSELS && lift > .5) {
        probe.copy(mesh.position).project(camera);
        const i = pushes.count * 2;
        pushes.xy[i] = (probe.x + 1) * width * .5;
        pushes.xy[i + 1] = (1 - probe.y) * height * .5;
        pushes.count++;
      }
      if (!slot.released && slot.dy + .061 >= slot.height) slot.released = clock;
      if (!slot.released) continue;
      const progress = (clock - slot.released) / slot.duration;
      const level = mix(-c.PHOTO_DISSOLVE_NOISE, 1 + c.PHOTO_DISSOLVE_NOISE, clamp(progress));
      material.uniforms.dissolve.value = level;
      if (level > -.05 && level < 1.06) dustFrom(slot, level, dt, viewScale);
      if (progress >= 1) {
        mesh.visible = false;
        count--;
      }
    }
    dust.update(dt);
  }

  function clear() {
    for (const { mesh, frame } of slots) { mesh.visible = false; frame.visible = false; }
    clock = charge = count = pushes.count = 0;
    dust.clear();
  }

  return {
    group, pushes, update, clear,
    fit(w, h, mobile, ratio) {
      width = w; height = h;
      limit = c.PHOTO_MAX_ONSCREEN[mobile ? 'mobile' : 'desktop'];
      for (let i = slots.length - 1; i >= 0 && count > limit; i--) {
        if (!slots[i].mesh.visible) continue;
        slots[i].mesh.visible = slots[i].frame.visible = false;
        count--;
      }
      pushes.count = 0;
      dust.fit(mobile, ratio);
    },
    destroy() {
      disposed = true;
      dust.destroy();
      textures?.forEach(texture => texture.dispose());
      for (const { material, frame } of slots) {
        material.dispose(); frame.material.dispose(); frame.geometry.dispose();
      }
      geometry.dispose();
      scene.remove(group);
    },
  };
}
