import { photoFlight as c } from './config.js';
import { createCrane } from './crane_geometry.js';

const clamp = t => Math.max(0, Math.min(1, t));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const DEG = Math.PI / 180, TAU = 2 * Math.PI;

// 对 smoothstep 速度曲线求积分。相纸和纸鹤共用空中时间，交接时速度连续。
export function craneRiseDistance(age, cruise) {
  const ramp = c.CRANE_ACCEL_TIME;
  const t = clamp(age / ramp);
  return c.CRANE_RISE_SPEED_START * age + (cruise - c.CRANE_RISE_SPEED_START) *
    (ramp * t ** 3 * (1 - .5 * t) + Math.max(0, age - ramp));
}

// 仅描相交折面之间的棱线，纸片外沿留给白纸轮廓本身。
function makeCreases(T, geometry) {
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const edges = new Map();
  const vertices = [];
  for (let i = 0; i < positions.count; i += 3) {
    const normal = new T.Vector3().fromBufferAttribute(normals, i);
    for (let j = 0; j < 3; j++) {
      const a = new T.Vector3().fromBufferAttribute(positions, i + j).toArray();
      const b = new T.Vector3().fromBufferAttribute(positions, i + (j + 1) % 3).toArray();
      const first = a.join(','), second = b.join(',');
      const key = first < second ? first + '/' + second : second + '/' + first;
      const edge = edges.get(key);
      if (!edge) edges.set(key, { normal, drawn: false });
      else if (!edge.drawn && Math.abs(edge.normal.dot(normal)) < Math.cos(c.CRANE_CREASE_MIN_DEG * DEG)) {
        vertices.push(...a, ...b);
        edge.drawn = true;
      }
    }
  }
  return new T.BufferGeometry().setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
}

