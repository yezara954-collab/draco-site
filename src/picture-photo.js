import { album, picture, photoFlight as c } from './config.js';
import { arch } from './picture-album-paper.js';
import { loadPhotoTextures, photoMaterial } from './picture-photo-art.js';
import { makePhotoDust } from './picture-photo-dust.js';
import { craneRiseDistance, makeCraneFlight } from './picture-crane.js';

const clamp = t => Math.min(1, Math.max(0, t));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const radians = degrees => degrees * Math.PI / 180;

export function makePhotoFlight(T, scene, camera, book) {
  const group = new T.Group();
  scene.add(group);
  const dust = makePhotoDust(T, group, camera);
  const cranes = makeCraneFlight(T, group, camera, book, dust);
  const capacity = Math.max(c.PHOTO_MAX_ONSCREEN.desktop, c.PHOTO_MAX_ONSCREEN.mobile);
  const geometry = new T.BoxGeometry(1, c.PHOTO_ASPECT, c.PHOTO_THICKNESS, 8, 10, 1);
  const up = new T.Vector3();
  const probe = new T.Vector3();
  const particle = new T.Vector3();
  const morphOrigin = new T.Vector3();
  const origin = new T.Vector3();
  const flat = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2);
  const zAxis = new T.Vector3(0, 0, 1);
  const foldAxis = new T.Vector3(0, 1, 0);
  const foldPose = new T.Quaternion();
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
    return { mesh, material, frame, framePositions, origin: new T.Vector3(), rest: new T.Quaternion(),
      width: 1, birth: -Infinity };
  });

  let textures, disposed = false;
  let width, height, limit = capacity, count = 0, clock = 0, lastDoodle = -1;
  let debrisCount;
  let hasFirstPhoto = false;
  const pending = Array.from({ length: capacity }, () => ({ remaining: 0, due: 0, deadline: 0 }));
  // 相纸有自己的随机序列，出片与喷尘不会重新排列翻页的随机节奏。
  const entropy = new Uint32Array(2);
  globalThis.crypto.getRandomValues(entropy);
  let seed = entropy[0], debrisSeed = entropy[1];
  function nextRandom() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const random = ([a, b]) => mix(a, b, nextRandom());
  function debrisRandom() {
    debrisSeed = (Math.imul(debrisSeed, 1664525) + 1013904223) >>> 0;
    return debrisSeed / 4294967296;
  }
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
    let slot;
    for (const item of slots) if (!item.mesh.visible) { slot = item; break; }
    if (!slot) return false;
    const offset = Math.floor(nextRandom() * anchors.length);
    const depthScale = random(c.PHOTO_DEPTH_SCALE);
    let anchor, center, size;
    // 优先试另一侧的相框。若都太近，保留请求至下次重试。
    for (let i = 0; i < anchors.length; i++) {
      const candidate = anchors[(offset + i) % anchors.length];
      const [u, v, span] = candidate.frame;
      center = u + span * (.5 + (nextRandom() - .5) * c.PHOTO_ANCHOR_JITTER);
      size = span * album.PAGE_WIDTH * c.PHOTO_SIZE_SCALE * depthScale;
      const z = (v - .5) * album.PAGE_DEPTH + span * album.PAGE_WIDTH *
        (.5 + (nextRandom() - .5) * c.PHOTO_ANCHOR_JITTER);
      const y = album.COVER_DEPTH + Math.max(1, candidate.count) * album.PAGE_THICKNESS;
      origin.set(candidate.side * (album.SPINE_GAP + center * album.PAGE_WIDTH), y + arch(center) + .013, z);
      book.localToWorld(origin);
      let crowded = false;
      for (const other of slots) {
        if (clock - other.birth >= c.EMIT_CROWD_TIME) continue;
        const spacing = c.EMIT_CROWD_WIDTH * Math.max(other.width, size);
        if (origin.distanceToSquared(other.origin) < spacing * spacing) {
          crowded = true;
          break;
        }
      }
      if (!crowded) { anchor = candidate; break; }
    }
    if (!anchor) return false;
    slot.origin.copy(origin);
    const slope = (album.OPEN_ARCH * Math.PI * Math.cos(Math.PI * center) + album.FREE_EDGE_LIFT) /
      album.PAGE_WIDTH * anchor.side;
    slot.angle = radians(random(c.PHOTO_ROTATION));
    slot.rest.copy(book.quaternion).multiply(twist.setFromAxisAngle(zAxis, Math.atan(slope))).multiply(flat);
    slot.rest.multiply(twist.setFromAxisAngle(zAxis, slot.angle));
    const { mesh, material } = slot;
    material.depthWrite = true;
    const uniforms = material.uniforms;
    uniforms.curvature.value.set(center, Math.PI * size / album.PAGE_WIDTH * anchor.side, album.OPEN_ARCH / size);
    let texture = Math.floor(nextRandom() * (textures.length - (lastDoodle >= 0 ? 1 : 0)));
    if (lastDoodle >= 0 && texture >= lastDoodle) texture++;
    lastDoodle = texture;
    uniforms.doodle.value = textures[texture];
    uniforms.whiteMix.value = 0;
    const [far, near] = c.PHOTO_DEPTH_SCALE;
    uniforms.opacity.value = slot.opacity = mix(.82, 1, clamp((depthScale - far) / (near - far)));
    slot.width = size;
    slot.birth = clock;
    slot.liftTime = random(c.LIFT_CORNER_TIME);
    slot.morphTime = random(c.MORPH_DURATION);
    // 按相框的屏幕起点反推巡航速度，使高低不同的起点尽量在目标拍长内飞完。
    const flightTime = random(c.CRANE_FLIGHT_TIME);
    const startY = (1 - probe.copy(slot.origin).project(camera).y) * .5;
    const distance = startY - (1 - c.CRANE_FADE_END);
    const ramp = c.CRANE_ACCEL_TIME * .5;
    const acceleratedDistance = c.CRANE_RISE_SPEED_START * (slot.liftTime * .5 + ramp);
    const cruise = (distance - acceleratedDistance) / (flightTime - slot.liftTime - ramp);
    const [slow, fast] = c.CRANE_RISE_SPEED_END;
    slot.cruise = Math.max(slow * (1 - c.CRANE_RISE_SPEED_VARIATION),
      Math.min(fast * (1 + c.CRANE_RISE_SPEED_VARIATION), cruise));
    slot.debrisCount = debrisCount;
    slot.shed = 0;
    slot.crane = null;
    slot.folding = false;
    mesh.position.copy(slot.origin);
    mesh.quaternion.copy(slot.rest);
    mesh.scale.setScalar(size);
    mesh.visible = true;
    count++;
    frameGlow(slot, anchor);
    return true;
  }

  function shedEdges(slot, progress) {
    const total = Math.floor(progress * slot.debrisCount + .00001);
    if (total === slot.shed) return;
    const { mesh } = slot;
    mesh.updateMatrixWorld(true);
    while (slot.shed < total) {
      const perimeter = 4 * (slot.shed++ + .5) / slot.debrisCount;
      const edge = Math.floor(perimeter), t = perimeter - edge - .5;
      const x = edge === 0 ? t : edge === 1 ? .5 : edge === 2 ? -t : -.5;
      const y = edge === 0 ? .5 : edge === 1 ? -t : edge === 2 ? -.5 : t;
      particle.set(x, y * c.PHOTO_ASPECT, c.PHOTO_THICKNESS * .5).applyMatrix4(mesh.matrixWorld);
      dust.emitDebris(particle, (2 * debrisRandom() - 1) * c.DEBRIS_INITIAL_SPEED,
        debrisRandom() * c.DEBRIS_INITIAL_SPEED, mix(c.DEBRIS_LIFE_MIN, c.DEBRIS_LIFE_MAX, debrisRandom()),
        mix(c.DEBRIS_SIZE_MIN, c.DEBRIS_SIZE_MAX, debrisRandom()),
        debrisRandom() < c.DUST_GOLD_RATIO ? 1 : 0, debrisRandom(),
        mix(...c.DEBRIS_TWINKLE_HZ, debrisRandom()));
    }
  }

  function morphPaper(slot, airAge, viewScale, liftRise) {
    const { mesh, material } = slot;
    if (!slot.folding) {
      slot.folding = true;
      material.depthWrite = false;
      // 以精确的变形起点取样，避免掉帧后把纸鹤生成在另一处。
      const rise = liftRise + craneRiseDistance(c.MORPH_START_DELAY, slot.cruise);
      morphOrigin.copy(slot.origin).addScaledVector(up, rise * viewScale);
      slot.crane = cranes.begin(morphOrigin, slot.width, heading, c.MORPH_START_DELAY, slot.cruise);
      slot.craneId = slot.crane?.flightId;
    }
    if (slot.crane && (slot.crane.flightId !== slot.craneId || slot.crane.state !== 'forming')) slot.crane = null;
    const progress = clamp((airAge - c.MORPH_START_DELAY) / slot.morphTime);
    const fold = smooth(progress);
    const [whiteFrom, whiteTo] = c.CRANE_WHITE_RANGE;
    const [fadeFrom, fadeTo] = c.CRANE_CROSSFADE_RANGE;
    const reveal = smooth(clamp((progress - fadeFrom) / (fadeTo - fadeFrom)));
    if (slot.crane) {
      cranes.fold(slot.crane, airAge, progress, reveal);
      mesh.position.copy(slot.crane.root.position);
    }
    const side = slot.crane?.side ?? 1;
    foldPose.copy(heading).multiply(twist.setFromAxisAngle(foldAxis, side * radians(c.CRANE_PAPER_TURN_DEG)));
    mesh.quaternion.copy(heading).slerp(foldPose, fold);
    mesh.scale.x = slot.width * mix(1, c.CRANE_PAPER_END_SCALE, fold);
    material.uniforms.whiteMix.value = smooth(clamp((progress - whiteFrom) / (whiteTo - whiteFrom)));
    material.uniforms.opacity.value = slot.opacity * (1 - reveal);
    shedEdges(slot, progress);
    if (progress >= 1) {
      if (slot.crane) cranes.launch(slot.crane);
      slot.crane = null;
      mesh.visible = false;
      count--;
    }
  }

  function schedule(launches, anchors) {
    const firstTime = album.INTRO_WIND_DURATION + c.EMIT_AFTER_WIND;
    if (!textures || clock < firstTime) return;
    // 第一张直接由开场计时触发；之后沿用翻页出片。
    if (!hasFirstPhoto) {
      if (anchors.length) hasFirstPhoto = emit(anchors);
      return;
    }
    const elapsed = clamp((clock - firstTime) / c.EMIT_RAMP_SECONDS);
    const probability = mix(c.EMIT_PROB_START, c.EMIT_PROB_END, elapsed);
    for (let i = 0; i < launches && count < limit; i++) {
      if (nextRandom() >= probability) continue;
      const request = pending.find(item => !item.remaining);
      if (!request) break;
      request.remaining = nextRandom() < c.EMIT_DOUBLE_PROB ? 2 : 1;
      request.due = clock;
      request.deadline = clock + c.EMIT_MAX_DELAY;
    }
    for (const request of pending) {
      if (!request.remaining || clock < request.due) continue;
      if (count >= limit || clock > request.deadline) { request.remaining = 0; continue; }
      if (!anchors.length || !emit(anchors)) { request.due = clock + c.EMIT_RETRY_DELAY; continue; }
      request.remaining--;
      request.due = clock + c.EMIT_DOUBLE_DELAY;
      request.deadline = request.due + c.EMIT_MAX_DELAY;
    }
  }

  function update(dt, anchors, launches) {
    if (dt <= 0) return;
    clock += dt;
    // 先推进已经起飞的鹤，交接帧不额外推进一次。
    cranes.update(dt);
    schedule(launches, anchors);
    up.set(0, 1, 0).applyQuaternion(camera.quaternion);
    pushes.count = 0;
    for (const slot of slots) {
      const { mesh, frame, material } = slot;
      if (!mesh.visible) continue;
      const age = clock - slot.birth;
      const lift = clamp(age / slot.liftTime);
      const airAge = Math.max(0, age - slot.liftTime);
      const opacity = 1 - clamp(age / c.PHOTO_FRAME_FLASH);
      frame.material.opacity = opacity * .74;
      frame.visible = opacity > 0;
      const viewScale = -probe.copy(slot.origin).applyMatrix4(camera.matrixWorldInverse).z *
        2 * Math.tan(radians(camera.fov / 2));
      // 掀角阶段从零加速，离页时恰好接到纸鹤的初速。
      const liftRise = c.CRANE_RISE_SPEED_START * slot.liftTime * lift ** 3 * (1 - .5 * lift);
      const rise = liftRise + craneRiseDistance(airAge, slot.cruise);
      mesh.position.copy(slot.origin).addScaledVector(up, rise * viewScale);
      heading.copy(camera.quaternion).multiply(twist.setFromAxisAngle(zAxis, slot.angle));
      mesh.quaternion.copy(slot.rest).slerp(heading, smooth(lift));
      material.uniforms.peel.value = Math.sin(Math.PI * lift) * .57;
      material.uniforms.arch.value = 1 - smooth(lift);

      if (airAge >= c.MORPH_START_DELAY) morphPaper(slot, airAge, viewScale, liftRise);
      if (mesh.visible && c.PHOTO_DISTURBS_TASSELS && lift > .5) {
        probe.copy(mesh.position).project(camera);
        const i = pushes.count * 2;
        pushes.xy[i] = (probe.x + 1) * width * .5;
        pushes.xy[i + 1] = (1 - probe.y) * height * .5;
        pushes.count++;
      }
    }
    dust.update(dt);
  }

  function clear() {
    for (const slot of slots) { slot.mesh.visible = false; slot.frame.visible = false; slot.birth = -Infinity; }
    clock = count = pushes.count = 0;
    hasFirstPhoto = false;
    for (const request of pending) request.remaining = 0;
    dust.clear();
    cranes.clear();
  }

  return {
    group, pushes, update, clear,
    get craneCount() { return cranes.count; },
    get particleCount() { return dust.count; },
    fit(w, h, mobile, ratio) {
      width = w; height = h;
      const layout = mobile ? 'mobile' : 'desktop';
      limit = c.PHOTO_MAX_ONSCREEN[layout];
      debrisCount = c.DEBRIS_COUNT[layout];
      for (let i = slots.length - 1; i >= 0 && count > limit; i--) {
        if (!slots[i].mesh.visible) continue;
        const { crane, craneId } = slots[i];
        if (crane?.flightId === craneId && crane?.state === 'forming') cranes.drop(crane);
        slots[i].mesh.visible = slots[i].frame.visible = false;
        count--;
      }
      pushes.count = 0;
      dust.fit(mobile, ratio, h);
      cranes.fit(w, h, mobile, ratio);
    },
    destroy() {
      disposed = true;
      cranes.destroy();
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
