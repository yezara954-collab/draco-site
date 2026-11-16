import { photoFlight as c, picture } from './config.js';
import { BODY_TRIANGLES, WING_TRIANGLES_LEFT, createCrane } from './crane_geometry.js';

const clamp = t => Math.max(0, Math.min(1, t));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const radians = Math.PI / 180;
const goldenStep = (Math.sqrt(5) - 1) / 2;

function surfaceTable() {
  let area = 0;
  return [BODY_TRIANGLES, WING_TRIANGLES_LEFT, WING_TRIANGLES_LEFT].flatMap((triangles, part) =>
    triangles.map(([a, b, d]) => {
      const [x, y, z] = b.map((value, i) => value - a[i]);
      const [u, v, w] = d.map((value, i) => value - a[i]);
      area += Math.hypot(y * w - z * v, z * u - x * w, x * v - y * u) * .5;
      return { a, b, d, part, area };
    }));
}
const surface = surfaceTable();
const surfaceArea = surface.at(-1).area;

export function makeCraneFlight(T, parent, camera, book, dust) {
  let randomState = crypto.getRandomValues(new Uint32Array(1))[0];
  function random() {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  }
  const range = ([a, b]) => mix(a, b, random());
  const probe = new T.Vector3(), head = new T.Vector3(), tail = new T.Vector3();
  const sample = new T.Vector3(), offset = new T.Vector3(), still = new T.Vector3();
  const localUp = new T.Vector3(0, 1, 0), localX = new T.Vector3(1, 0, 0), localZ = new T.Vector3(0, 0, 1);
  const rotation = new T.Quaternion();
  const pearl = new T.Color(c.CRANE_PEARL), warm = new T.Color(c.CRANE_WARM);
  const maxGrid = Math.max(c.DISSOLVE_GRID_COLS.desktop * c.DISSOLVE_GRID_ROWS.desktop,
    c.DISSOLVE_GRID_COLS.mobile * c.DISSOLVE_GRID_ROWS.mobile);
  const maxCranes = Math.max(c.CRANE_COUNT_MAX.desktop, c.CRANE_COUNT_MAX.mobile);
  const maxFormations = maxCranes + Math.max(c.PHOTO_MAX_ONSCREEN.desktop, c.PHOTO_MAX_ONSCREEN.mobile);
  const minAngle = c.CRANE_MIN_ANGLE_SEP;
  let aspect = 1, limit = maxCranes, active = 0, serial = 0;
  let centerX = .5, centerY = .75, bookDepth = 1, pixelRatio = 1;

  const slots = Array.from({ length: maxFormations }, () => {
    const face = new T.ShaderMaterial({
      transparent: true, side: T.DoubleSide, depthTest: false, depthWrite: false,
      uniforms: { opacity: { value: 0 }, pearl: { value: pearl }, warm: { value: warm },
        alphaMin: { value: c.CRANE_FACE_ALPHA[0] }, alphaMax: { value: c.CRANE_FACE_ALPHA[1] } },
      vertexShader: `
        varying vec3 vNormal, vEye;
        void main() {
          vec4 view = modelViewMatrix * vec4(position, 1.0);
          vNormal = normalMatrix * normal;
          vEye = -view.xyz;
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: `
        varying vec3 vNormal, vEye;
        uniform vec3 pearl, warm;
        uniform float opacity, alphaMin, alphaMax;
        void main() {
          vec3 normal = normalize(vNormal);
          float edge = pow(1.0 - abs(dot(normal, normalize(vEye))), 1.4);
          float light = 0.72 + 0.28 * abs(dot(normal, normalize(vec3(-0.5, 0.75, 1.0))));
          gl_FragColor = vec4(mix(pearl, warm, 0.16 * edge) * light,
            opacity * mix(alphaMin, alphaMax, edge));
          #include <colorspace_fragment>
        }`,
    });
    const crease = new T.LineBasicMaterial({
      color: pearl, transparent: true, blending: T.AdditiveBlending, depthTest: false, depthWrite: false,
    });
    const crane = createCrane(T, () => face);
    const meshes = [crane.group.children[0], crane.wingLeftPivot.children[0], crane.wingRightPivot.children[0]];
    const creases = meshes.map(mesh => {
      const line = new T.LineSegments(new T.EdgesGeometry(mesh.geometry, 2), crease);
      mesh.add(line);
      return line;
    });
    const lights = new T.BufferGeometry();
    const specks = new T.BufferAttribute(new Float32Array(c.CRANE_INNER_LIGHTS * 3), 3).setUsage(T.DynamicDrawUsage);
    lights.setAttribute('position', specks);
    const shimmer = new T.ShaderMaterial({
      transparent: true, blending: T.AdditiveBlending, depthTest: false, depthWrite: false,
      uniforms: { opacity: { value: 0 }, pixelRatio: { value: 1 }, pearl: { value: pearl }, warm: { value: warm } },
      vertexShader: `
        varying float vWarm;
        uniform float pixelRatio;
        void main() {
          vWarm = step(0.1, position.z);
          gl_PointSize = 4.0 * pixelRatio;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        varying float vWarm;
        uniform float opacity;
        uniform vec3 pearl, warm;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          gl_FragColor = vec4(mix(pearl, warm, vWarm), (1.0 - smoothstep(0.0, 1.0, d)) * opacity);
          #include <colorspace_fragment>
        }`,
    });
    const points = new T.Points(lights, shimmer);
    points.frustumCulled = false;
    crane.group.add(points);
    parent.add(crane.group);
    crane.group.visible = false;
    return {
      crane, face, crease, creases, meshes, lights, specks, shimmer, points,
      pivots: [crane.group, crane.wingLeftPivot, crane.wingRightPivot],
      targets: new Float32Array(maxGrid * 3), samples: new Float32Array(maxGrid * 3),
      parts: new Uint8Array(maxGrid), previousTail: new T.Vector3(),
      path: new Float64Array(8), state: 'idle',
    };
  });

  function pose(slot, x, y, depth, angle, bank, scale) {
    const { crane } = slot;
    probe.set(0, 0, -depth).applyMatrix4(camera.matrixWorld).project(camera);
    crane.group.position.set(2 * x - 1, 1 - 2 * y, probe.z).unproject(camera);
    // 保持纸鹤前轴与航向一致，绕前轴侧倾以露出两翼的折面。
    crane.group.quaternion.copy(camera.quaternion)
      .multiply(rotation.setFromAxisAngle(localZ, angle))
      .multiply(rotation.setFromAxisAngle(localX, .96 + bank))
      .multiply(rotation.setFromAxisAngle(localUp, .12));
    crane.group.scale.setScalar(scale);
    crane.setWingAngle(mix(c.WING_ANGLE[0], c.WING_ANGLE[1],
      .5 + .5 * Math.sin(slot.age * slot.flap * Math.PI * 2)));
    crane.group.updateMatrixWorld(true);
  }

  function begin(world, width, duration, count) {
    const slot = slots.find(item => item.state === 'idle');
    if (!slot) return null;
    const depth = -probe.copy(world).applyMatrix4(camera.matrixWorldInverse).z;
    probe.copy(world).project(camera);
    slot.fromX = (probe.x + 1) * .5;
    slot.fromY = (1 - probe.y) * .5;
    slot.x = Math.min(.90, slot.fromX + c.CRANE_ASSEMBLY_OFFSET[0] / aspect);
    slot.y = Math.max(.15, slot.fromY - c.CRANE_ASSEMBLY_OFFSET[1]);
    slot.depth = depth;
    slot.size = width * c.CRANE_SIZE_RATIO / 3.97;
    slot.flap = range(c.WING_FLAP_HZ);
    slot.age = slot.elapsed = 0;
    slot.handoff = -1;
    slot.cancelled = false;
    slot.gatherAt = duration * c.CRANE_GATHER_START;
    slot.gatherEnd = Math.max(duration + c.CRANE_GATHER_MIN_TRAVEL, slot.gatherAt + range(c.CRANE_GATHER_TIME));
    slot.count = count;
    slot.restHeading = .20;
    slot.state = 'form';
    slot.crane.group.visible = false;
    for (let i = 0; i < count; i++) {
      const area = random() * surfaceArea;
      const { a, b, d, part } = surface.find(triangle => triangle.area >= area);
      const root = Math.sqrt(random()), v = random() * root;
      const idx = i * 3;
      for (let axis = 0; axis < 3; axis++) {
        slot.samples[idx + axis] = (a[axis] * (1 - root) + b[axis] * (root - v) + d[axis] * v) *
          (part === 2 && axis === 2 ? -1 : 1);
      }
      slot.parts[i] = part;
    }
    return slot;
  }

  function setOpacity(slot, amount) {
    slot.face.uniforms.opacity.value = amount;
    slot.crease.opacity = c.CRANE_LINE_ALPHA * amount;
    slot.shimmer.uniforms.opacity.value = amount * .5;
    for (let i = 0; i < c.CRANE_INNER_LIGHTS; i++) {
      const t = slot.age * (1 + i * .073) + i * 2.4;
      slot.specks.setXYZ(i, .70 * Math.cos(t), .17 + .15 * Math.sin(t * 1.3), .13 * Math.sin(t));
    }
    slot.specks.needsUpdate = true;
  }

  function available(angle) {
    for (const other of slots) {
      if (other.state !== 'ready' && other.state !== 'fly') continue;
      const delta = Math.abs(angle - other.angle) % 360;
      if (Math.min(delta, 360 - delta) < minAngle) return false;
    }
    return true;
  }

  function assignRoute(slot) {
    const sequence = (serial * goldenStep + .19) % 1;
    const weightTotal = c.CRANE_ROUTE_WEIGHT_UP + c.CRANE_ROUTE_WEIGHT_SIDE + c.CRANE_ROUTE_WEIGHT_GROUND;
    const up = c.CRANE_ROUTE_WEIGHT_UP / weightTotal;
    const side = c.CRANE_ROUTE_WEIGHT_SIDE / weightTotal;
    const first = sequence < up ? 0 : sequence < up + side ? 1 : 2;
    for (let fallback = 0; fallback < 3; fallback++) {
      const route = (first + fallback) % 3;
      for (let attempt = 0; attempt < 24; attempt++) {
        const step = ((serial + attempt) * goldenStep + .41) % 1;
        const angle = route === 0 ? mix(...c.CRANE_UP_ANGLE, step) : route === 1
          ? mix(...c.CRANE_SIDE_ANGLES[step < .5 ? 0 : 1], (2 * step) % 1)
          : step < .5 ? 0 : 180;
        if (!available(angle)) continue;
        slot.angle = angle;
        slot.ground = route === 2;
        slot.layer = slot.ground ? c.CRANE_GROUND_LAYER : serial % c.CRANE_LAYER_SCALES.length;
        serial++;
        return true;
      }
    }
    return false;
  }

  function startFlight(slot) {
    const angle = radians * slot.angle;
    const dx = Math.cos(angle) / aspect, dy = -Math.sin(angle);
    const m = c.CRANE_EXIT_MARGIN;
    const distance = Math.min(dx > 0 ? (1 + m - centerX) / dx : (-m - centerX) / dx,
      Math.abs(dy) < .00001 ? Infinity : dy > 0 ? (1 + m - centerY) / dy : (-m - centerY) / dy);
    const endX = centerX + distance * dx;
    const endY = centerY + distance * dy;
    const path = slot.path;
    path[0] = slot.x; path[1] = slot.y;
    if (slot.ground) {
      const groundY = picture.ground.y - mix(...c.CRANE_GROUND_BAND, .5);
      path[2] = mix(slot.x, endX, .06); path[3] = mix(slot.y, groundY, .28);
      path[6] = mix(slot.x, endX, .35); path[7] = groundY;
      const approach = c.CRANE_GROUND_APPROACH;
      // 下滑末端与平飞段匹配高度、切线与速度。
      path[4] = path[6] - (endX - path[6]) * approach / (3 * (1 - approach));
      path[5] = groundY;
    } else {
      const push = .077 * (slot.layer === 1 ? -1 : 1);
      path[2] = mix(slot.x, endX, .30) + dy * push / aspect;
      path[3] = mix(slot.y, endY, .30) - dx * push * aspect;
      path[4] = mix(slot.x, endX, .66) - dy * push / aspect;
      path[5] = mix(slot.y, endY, .66) + dx * push * aspect;
      path[6] = endX; path[7] = endY;
    }
    slot.exitX = endX;
    slot.duration = mix(c.CRANE_FLIGHT_TIME_MIN, c.CRANE_FLIGHT_TIME_MAX, random());
    slot.trailRate = range(c.TRAIL_RATE);
    slot.trailCarry = 0;
    slot.lastTailValid = slot.vanished = false;
    slot.elapsed = 0;
    slot.state = 'fly';
  }

  function retire(slot) {
    if (slot.state === 'ready' || slot.state === 'fly') active--;
    slot.crane.group.visible = false;
    slot.cancelled = true;
    // 星点下一次更新先移除旧引用，之后才能复用这只鹤的槽。
    slot.state = 'retired';
  }

  function flight(slot, dt) {
    const progress = clamp((slot.elapsed += dt) / slot.duration);
    const t = progress * (.51 + .49 * progress);
    const p = slot.path;
    const onFlat = slot.ground && t > c.CRANE_GROUND_APPROACH;
    let x, y, dx, dy, bank = 0;
    if (onFlat) {
      const advance = (t - c.CRANE_GROUND_APPROACH) / (1 - c.CRANE_GROUND_APPROACH);
      x = mix(p[6], slot.exitX, advance); y = p[7]; dx = slot.exitX - p[6]; dy = 0;
    } else {
      const b = slot.ground ? t / c.CRANE_GROUND_APPROACH : t, a = 1 - b;
      x = a ** 3 * p[0] + 3 * a * a * b * p[2] + 3 * a * b * b * p[4] + b ** 3 * p[6];
      y = a ** 3 * p[1] + 3 * a * a * b * p[3] + 3 * a * b * b * p[5] + b ** 3 * p[7];
      dx = a * a * (p[2] - p[0]) + 2 * a * b * (p[4] - p[2]) + b * b * (p[6] - p[4]);
      dy = a * a * (p[3] - p[1]) + 2 * a * b * (p[5] - p[3]) + b * b * (p[7] - p[5]);
      const ddx = a * (p[4] - 2 * p[2] + p[0]) + b * (p[6] - 2 * p[4] + p[2]);
      const ddy = a * (p[5] - 2 * p[3] + p[1]) + b * (p[7] - 2 * p[5] + p[3]);
      bank = c.CRANE_BANK_DEG * radians * Math.tanh((dy * ddx - dx * ddy) * 30 * aspect);
      if (slot.ground) bank *= 1 - smooth(b);
    }
    const heading = Math.atan2(-dy, dx * aspect);
    const launch = smooth(clamp(progress / .22));
    const delta = Math.atan2(Math.sin(heading - slot.restHeading), Math.cos(heading - slot.restHeading));
    const layer = slot.layer;
    const depth = mix(slot.depth, bookDepth * c.CRANE_LAYER_DEPTH[layer], launch);
    const size = slot.size * depth / slot.depth * mix(1, c.CRANE_LAYER_SCALES[layer], launch) * (1 - .34 * t);
    pose(slot, x, y, depth, slot.restHeading + delta * launch, bank, size);
    if (progress >= c.CRANE_FADE_START || x < .025 || x > .975 || y < .025 || y > .975) {
      if (!slot.vanished) {
        slot.vanished = true;
        slot.exitAge = slot.elapsed;
        head.copy(slot.crane.group.position);
        for (let i = 0; i < c.CRANE_VANISH_POINTS; i++) {
          sample.copy(head);
          sample.x += (random() - .5) * size * 2;
          sample.y += (random() - .5) * size * 2;
          offset.set(Math.cos(heading) * size * (1 + random()), Math.sin(heading) * size * (1 + random()), 0)
            .applyQuaternion(camera.quaternion);
          dust.emit(sample, offset, range(c.TRAIL_LIFE), rangeTrailSize(), style(), c.TRAIL_ALPHA_MAX, random());
        }
      }
    }
    const fade = slot.vanished ? 1 - smooth(clamp((slot.elapsed - slot.exitAge) / c.CRANE_EXIT_FADE)) : 1;
    setOpacity(slot, fade * c.CRANE_LAYER_LIGHT[layer]);
    tail.set(-1.85, .98, 0).applyMatrix4(slot.crane.group.matrixWorld);
    if (!slot.lastTailValid) slot.previousTail.copy(tail);
    slot.lastTailValid = true;
    const amount = slot.trailCarry + dt * slot.trailRate * fade;
    const count = Math.floor(amount);
    for (let i = 0; i < count; i++) {
      sample.copy(slot.previousTail).lerp(tail, (i + .5) / count);
      dust.emit(sample, still, range(c.TRAIL_LIFE), rangeTrailSize(), style(), c.TRAIL_ALPHA_MAX, random());
    }
    slot.trailCarry = amount - count;
    slot.previousTail.copy(tail);
    if (!fade || progress === 1) retire(slot);
  }

  function rangeTrailSize() { return mix(c.TRAIL_SIZE_MIN, c.TRAIL_SIZE_MAX, random()); }
  function style() { return (random() < c.DUST_GLINT_CHANCE ? 2 : 0) + (random() < c.DUST_GOLD_RATIO ? 1 : 0); }

  function update(dt) {
    if (book) {
      book.getWorldPosition(probe);
      bookDepth = -head.copy(probe).applyMatrix4(camera.matrixWorldInverse).z;
      probe.project(camera);
      centerX = (probe.x + 1) * .5;
      centerY = (1 - probe.y) * .5;
    }
    for (const slot of slots) {
      if (slot.state === 'idle') continue;
      if (slot.state === 'retired') { slot.state = 'idle'; continue; }
      slot.age += dt;
      if (slot.state === 'fly') { flight(slot, dt); continue; }
      if (slot.state === 'form' && slot.age >= slot.gatherEnd && active < limit && assignRoute(slot)) {
        const order = 4 + (2 - slot.layer) * .2;
        for (const mesh of slot.meshes) mesh.renderOrder = order;
        for (const line of slot.creases) line.renderOrder = order + .04;
        slot.points.renderOrder = order + .06;
        slot.shimmer.uniforms.pixelRatio.value = pixelRatio;
        slot.state = 'ready';
        slot.handoff = 0;
        slot.crane.group.visible = true;
        active++;
      }
      const hover = slot.state === 'ready' ? .003 * Math.sin(slot.handoff * 13) : 0;
      const movement = smooth(clamp(slot.age / slot.gatherEnd));
      const angle = slot.restHeading;
      pose(slot, mix(slot.fromX, slot.x, movement), mix(slot.fromY, slot.y, movement) - hover,
        slot.depth, angle, 0, slot.size);
      for (let i = 0; i < slot.count; i++) {
        const source = slot.pivots[slot.parts[i]];
        sample.fromArray(slot.samples, i * 3).applyMatrix4(source.matrixWorld).toArray(slot.targets, i * 3);
      }
      if (slot.state === 'ready') {
        slot.handoff += dt;
        setOpacity(slot, smooth(clamp(slot.handoff / c.CRANE_FORM_FADE)));
        if (slot.handoff >= c.CRANE_FORM_FADE + c.CRANE_HOVER_TIME) startFlight(slot);
      }
    }
  }

  return {
    begin, update,
    fit(w, h, mobile, ratio) {
      aspect = w / h;
      limit = c.CRANE_COUNT_MAX[mobile ? 'mobile' : 'desktop'];
      pixelRatio = ratio;
      for (let i = slots.length - 1; active > limit && i >= 0; i--) {
        const slot = slots[i];
        if (slot.state === 'ready' || slot.state === 'fly') retire(slot);
      }
    },
    clear() {
      for (const slot of slots) { slot.state = 'idle'; slot.crane.group.visible = false; }
      active = serial = 0;
    },
    destroy() {
      for (const slot of slots) {
        parent.remove(slot.crane.group);
        for (const mesh of slot.meshes) mesh.geometry.dispose();
        for (const line of slot.creases) line.geometry.dispose();
        slot.face.dispose();
        slot.crease.dispose();
        slot.shimmer.dispose();
        slot.lights.dispose();
      }
    },
  };
}