export function makeCraneFlight(T, parent, camera, book, dust) {
  // 纸鹤随机流与翻页、相纸出片相互独立。
  let seed = crypto.getRandomValues(new Uint32Array(1))[0];
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed + .5) / 4294967296;
  }
  const range = ([a, b]) => mix(a, b, random());
  const q = new T.Quaternion(), axisX = new T.Vector3(1, 0, 0);
  const axisY = new T.Vector3(0, 1, 0), axisZ = new T.Vector3(0, 0, 1);
  const probe = new T.Vector3(), right = new T.Vector3(), up = new T.Vector3();
  const offset = new T.Vector3(), sample = new T.Vector3(), lateral = new T.Vector3();
  const base = new T.Color(c.CRANE_PAPER_COLOR);
  const opaque = new T.ShaderMaterial({
    side: T.DoubleSide, forceSinglePass: true,
    uniforms: { paper: { value: base }, shadeMin: { value: c.CRANE_SHADE_MIN }, opacity: { value: 1 },
      light: { value: new T.Vector3(...c.CRANE_LIGHT_DIRECTION).normalize() } },
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = mat3(modelMatrix) * normal;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vNormal;
      uniform vec3 paper, light;
      uniform float shadeMin, opacity;
      void main() {
        vec3 n = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);
        float diffuse = max(0.0, dot(n, light));
        gl_FragColor = vec4(paper, opacity);
        #include <colorspace_fragment>
        gl_FragColor.rgb *= mix(shadeMin, 1.0, diffuse);
      }`,
  });
  // 两个共享的渲染状态：飞行中写深度，只有交叉淡化和离场时使用透明通道。
  const blend = opaque.clone();
  blend.transparent = true;
  blend.depthWrite = false;
  const creases = new T.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { ink: { value: new T.Color(c.CRANE_CREASE_COLOR) }, opacity: { value: 0 },
      bias: { value: c.CRANE_CREASE_DEPTH_BIAS } },
    vertexShader: `
      uniform float bias;
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position.z -= bias * gl_Position.w;
      }`,
    fragmentShader: `
      uniform vec3 ink;
      uniform float opacity;
      void main() {
        gl_FragColor = vec4(ink, opacity);
        #include <colorspace_fragment>
      }`,
  });
  const template = createCrane(T, () => opaque);
  const geometry = [template.bodyGeometry, template.wingLeftGeometry, template.wingRightGeometry];
  // 从原折面提取浅灰细线，几何只构建一次。
  const creaseGeometry = geometry.map(part => makeCreases(T, part));
  const capacity = Math.max(c.CRANE_COUNT_MAX.desktop, c.CRANE_COUNT_MAX.mobile);
  const slots = Array.from({ length: capacity }, () => {
    const root = template.group.clone();
    const [body, left, rightWing] = root.children;
    const faces = [body, left.children[0], rightWing.children[0]];
    const slot = { root, left, rightWing, faces, state: 'idle', alpha: 0,
      previous: new T.Vector3(), paperPose: new T.Quaternion() };
    for (let i = 0; i < faces.length; i++) {
      faces[i].renderOrder = 3;
      faces[i].onBeforeRender = (_renderer, _scene, _camera, _geometry, material) => {
        if (material === blend) {
          blend.uniforms.opacity.value = slot.alpha;
          blend.uniformsNeedUpdate = true;
        }
      };
      const line = new T.LineSegments(creaseGeometry[i], creases);
      line.renderOrder = 4;
      line.onBeforeRender = () => {
        creases.uniforms.opacity.value = c.CRANE_CREASE_ALPHA * slot.alpha;
        creases.uniformsNeedUpdate = true;
      };
      faces[i].add(line);
    }
    root.visible = false;
    parent.add(root);
    return slot;
  });

  const angles = c.CRANE_LANES_DEG;
  const bag = new Int8Array(angles.length), reserved = new Uint8Array(angles.length);
  const launched = new Float64Array(angles.length).fill(-Infinity);
  let remaining = 0, clock = 0, serial = 0, count = 0, limit = capacity;
  let width = 1, height = 1, centerX = .5, centerY = .8, fanScale = 1;
  let maxSlope = 0;
  for (const angle of angles) maxSlope = Math.max(maxSlope, Math.abs(Math.tan(angle * DEG)));

  function refillBag() {
    for (let i = 0; i < bag.length; i++) bag[i] = i;
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1)), item = bag[i];
      bag[i] = bag[j]; bag[j] = item;
    }
    remaining = bag.length;
  }

  function laneAvailable(lane) {
    for (let i = 0; i < angles.length; i++) {
      if (Math.abs(angles[i] - angles[lane]) > c.CRANE_LANE_SEPARATION_DEG) continue;
      if (reserved[i] || clock - launched[i] < c.CRANE_LANE_COOLDOWN) return false;
    }
    return true;
  }

  function pickLane(x) {
    if (!remaining) refillBag();
    const side = x < centerX ? -1 : 1;
    const preferred = random() < c.CRANE_LANE_SIDE_CHANCE ? side : -side;
    let first = -1, chosen = -1;
    for (let i = 0; i < remaining; i++) {
      if (!laneAvailable(bag[i])) continue;
      if (first < 0) first = i;
      if (Math.sign(angles[bag[i]]) === preferred) { chosen = i; break; }
    }
    if (chosen < 0) chosen = first;
    if (chosen < 0) return -1;
    const lane = bag[chosen];
    // 从袋中取走，直到七条都飞过才补袋。
    for (let i = chosen + 1; i < remaining; i++) bag[i - 1] = bag[i];
    remaining--;
    return lane;
  }

  function paint(slot, alpha) {
    slot.alpha = alpha;
    const material = alpha >= 1 ? opaque : blend;
    for (const face of slot.faces) face.material = material;
  }

  function pose(slot, scale, pitch, roll, wings, attitudeBlend = 1) {
    probe.set(0, 0, -slot.depth).applyMatrix4(camera.matrixWorld).project(camera);
    const { root } = slot;
    root.position.set(2 * slot.x - 1, 1 - 2 * slot.y, probe.z).unproject(camera);
    root.quaternion.copy(camera.quaternion)
      .multiply(q.setFromAxisAngle(axisZ, slot.side * pitch))
      .multiply(q.setFromAxisAngle(axisY, slot.side < 0 ? Math.PI : 0))
      .multiply(q.setFromAxisAngle(axisX, roll));
    root.quaternion.slerp(slot.paperPose, 1 - attitudeBlend);
    root.scale.setScalar(scale);
    // 沿原模型铰链按左右正负号扇动。
    slot.left.rotation.x = -wings * DEG;
    slot.rightWing.rotation.x = wings * DEG;
    root.updateMatrixWorld(true);
  }

  function reserve(world) {
    if (count >= limit) return null;
    let slot;
    for (const candidate of slots) if (candidate.state === 'idle') { slot = candidate; break; }
    if (!slot) return null;
    const lane = pickLane(.5 + .5 * probe.copy(world).project(camera).x);
    if (lane < 0) return null;
    reserved[lane] = 1;
    count++;
    slot.state = 'reserved';
    slot.flightId = ++serial;
    slot.lane = lane;
    return slot;
  }

  function begin(world, width, paperPose, airAge, cruise, reservation) {
    const slot = reservation ?? reserve(world);
    if (!slot) return null;
    const { lane } = slot;
    const depth = -probe.copy(world).applyMatrix4(camera.matrixWorldInverse).z;
    probe.copy(world).project(camera);
    const x = .5 + .5 * probe.x, y = .5 - .5 * probe.y;
    slot.state = 'forming';
    slot.side = Math.sign(angles[lane]) || (random() < .5 ? -1 : 1);
    slot.depth = depth;
    slot.viewSize = 2 * depth * Math.tan(camera.fov * DEG / 2);
    slot.size = width * c.CRANE_SIZE_RATIO / c.CRANE_MODEL_LENGTH;
    slot.length = width * c.CRANE_SIZE_RATIO / slot.viewSize;
    slot.x = slot.startX = x;
    slot.y = slot.startY = y;
    slot.paperPose.copy(paperPose);
    slot.age = slot.startAge = airAge;
    slot.launchRise = craneRiseDistance(airAge, cruise);
    slot.distance = slot.flap = 0;
    slot.pitch = mix(c.CRANE_PITCH_MIN, c.CRANE_PITCH_MAX, Math.abs(Math.tan(angles[lane] * DEG)) /
      Math.max(maxSlope, .001)) * DEG;
    slot.sway = TAU / range(c.CRANE_SWAY_PERIOD);
    slot.roll = TAU / range(c.CRANE_ROLL_PERIOD);
    slot.phase = random() * TAU;
    slot.speed = cruise;
    slot.flapHz = mix(c.CRANE_FLAP_HZ_MIN, c.CRANE_FLAP_HZ_MAX, random());
    slot.trailRate = mix(c.TRAIL_RATE_MIN, c.TRAIL_RATE_MAX, random());
    slot.root.visible = false;
    return slot;
  }

  function move(slot, airAge) {
    slot.age = airAge;
    slot.y = slot.startY - (craneRiseDistance(airAge, slot.speed) - slot.launchRise);
    const routeAge = airAge - slot.startAge;
    const turn = smooth(clamp(routeAge / c.CRANE_LANE_TURN_TIME));
    const along = centerX + fanScale * Math.tan(angles[slot.lane] * DEG) * (centerY - slot.y);
    slot.x = mix(slot.startX, along + c.CRANE_SWAY_AMP * Math.sin(routeAge * slot.sway + slot.phase), turn);
    slot.rollAngle = c.CRANE_VIEW_ROLL_DEG * DEG +
      c.CRANE_ROLL_MAX * DEG * Math.sin(routeAge * slot.roll + slot.phase) * turn;
    slot.pitchAngle = mix(slot.pitch, slot.pitch * .65 + c.CRANE_PITCH_MIN * DEG * .35, turn);
  }

  function fold(slot, airAge, progress, alpha) {
    if (slot.state !== 'forming') return;
    const open = smooth(clamp((progress - c.CRANE_UNFOLD_START) / (1 - c.CRANE_UNFOLD_START)));
    const firstBeat = clamp((progress - c.CRANE_FORM_FLAP_START) / (1 - c.CRANE_FORM_FLAP_START));
    slot.flap = firstBeat * c.CRANE_DOWNSTROKE_SHARE * c.CRANE_FORM_FLAP_FRACTION;
    const target = mix(c.WING_ANGLE[1], c.WING_ANGLE[0], smooth(slot.flap / c.CRANE_DOWNSTROKE_SHARE));
    const wings = mix(c.CRANE_FOLDED_ANGLE, target, open);
    move(slot, airAge);
    const blend = smooth(progress);
    pose(slot, slot.size * mix(c.CRANE_FORM_SCALE, 1, blend), slot.pitchAngle, slot.rollAngle, wings, blend);
    paint(slot, alpha);
    slot.root.visible = alpha > 0;
  }

  function flapCount() {
    return Math.floor(mix(c.CRANE_GLIDE_FLAPS_MIN, c.CRANE_GLIDE_FLAPS_MAX + 1, random()));
  }

  function nextSpark(rate) { return -Math.log1p(-random()) / rate; }

  function launch(slot) {
    if (slot.state !== 'forming') return;
    slot.state = 'flying';
    reserved[slot.lane] = 0;
    launched[slot.lane] = clock;
    slot.flaps = flapCount();
    slot.glide = 0;
    slot.next = nextSpark(slot.trailRate);
  }

  function drop(slot) {
    if (slot.state === 'idle') return;
    if (slot.state === 'forming' || slot.state === 'reserved') reserved[slot.lane] = 0;
    slot.state = 'idle';
    slot.root.visible = false;
    count--;
  }

  function wingAngle(slot, dt) {
    const [down, up] = c.WING_ANGLE;
    if (slot.glide > 0) {
      slot.glide -= dt;
      const feather = c.CRANE_GLIDE_TREMOR_DEG * Math.sin(slot.age * slot.flapHz * TAU);
      return mix(feather, up, smooth(clamp(1 - 2 * slot.glide * slot.flapHz)));
    }
    slot.flap += dt * slot.flapHz;
    if (slot.flap >= 1) {
      slot.flap -= 1;
      if (--slot.flaps === 0) {
        slot.glide = mix(c.CRANE_GLIDE_TIME_MIN, c.CRANE_GLIDE_TIME_MAX, random());
        slot.flaps = flapCount();
        slot.flap = 0;
        return 0;
      }
    }
    const beat = c.CRANE_DOWNSTROKE_SHARE;
    if (slot.flap < beat) return mix(up, down, smooth(slot.flap / beat));
    return mix(down, slot.flaps === 1 ? 0 : up, smooth((slot.flap - beat) / (1 - beat)));
  }

  function emitSpark(slot, when, alpha, distance, dx, dy) {
    const { root } = slot;
    const location = random();
    if (location < .45) {
      const left = location < .225;
      sample.set(-.55, .06, (left ? 1 : -1) * mix(1.4, 1.74, random()))
        .applyMatrix4((left ? slot.left : slot.rightWing).matrixWorld);
    } else {
      if (location < .78) sample.set(-1.7, .85, 0);
      else sample.set(-.75, .17, (random() - .5) * .38);
      sample.applyMatrix4(root.matrixWorld);
    }
    const side = random() < .5 ? -1 : 1;
    lateral.copy(right).multiplyScalar(-dy * side).addScaledVector(up, dx * side);
    sample.addScaledVector(root.position, when - 1).addScaledVector(slot.previous, 1 - when)
      .addScaledVector(lateral, slot.length * slot.viewSize * range(c.TRAIL_JITTER));
    const pixel = slot.viewSize / height;
    const speed = range(c.TRAIL_DRIFT) * pixel;
    const spread = (random() - .5) * Math.PI;
    offset.copy(lateral).multiplyScalar(speed * Math.cos(spread))
      .addScaledVector(right, dx * speed * Math.sin(spread))
      .addScaledVector(up, dy * speed * Math.sin(spread) - c.TRAIL_SINK * pixel);
    const cross = random() < c.TRAIL_CROSS_RATIO;
    const style = (cross ? 2 : 0) + (random() < c.DUST_GOLD_RATIO ? 1 : 0);
    const size = cross ? range(c.TRAIL_CROSS_SIZE) : mix(c.TRAIL_SIZE_MIN, c.TRAIL_SIZE_MAX, random());
    dust.emitTrail(sample, offset, mix(c.TRAIL_LIFE_MIN, c.TRAIL_LIFE_MAX, random()), size, style,
      c.TRAIL_ALPHA_MAX * alpha * mix(.55, 1, random()), random(), range(c.TRAIL_SPARKLE_HZ),
      slot, slot.length, slot.distance - distance * (1 - when));
  }

  function fly(slot, dt) {
    const x = slot.x, y = slot.y;
    slot.previous.copy(slot.root.position);
    move(slot, slot.age + dt);
    const endY = 1 - c.CRANE_FADE_END;
    if (slot.y <= endY) { drop(slot); return; }
    const fadeStart = 1 - c.CRANE_FADE_START;
    const fade = smooth(clamp((fadeStart - slot.y) / (fadeStart - endY)));
    const alpha = 1 - fade;
    const vx = (slot.x - x) * width / height, vy = y - slot.y;
    const distance = Math.hypot(vx, vy);
    slot.distance += distance;
    pose(slot, slot.size * mix(1, c.CRANE_FADE_SCALE, fade),
      slot.pitchAngle, slot.rollAngle, wingAngle(slot, dt));
    paint(slot, alpha);
    slot.next -= dt;
    while (slot.next <= 0) {
      emitSpark(slot, clamp(1 + slot.next / dt), alpha, distance, vx / distance, vy / distance);
      slot.next += nextSpark(slot.trailRate);
    }
  }

  function fitFan() {
    book.getWorldPosition(probe).project(camera);
    centerX = .5 + .5 * probe.x;
    centerY = .5 - .5 * probe.y;
    const available = Math.min(centerX, 1 - centerX) - c.CRANE_LANE_EDGE_ROOM - c.CRANE_SWAY_AMP;
    const span = Math.max(.01, centerY - (1 - c.CRANE_FADE_END)) * maxSlope;
    fanScale = Math.max(0, Math.min(height / width, available / span));
  }

  return {
    reserve, begin, fold, launch, drop,
    get count() { return count; },
    update(dt) {
      if (dt <= 0) return;
      clock += dt;
      for (const slot of slots) if (slot.state === 'flying') fly(slot, dt);
    },
    fit(w, h, mobile) {
      height = h; width = w;
      fitFan();
      right.copy(axisX).applyQuaternion(camera.quaternion);
      up.copy(axisY).applyQuaternion(camera.quaternion);
      limit = c.CRANE_COUNT_MAX[mobile ? 'mobile' : 'desktop'];
      for (let i = slots.length - 1; count > limit && i >= 0; i--) drop(slots[i]);
    },
    clear() {
      for (const slot of slots) drop(slot);
      launched.fill(-Infinity);
      remaining = clock = 0;
    },
    destroy() {
      for (const { root } of slots) parent.remove(root);
      for (const part of geometry) part.dispose();
      for (const part of creaseGeometry) part.dispose();
      opaque.dispose(); blend.dispose(); creases.dispose();
    },
  };
}
