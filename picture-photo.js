import { album, picture, photoFlight as c, photoUpload as upload } from './config.js';
import { arch } from './picture-album-paper.js';
import { photoMaterial } from './picture-photo-art.js';
import { makePhotoDust } from './picture-photo-dust.js';
import { craneRiseDistance, makeCraneFlight } from './picture-crane.js';

const clamp = t => Math.min(1, Math.max(0, t));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const radians = degrees => degrees * Math.PI / 180;

export function makePhotoFlight(T, scene, camera, book, gallery, stagePriority, liftPhoto) {
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

  let width, height, limit = capacity, count = 0, clock = 0;
  let debrisCount;
  let hasFirstPhoto = false;
  const priorities = [];
  const seen = new Set();
  let lastEntry = null, lastPool, priorityAt = 0;
  const pending = Array.from({ length: capacity }, () => ({ remaining: 0, due: 0, deadline: 0 }));
  // 相纸有自己的随机序列，出片与喷尘不会重新排列翻页的随机节奏。
  const entropy = new Uint32Array(3);
  globalThis.crypto.getRandomValues(entropy);
  let seed = entropy[0], debrisSeed = entropy[1], uploadSeed = entropy[2];
  function nextRandom() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const random = ([a, b]) => mix(a, b, nextRandom());
  function debrisRandom() {
    debrisSeed = (Math.imul(debrisSeed, 1664525) + 1013904223) >>> 0;
    return debrisSeed / 4294967296;
  }
  function uploadRandom() {
    uploadSeed = (Math.imul(uploadSeed, 1664525) + 1013904223) >>> 0;
    return uploadSeed / 4294967296;
  }

  function clearPhotos() {
    for (const slot of slots) {
      if (!slot.entry || slot.entry.isDefault) continue;
      slot.entry = slot.mesh.visible ? gallery.pick() : null;
      slot.material.uniforms.photoMap.value = slot.entry?.texture ?? null;
    }
    priorities.length = 0;
    lastEntry = null;
    seen.clear();
    priorityAt = 0;
  }

  function frameGlow(slot, anchor) {
    const { frame, framePositions } = slot;
    const { frame: [u, v, span], sin, cos } = anchor.slot;
    const aspect = album.PAGE_WIDTH / album.PAGE_DEPTH;
    const base = album.COVER_DEPTH + Math.max(1, anchor.count) * album.PAGE_THICKNESS;
    for (let edge = 0; edge < 4; edge++) {
      for (let i = 0; i < 8; i++) {
        const f = i / 8;
        const h = span * ((edge === 0 ? f : edge === 1 ? 1 : edge === 2 ? 1 - f : 0) - .5);
        const d = span * c.PHOTO_ASPECT * ((edge === 0 ? 0 : edge === 1 ? f : edge === 2 ? 1 : 1 - f) - .5);
        const x = u + h * cos - d * sin;
        const z = v + (h * sin + d * cos) * aspect;
        probe.set(anchor.side * (album.SPINE_GAP + x * album.PAGE_WIDTH), base + arch(x) + .008,
          (z - .5) * album.PAGE_DEPTH);
        book.localToWorld(probe);
        framePositions.setXYZ(edge * 8 + i, probe.x, probe.y, probe.z);
      }
    }
    framePositions.needsUpdate = true;
    frame.visible = true;
  }

  function emit(anchors, preferred = null) {
    let slot;
    for (const item of slots) if (!item.mesh.visible) { slot = item; break; }
    if (!slot) return false;
    const offset = Math.floor(nextRandom() * anchors.length);
    const depthScale = random(c.PHOTO_DEPTH_SCALE);
    let anchor, center, size;
    // 可见槽位决定飞出哪张。默认的单一照片池用完一轮后再重复。
    const singlePool = upload.MIX_DEFAULT_RATIO === 0;
    if (lastPool !== gallery.poolKey) { seen.clear(); lastPool = gallery.poolKey; }
    if (!preferred && singlePool && !gallery.unseen(seen, lastEntry)) seen.clear();
    const avoidRepeat = !preferred && anchors.some(({ slot }) =>
      slot.available && slot.entry !== lastEntry && (!singlePool || !seen.has(slot.entry)));
    // 优先试另一侧的相框。若都太近，保留请求至下次重试。
    for (let i = 0; i < anchors.length; i++) {
      const candidate = anchors[(offset + i) % anchors.length];
      const source = candidate.slot;
      if (!source.available || (preferred && source.entry !== preferred) ||
          (avoidRepeat && source.entry === lastEntry) || (!preferred && singlePool && seen.has(source.entry))) continue;
      const [u, v, span] = source.frame;
      center = u;
      size = span * album.PAGE_WIDTH;
      const z = (v - .5) * album.PAGE_DEPTH;
      const y = album.COVER_DEPTH + Math.max(1, candidate.count) * album.PAGE_THICKNESS;
      origin.set(candidate.side * (album.SPINE_GAP + center * album.PAGE_WIDTH), y + arch(center) + .003, z);
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
    if (!anchor) {
      if (!preferred && singlePool) {
        const next = gallery.unseen(seen, lastEntry);
        if (next && !anchors.some(({ slot }) => slot.entry === next && slot.available)) stagePriority(anchors, next);
      }
      return false;
    }
    // 优先给用户照片留好一只鹤和一条未占用的航线，再掀起相纸。
    const reservation = preferred ? cranes.reserve(origin) : null;
    if (preferred && !reservation) return false;
    slot.origin.copy(origin);
    slot.angle = radians(random(c.PHOTO_ROTATION));
    slot.rest.copy(book.quaternion).multiply(flat);
    slot.rest.multiply(twist.setFromAxisAngle(zAxis, -anchor.side * radians(anchor.slot.frame[3])));
    const { mesh, material } = slot;
    material.depthWrite = true;
    const uniforms = material.uniforms;
    uniforms.curvature.value.set(center, album.OPEN_ARCH / size, album.FREE_EDGE_LIFT / size);
    const scaleOnPage = size / album.PAGE_WIDTH;
    uniforms.pageAxis.value.set(scaleOnPage * anchor.side * anchor.slot.cos, scaleOnPage * anchor.slot.sin);
    slot.entry = lastEntry = anchor.slot.entry;
    seen.add(slot.entry);
    uniforms.photoMap.value = slot.entry.texture;
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
    slot.crane = reservation;
    slot.craneId = reservation?.flightId;
    slot.folding = false;
    mesh.position.copy(slot.origin);
    mesh.quaternion.copy(slot.rest);
    mesh.scale.setScalar(size);
    mesh.visible = true;
    count++;
    liftPhoto(anchor);
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
      const reserved = slot.crane?.flightId === slot.craneId && slot.crane?.state === 'reserved'
        ? slot.crane : null;
      slot.crane = cranes.begin(morphOrigin, slot.width, heading, c.MORPH_START_DELAY, slot.cruise, reserved);
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
    if (!anchors.length || clock < firstTime) return;
    if (priorities.length) {
      if (clock < priorityAt || count >= limit || !anchors.length) return;
      stagePriority(anchors, priorities[0]);
      if (emit(anchors, priorities[0])) {
        hasFirstPhoto = true;
        priorities.shift();
        priorityAt = clock + mix(...upload.UPLOAD_BURST_SPACING, uploadRandom());
      } else priorityAt = clock + c.EMIT_RETRY_DELAY;
      return;
    }
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

  function update(dt, anchors, launches, paused) {
    if (dt <= 0) return;
    clock += dt;
    // 先推进已经起飞的鹤，交接帧不额外推进一次。
    cranes.update(dt);
    if (!paused) schedule(launches, anchors);
    else {
      if (priorityAt > 0) priorityAt += dt;
      for (const request of pending) if (request.remaining) {
        request.due += dt;
        request.deadline += dt;
      }
    }
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
      material.uniforms.opacity.value = mix(1, slot.opacity, smooth(lift));

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
    clock = count = pushes.count = priorityAt = 0;
    hasFirstPhoto = false;
    for (const request of pending) request.remaining = 0;
    dust.clear();
    cranes.clear();
  }

  return {
    group, pushes, update, clear, clearPhotos,
    queuePhoto(entry) { priorities.push(entry); },
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
        if (crane?.flightId === craneId && (crane?.state === 'forming' || crane?.state === 'reserved')) cranes.drop(crane);
        slots[i].mesh.visible = slots[i].frame.visible = false;
        count--;
      }
      pushes.count = 0;
      dust.fit(mobile, ratio, h);
      cranes.fit(w, h, mobile, ratio);
    },
    destroy() {
      priorities.length = 0;
      cranes.destroy();
      dust.destroy();
      for (const { material, frame } of slots) {
        material.dispose(); frame.material.dispose(); frame.geometry.dispose();
      }
      geometry.dispose();
      scene.remove(group);
    },
  };
}
