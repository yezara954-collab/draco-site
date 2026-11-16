import { album, picture, photoFlight as c } from './config.js';
import { arch } from './picture-album-paper.js';
import { loadPhotoTextures, photoMaterial } from './picture-photo-art.js';
import { makePhotoDust } from './picture-photo-dust.js';
import { makeCraneFlight } from './picture-crane.js';

const clamp = t => Math.min(1, Math.max(0, t));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const radians = degrees => degrees * Math.PI / 180;

export function makePhotoFlight(T, scene, camera, book) {
  const group = new T.Group();
  scene.add(group);
  const dust = makePhotoDust(T, group);
  const cranes = makeCraneFlight(T, group, camera, book, dust);
  const capacity = Math.max(c.PHOTO_MAX_ONSCREEN.desktop, c.PHOTO_MAX_ONSCREEN.mobile);
  const geometry = new T.BoxGeometry(1, c.PHOTO_ASPECT, c.PHOTO_THICKNESS, 8, 10, 1);
  const right = new T.Vector3();
  const up = new T.Vector3();
  const probe = new T.Vector3();
  const particle = new T.Vector3();
  const driftOffset = new T.Vector3();
  const origin = new T.Vector3();
  const flat = new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2);
  const zAxis = new T.Vector3(0, 0, 1);
  const paperAxis = new T.Vector3();
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
    return { mesh, material, frame, framePositions, origin: new T.Vector3(), rest: new T.Quaternion(), width: 1, birth: -Infinity };
  });

  let textures, disposed = false;
  let width, height, limit = capacity, count = 0, clock = 0, lastDoodle = -1;
  let cols = c.DISSOLVE_GRID_COLS.desktop, rows = c.DISSOLVE_GRID_ROWS.desktop;
  let hasFirstPhoto = false;
  const pending = Array.from({ length: capacity }, () => ({ remaining: 0, due: 0, deadline: 0 }));
  // 相纸有自己的随机序列，出片与喷尘不会重新排列翻页的随机节奏。
  const entropy = new Uint32Array(1);
  globalThis.crypto.getRandomValues(entropy);
  let seed = entropy[0];
  function nextRandom() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const random = ([a, b]) => mix(a, b, nextRandom());
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

  function pickLane() {
    let lane = 0, best = -1;
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = nextRandom() * 2 - 1;
      let separation = 2;
      for (const other of slots) {
        if (other.mesh.visible && clock - other.birth < .84) {
          separation = Math.min(separation, Math.abs(candidate - other.lane));
        }
      }
      if (separation > best) { lane = candidate; best = separation; }
      if (best > .45) break;
    }
    return lane;
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
    const uniforms = material.uniforms;
    uniforms.curvature.value.set(center, Math.PI * size / album.PAGE_WIDTH * anchor.side, album.OPEN_ARCH / size);
    let texture = Math.floor(nextRandom() * (textures.length - (lastDoodle >= 0 ? 1 : 0)));
    if (lastDoodle >= 0 && texture >= lastDoodle) texture++;
    lastDoodle = texture;
    uniforms.doodle.value = textures[texture];
    uniforms.detached.value = 0;
    uniforms.grid.value.set(cols, rows);
    const [far, near] = c.PHOTO_DEPTH_SCALE;
    uniforms.opacity.value = slot.opacity = mix(.82, 1, clamp((depthScale - far) / (near - far)));
    slot.width = size;
    slot.birth = clock;
    slot.rise = c.PHOTO_RISE_SPEED * (1 + (nextRandom() * 2 - 1) * c.PHOTO_SPEED_VARIATION);
    slot.lane = pickLane();
    slot.spin = radians(c.PHOTO_SPIN_SPEED) * (nextRandom() * 2 - 1);
    slot.phase = nextRandom() * 6.283;
    slot.targetY = picture.ground.y - random([c.PHOTO_DISSOLVE_HEIGHT_MIN, c.PHOTO_DISSOLVE_HEIGHT_MAX]);
    slot.duration = random([c.PHOTO_DISSOLVE_DURATION_MIN, c.PHOTO_DISSOLVE_DURATION_MAX]);
    slot.cols = cols;
    slot.rows = rows;
    slot.dy = slot.wind = slot.released = slot.cells = 0;
    mesh.position.copy(slot.origin);
    mesh.quaternion.copy(slot.rest);
    mesh.scale.setScalar(size);
    mesh.visible = true;
    count++;
    frameGlow(slot, anchor);
    return true;
  }

  function detachCells(slot, total, viewScale) {
    const { mesh, cols: columns, rows: lines } = slot;
    mesh.updateMatrixWorld(true);
    while (slot.cells < total) {
      const index = slot.cells++;
      const column = Math.floor(index / lines);
      const next = index % lines;
      const row = column % 2 ? lines - 1 - next : next;
      const x = (column + .5) / columns - .5;
      const y = ((row + .5) / lines - .5) * c.PHOTO_ASPECT;
      particle.set(x, y, c.PHOTO_THICKNESS * .5).applyMatrix4(mesh.matrixWorld);
      const style = (nextRandom() < c.DUST_GLINT_CHANCE ? 2 : 0) + (nextRandom() < c.DUST_GOLD_RATIO ? 1 : 0);
      driftOffset.copy(right).multiplyScalar(viewScale * random(c.DUST_DRIFT_RIGHT))
        .addScaledVector(up, viewScale * random(c.DUST_DRIFT_UP));
      dust.emit(particle, driftOffset, slot.duration, mix(c.DUST_SIZE_MIN, c.DUST_SIZE_MAX, nextRandom()), style,
        c.DUST_ALPHA_MAX, nextRandom(), slot.crane, index);
    }
    slot.material.uniforms.detached.value = slot.cells;
  }

  function schedule(launches, anchors) {
    const firstTime = album.INTRO_WIND_DURATION + c.EMIT_AFTER_WIND;
    // 用接近开场结尾的起翻预约第一张，跨过翻页换向时也能准时揭开。
    if (launches && !hasFirstPhoto && clock >= album.INTRO_WIND_DURATION - .5 &&
        !pending.some(request => request.remaining)) {
      pending[0].remaining = 1;
      pending[0].due = Math.max(clock, firstTime);
      pending[0].deadline = pending[0].due + c.EMIT_MAX_DELAY;
    }
    if (!textures || clock < firstTime) return;
    const elapsed = clamp((clock - firstTime) / Math.max(.01, c.EMIT_RAMP_SECONDS - firstTime));
    const probability = mix(c.EMIT_PROB_START, c.EMIT_PROB_END, elapsed);
    for (let i = 0; i < launches && count < limit; i++) {
      if (!hasFirstPhoto || nextRandom() >= probability) continue;
      const request = pending.find(item => !item.remaining);
      if (!request) break;
      request.remaining = hasFirstPhoto && nextRandom() < c.EMIT_DOUBLE_PROB ? 2 : 1;
      request.due = clock;
      request.deadline = clock + c.EMIT_MAX_DELAY;
    }
    for (const request of pending) {
      if (!request.remaining || clock < request.due) continue;
      if (count >= limit || clock > request.deadline) { request.remaining = 0; continue; }
      if (!anchors.length || !emit(anchors)) { request.due = clock + c.EMIT_RETRY_DELAY; continue; }
      hasFirstPhoto = true;
      request.remaining--;
      request.due = clock + c.EMIT_DOUBLE_DELAY;
      request.deadline = request.due + c.EMIT_MAX_DELAY;
    }
  }

  function update(dt, anchors, launches, readWind) {
    clock += dt;
    schedule(launches, anchors);
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
      probe.copy(slot.origin).project(camera);
      const originY = (1 - probe.y) * .5;
      const aspect = width / height;
      const originX = (probe.x + 1) * .5 * aspect;
      // 半对角线给未脱落的边角留足余量，整段消散时至少保有顶部安全边距。
      const halfCard = slot.width / viewScale * .5 * Math.hypot(1, c.PHOTO_ASPECT);
      const clearance = c.PHOTO_DISSOLVE_TOP_ROOM + halfCard * 1.06 + c.PHOTO_BOB;
      if (lift >= 1) {
        probe.copy(mesh.position).project(camera);
        const wind = readWind?.(clamp((probe.x + 1) * .5)) ?? 0;
        slot.wind = Math.min(.038, Math.max(-.038, slot.wind + dt * wind * c.PHOTO_WIND_SENSITIVITY));
        slot.dy += dt * slot.rise * (slot.released ? .28 : 1);
      }
      const rise = Math.max(0, Math.min(originY - clearance, slot.dy + .04 * open));
      const u = clamp(rise / .64);
      const [left, bend, tail] = c.WIND_LANE_CURVE;
      const curve = -left * Math.sin(2 * Math.PI * u) + bend * smooth(u) + tail * u;
      const spread = mix(c.WIND_LANE_WIDTH[0], c.WIND_LANE_WIDTH[1], u);
      const laneX = aspect * .50 + curve + spread * slot.lane;
      const merge = smooth(clamp(rise / .33));
      const drift = mix(originX, laneX, merge) - originX + open * .009 +
        (slot.wind + .006 * Math.sin(airtime * 1.8 + slot.phase)) * merge;
      const bound = Math.min(halfCard, aspect * .14);
      const dx = mix(originX, Math.max(bound, Math.min(aspect - bound, originX + drift)), open) - originX;
      const bob = c.PHOTO_BOB * Math.sin(airtime * 3.7 + slot.phase) * clamp(airtime * 2);
      mesh.position.copy(slot.origin)
        .addScaledVector(right, dx * viewScale)
        .addScaledVector(up, (rise + bob) * viewScale);
      const roll = radians(c.PHOTO_MAX_ROLL) * (.57 * Math.sin(clock * .95 + rise * 2.4) +
        .28 * Math.sin(airtime * .7 + slot.phase)) + slot.angle * .19;
      const tiltLimit = radians(c.PHOTO_MAX_TILT);
      const tilt = tiltLimit * Math.sin(airtime * slot.spin / Math.max(.001, tiltLimit));
      heading.copy(camera.quaternion).multiply(twist.setFromAxisAngle(zAxis, roll))
        .multiply(twist.setFromAxisAngle(spinAxis, tilt));
      mesh.quaternion.copy(slot.rest).slerp(heading, open);
      material.uniforms.peel.value = Math.sin(Math.PI * lift) * .57;
      material.uniforms.arch.value = 1 - open;

      if (c.PHOTO_DISTURBS_TASSELS && lift > .5) {
        probe.copy(mesh.position).project(camera);
        const i = pushes.count * 2;
        pushes.xy[i] = (probe.x + 1) * width * .5;
        pushes.xy[i + 1] = (1 - probe.y) * height * .5;
        pushes.count++;
      }
      if (!slot.released && originY - rise <= Math.max(slot.targetY, clearance) + .0001) {
        slot.released = clock;
        slot.crane = cranes.begin(mesh.position, slot.width, slot.duration, slot.cols * slot.rows);
        slot.craneOrder = slot.crane?.formOrder;
        slot.paperTurn = 0;
      }
      if (!slot.released) continue;
      const progress = clamp((clock - slot.released) / slot.duration);
      // 相纸仍照原顺序脱格，只让留下的纸片朝鹤收小并变淡。
      if (slot.crane && (slot.crane.cancelled || slot.crane.formOrder !== slot.craneOrder)) slot.crane = null;
      const settle = smooth(progress);
      const aim = (slot.crane?.direction ?? roll) - roll;
      const delta = Math.atan2(Math.sin(aim), Math.cos(aim));
      const turnLimit = radians(c.CRANE_PAPER_TURN_DEG);
      const turn = settle * Math.max(-turnLimit, Math.min(turnLimit, delta));
      slot.paperTurn = mix(slot.paperTurn, turn, 1 - Math.exp(-dt / c.CRANE_POSE_RESPONSE));
      mesh.quaternion.premultiply(twist.setFromAxisAngle(paperAxis.copy(zAxis).applyQuaternion(camera.quaternion), slot.paperTurn));
      mesh.scale.setScalar(slot.width * mix(1, c.CRANE_PAPER_END_SCALE, settle));
      detachCells(slot, Math.floor(progress * slot.cols * slot.rows + .00001), viewScale);
      material.uniforms.opacity.value = slot.opacity * (1 - settle);
      if (progress >= 1) {
        mesh.visible = false;
        count--;
      }
    }
    cranes.update(dt);
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
    fit(w, h, mobile, ratio) {
      width = w; height = h;
      const layout = mobile ? 'mobile' : 'desktop';
      limit = c.PHOTO_MAX_ONSCREEN[layout];
      cols = c.DISSOLVE_GRID_COLS[layout];
      rows = c.DISSOLVE_GRID_ROWS[layout];
      for (let i = slots.length - 1; i >= 0 && count > limit; i--) {
        if (!slots[i].mesh.visible) continue;
        slots[i].mesh.visible = slots[i].frame.visible = false;
        count--;
      }
      pushes.count = 0;
      dust.fit(mobile, ratio);
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
