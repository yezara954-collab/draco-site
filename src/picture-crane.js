import { photoFlight as c, picture } from './config.js';
import { BODY_TRIANGLES, WING_TRIANGLES_LEFT, createCrane } from './crane_geometry.js';

const clamp = t => Math.max(0, Math.min(1, t));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const radians = Math.PI / 180;
const goldenStep = (Math.sqrt(5) - 1) / 2;
const easeCubic = t => t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const period = Math.PI * 2;
const flexPosition = `
  uniform vec2 flex;
  vec3 bendTips(vec3 p) {
    float tip = smoothstep(0.9, 2.12, abs(p.x));
    p.y += flex.x * tip * sign(p.x);
    p.z += flex.y * tip * sign(p.x);
    return p;
  }
`;

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

// EdgesGeometry 去掉了共面的边；保留每条折痕与相邻折面的对应关系。
function makeCreaseMap(edges, faces, base) {
  const list = [];
  for (let edge = 0; edge < edges.count; edge += 2) {
    const adjacent = [];
    for (let i = 0; i < faces.count; i += 3) {
      let hits = 0;
      for (let k = i; k < i + 3; k++) {
        for (let n = edge; n < edge + 2; n++) {
          if (Math.abs(edges.getX(n) - faces.getX(k)) < .0001 &&
              Math.abs(edges.getY(n) - faces.getY(k)) < .0001 &&
              Math.abs(edges.getZ(n) - faces.getZ(k)) < .0001) hits++;
        }
      }
      if (hits >= 2) adjacent.push(base + i / 3);
    }
    list.push(adjacent);
  }
  return list;
}

export function makeCraneFlight(T, parent, camera, book, dust) {
  let randomState = crypto.getRandomValues(new Uint32Array(1))[0];
  function random() {
    randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
    return randomState / 4294967296;
  }
  const range = ([a, b]) => mix(a, b, random());
  const probe = new T.Vector3(), head = new T.Vector3(), sample = new T.Vector3(), offset = new T.Vector3();
  const lateral = new T.Vector3(), air = new T.Vector3();
  const localUp = new T.Vector3(0, 1, 0), localX = new T.Vector3(1, 0, 0), localZ = new T.Vector3(0, 0, 1);
  const rotation = new T.Quaternion();
  const pearl = new T.Color(c.CRANE_PEARL), warm = new T.Color(c.CRANE_WARM);
  const maxGrid = Math.max(c.DISSOLVE_GRID_COLS.desktop * c.DISSOLVE_GRID_ROWS.desktop,
    c.DISSOLVE_GRID_COLS.mobile * c.DISSOLVE_GRID_ROWS.mobile);
  const maxCranes = Math.max(c.CRANE_COUNT_MAX.desktop, c.CRANE_COUNT_MAX.mobile);
  const maxFormations = maxCranes + Math.max(c.PHOTO_MAX_ONSCREEN.desktop, c.PHOTO_MAX_ONSCREEN.mobile);
  const minAngle = c.CRANE_MIN_ANGLE_SEP;
  let aspect = 1, limit = maxCranes, active = 0, serial = 0, clock = 0, creation = 0;
  let height = 900;
  const launches = Array.from({ length: maxCranes + 4 }, () => ({ when: -Infinity, x: 0, y: 0, length: 0 }));
  let launchIndex = 0;
  let centerX = .5, centerY = .75, bookDepth = 1, pixelRatio = 1;

  const slots = Array.from({ length: maxFormations }, () => {
    const flex = { value: new T.Vector2() };
    const face = new T.ShaderMaterial({
      transparent: true, side: T.DoubleSide, depthTest: false, depthWrite: false,
      uniforms: { flex, opacity: { value: 0 }, pearl: { value: pearl }, warm: { value: warm },
        alphaMin: { value: c.CRANE_FACE_ALPHA[0] }, alphaMax: { value: c.CRANE_FACE_ALPHA[1] } },
      vertexShader: `
        attribute float reveal;
        varying float vReveal;
        varying vec3 vNormal, vEye;
        ${flexPosition}
        void main() {
          vReveal = reveal;
          vec4 view = modelViewMatrix * vec4(bendTips(position), 1.0);
          vNormal = normalMatrix * normal;
          vEye = -view.xyz;
          gl_Position = projectionMatrix * view;
        }`,
      fragmentShader: `
        varying vec3 vNormal, vEye;
        varying float vReveal;
        uniform vec3 pearl, warm;
        uniform float opacity, alphaMin, alphaMax;
        void main() {
          vec3 normal = normalize(vNormal);
          float edge = pow(1.0 - abs(dot(normal, normalize(vEye))), 1.4);
          float light = 0.72 + 0.28 * abs(dot(normal, normalize(vec3(-0.5, 0.75, 1.0))));
          gl_FragColor = vec4(mix(pearl, warm, 0.16 * edge) * light,
            vReveal * opacity * mix(alphaMin, alphaMax, edge));
          #include <colorspace_fragment>
        }`,
    });
    const crease = new T.ShaderMaterial({
      transparent: true, blending: T.AdditiveBlending, depthTest: false, depthWrite: false,
      uniforms: { flex, opacity: { value: 0 }, pearl: { value: pearl } },
      vertexShader: `
        attribute float reveal, along;
        varying vec2 vStroke;
        ${flexPosition}
        void main() {
          vStroke = vec2(reveal, along);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(bendTips(position), 1.0);
        }`,
      fragmentShader: `
        varying vec2 vStroke;
        uniform vec3 pearl;
        uniform float opacity;
        void main() {
          float draw = smoothstep(vStroke.y - 0.15, vStroke.y + 0.001, vStroke.x);
          gl_FragColor = vec4(pearl, opacity * min(1.0, vStroke.x * 3.0) * draw);
          #include <colorspace_fragment>
        }`,
    });
    const crane = createCrane(T, () => face);
    const meshes = [crane.group.children[0], crane.wingLeftPivot.children[0], crane.wingRightPivot.children[0]];
    let faceBase = 0;
    const creases = meshes.map(mesh => {
      const geometry = mesh.geometry;
      const faces = geometry.getAttribute('position');
      geometry.setAttribute('reveal', new T.BufferAttribute(new Float32Array(faces.count), 1).setUsage(T.DynamicDrawUsage));
      const edges = new T.EdgesGeometry(geometry, 2);
      const positions = edges.getAttribute('position');
      const along = new Float32Array(positions.count);
      for (let i = 1; i < along.length; i += 2) along[i] = 1;
      edges.setAttribute('along', new T.BufferAttribute(along, 1));
      edges.setAttribute('reveal', new T.BufferAttribute(new Float32Array(positions.count), 1).setUsage(T.DynamicDrawUsage));
      const line = new T.LineSegments(edges, crease);
      line.userData.faces = makeCreaseMap(positions, faces, faceBase);
      faceBase += faces.count / 3;
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
      facets: new Uint8Array(maxGrid), approach: new Float32Array(maxGrid), glow: new Float32Array(maxGrid),
      starts: new Float32Array(maxGrid), ends: new Float32Array(maxGrid), emitted: new Uint8Array(maxGrid),
      faceCount: new Uint16Array(surface.length), faceSum: new Float32Array(surface.length),
      faceReveal: new Float32Array(surface.length),
      flex, right: new T.Vector3(), up: new T.Vector3(), previous: new T.Vector3(), state: 'idle',
    };
  });

  function pose(slot, x, y, depth, angle, bank, pitch, scale, wings) {
    const { crane } = slot;
    probe.set(0, 0, -depth).applyMatrix4(camera.matrixWorld).project(camera);
    crane.group.position.set(2 * x - 1, 1 - 2 * y, probe.z).unproject(camera);
    crane.group.quaternion.copy(camera.quaternion)
      .multiply(rotation.setFromAxisAngle(localZ, angle))
      .multiply(rotation.setFromAxisAngle(localX, c.CRANE_POSE_ROLL_DEG * radians + bank))
      .multiply(rotation.setFromAxisAngle(localUp, pitch));
    crane.group.scale.setScalar(scale);
    crane.setWingAngle(wings);
    crane.group.updateMatrixWorld(true);
  }

  function findSite(slot) {
    const size = slot.screenLength;
    const border = c.CRANE_SITE_MARGIN + size * .55;
    const preferredX = slot.fromX + c.CRANE_ASSEMBLY_OFFSET[0] / aspect;
    const preferredY = slot.fromY - c.CRANE_ASSEMBLY_OFFSET[1];
    let best = -Infinity;
    for (let i = 0; i < c.CRANE_SITE_TRIES; i++) {
      const a = i * goldenStep * period + slot.phase;
      const r = size * c.CRANE_SITE_SHIFT * Math.sqrt(i / (c.CRANE_SITE_TRIES - 1));
      const x = Math.max(border / aspect, Math.min(1 - border / aspect, preferredX + Math.cos(a) * r / aspect));
      const y = Math.max(border, Math.min(.68, preferredY + Math.sin(a) * r));
      let gap = Infinity;
      for (const other of slots) {
        if (other === slot || other.state === 'idle' || other.state === 'retired' ||
            (other.state === 'waiting' && other.formOrder > slot.formOrder)) continue;
        const ox = other.state === 'fly' ? other.screenX : other.x;
        const oy = other.state === 'fly' ? other.screenY : other.y;
        gap = Math.min(gap, Math.hypot((x - ox) * aspect, y - oy) / Math.max(size, other.screenLength));
      }
      if (gap > best) { best = gap; slot.x = x; slot.y = y; }
      if (gap >= c.CRANE_SITE_CLEARANCE) return true;
    }
    return false;
  }

  function begin(world, width, duration, count) {
    const slot = slots.find(item => item.state === 'idle');
    if (!slot) return null;
    slot.depth = -probe.copy(world).applyMatrix4(camera.matrixWorldInverse).z;
    probe.copy(world).project(camera);
    slot.fromX = (probe.x + 1) * .5;
    slot.fromY = (1 - probe.y) * .5;
    slot.size = width * c.CRANE_SIZE_RATIO / c.CRANE_MODEL_LENGTH;
    slot.startLength = slot.screenLength = width * c.CRANE_SIZE_RATIO / (2 * slot.depth * Math.tan(camera.fov * radians / 2));
    slot.phase = random() * period;
    slot.age = slot.elapsed = 0;
    slot.cancelled = false;
    slot.gatherAt = duration * c.CRANE_GATHER_START;
    slot.gatherDuration = range(c.CRANE_GATHER_TIME);
    slot.gatherAge = 0;
    slot.count = count;
    slot.formOrder = creation++;
    slot.direction = Math.atan2((slot.fromY - .3), .5 - slot.fromX);
    slot.restHeading = 0;
    slot.faceCount.fill(0);
    slot.approach.fill(0);
    slot.emitted.fill(0);
    slot.glow.fill(0);
    slot.flex.value.set(0, 0);
    slot.crane.group.visible = false;
    findSite(slot);
    slot.state = 'waiting';
    for (let i = 0; i < count; i++) {
      const area = random() * surfaceArea;
      const faceId = surface.findIndex(triangle => triangle.area >= area);
      const { a, b, d, part } = surface[faceId];
      const root = Math.sqrt(random()), v = random() * root;
      const idx = i * 3;
      for (let axis = 0; axis < 3; axis++) {
        slot.samples[idx + axis] = (a[axis] * (1 - root) + b[axis] * (root - v) + d[axis] * v) *
          (part === 2 && axis === 2 ? -1 : 1);
      }
      const delay = random() * c.CRANE_GATHER_DELAY;
      slot.ends[i] = slot.gatherDuration - .45 * (c.CRANE_GATHER_DELAY - delay);
      slot.starts[i] = Math.min(slot.ends[i] - c.CRANE_GATHER_MIN_TRAVEL, Math.max(0, duration * (i + 1) / count - slot.gatherAt) + delay);
      slot.facets[i] = faceId;
      slot.faceCount[faceId]++;
    }
    return slot;
  }

  function updateReveal(slot) {
    let base = 0;
    for (const mesh of slot.meshes) {
      const attribute = mesh.geometry.getAttribute('reveal');
      for (let i = 0; i < attribute.count; i += 3) {
        attribute.array.fill(slot.faceReveal[base++], i, i + 3);
      }
      attribute.needsUpdate = true;
    }
    for (const line of slot.creases) {
      const attribute = line.geometry.getAttribute('reveal');
      const map = line.userData.faces;
      for (let i = 0; i < map.length; i++) {
        let reveal = 0;
        for (const faceId of map[i]) reveal = Math.max(reveal, slot.faceReveal[faceId]);
        attribute.array[2 * i] = attribute.array[2 * i + 1] = reveal;
      }
      attribute.needsUpdate = true;
    }
  }

  function setOpacity(slot, amount, inner = amount) {
    slot.face.uniforms.opacity.value = amount;
    slot.crease.uniforms.opacity.value = c.CRANE_LINE_ALPHA * amount;
    slot.shimmer.uniforms.opacity.value = inner * .5;
    for (let i = 0; i < c.CRANE_INNER_LIGHTS; i++) {
      const t = slot.age * (1 + i * .073) + i * 2.4;
      slot.specks.setXYZ(i, .70 * Math.cos(t), .17 + .15 * Math.sin(t * 1.3), .13 * Math.sin(t));
    }
    slot.specks.needsUpdate = true;
  }

  function available(angle) {
    for (const other of slots) {
      if (other.state !== 'form' && other.state !== 'ready' && other.state !== 'fly') continue;
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

  function flapCount() {
    return Math.floor(mix(c.CRANE_GLIDE_FLAPS_MIN, c.CRANE_GLIDE_FLAPS_MAX + 1, random()));
  }

  function startFlight(slot) {
    const angle = radians * slot.angle;
    const dx = Math.cos(angle) / aspect, dy = -Math.sin(angle);
    const m = c.CRANE_EXIT_MARGIN;
    const reach = Math.min(dx > 0 ? (1 + m - centerX) / dx : (-m - centerX) / dx,
      Math.abs(dy) < .00001 ? Infinity : dy > 0 ? (1 + m - centerY) / dy : (-m - centerY) / dy);
    slot.exitX = centerX + reach * dx;
    slot.exitY = centerY + reach * dy;
    slot.pathX = (slot.exitX - slot.x) * aspect;
    slot.pathY = slot.exitY - slot.y;
    slot.pathLength = Math.hypot(slot.pathX, slot.pathY);
    slot.duration = mix(c.CRANE_FLIGHT_TIME_MIN, c.CRANE_FLIGHT_TIME_MAX, random());
    slot.climb = range(c.CRANE_CLIMB_TIME);
    slot.noise = period / range(c.CRANE_PATH_NOISE_PERIOD);
    slot.noiseAmplitude = range(c.CRANE_PATH_NOISE_AMP) * slot.pathLength;
    slot.shrink = range(c.CRANE_SHRINK_PER_SEC);
    slot.trailRate = mix(c.TRAIL_RATE_MIN, c.TRAIL_RATE_MAX, random());
    slot.nextSpark = poisson(slot.trailRate);
    slot.elapsed = slot.distance = slot.advance = slot.bank = slot.pitch = 0;
    slot.flightId = slot.formOrder;
    slot.heading = slot.motionHeading = slot.restHeading;
    slot.lagBank = slot.lagPitch = 0;
    slot.wingStart = slot.wings;
    slot.flapTime = 0;
    slot.glideTime = 0;
    slot.flapsLeft = flapCount();
    slot.physicalX = slot.screenX;
    slot.physicalY = slot.screenY;
    slot.vanished = false;
    slot.state = 'fly';
    const launch = launches[launchIndex++ % launches.length];
    launch.when = clock; launch.x = slot.x; launch.y = slot.y; launch.length = slot.screenLength;
  }

  function canLaunch(slot) {
    for (const other of slots) {
      if (other === slot || (other.state !== 'fly' && other.state !== 'form' && other.state !== 'ready')) continue;
      const older = other.formOrder < slot.formOrder;
      if (other.state !== 'fly' && !older) continue;
      const x = other.state === 'fly' ? other.screenX : other.x;
      const y = other.state === 'fly' ? other.screenY : other.y;
      if (Math.hypot((x - slot.x) * aspect, y - slot.y) <
          c.CRANE_LAUNCH_RADIUS * Math.max(slot.screenLength, other.screenLength)) return false;
    }
    for (const launch of launches) {
      if (clock - launch.when < c.CRANE_LAUNCH_SPACING &&
          Math.hypot((launch.x - slot.x) * aspect, launch.y - slot.y) <
          c.CRANE_LAUNCH_RADIUS * Math.max(slot.screenLength, launch.length)) return false;
    }
    return true;
  }

  function retire(slot) {
    if (slot.state === 'form' || slot.state === 'ready' || slot.state === 'fly') active--;
    slot.crane.group.visible = false;
    slot.cancelled = true;
    // 星点下一次更新先移除旧引用，之后才能复用这只鹤的槽。
    slot.state = 'retired';
  }

  function wingsInFlight(slot, dt) {
    const [low, high] = c.WING_ANGLE;
    const down = c.CRANE_DOWNSTROKE_TIME;
    const cycle = down + c.CRANE_UPSTROKE_TIME;
    slot.stroke = 0;
    if (slot.glideTime > 0) {
      slot.glideTime -= dt;
      const resume = smooth(clamp(1 - slot.glideTime / c.CRANE_UPSTROKE_TIME));
      const flutter = c.CRANE_GLIDE_TREMOR_DEG * Math.sin(slot.elapsed * period / cycle);
      slot.wings = mix(flutter, high, resume);
      if (slot.glideTime <= 0) {
        slot.flapTime = 0;
        slot.flapsLeft = flapCount();
      }
      return;
    }
    slot.flapTime += dt;
    if (slot.flapTime >= cycle) {
      slot.flapTime -= cycle;
      slot.flapsLeft--;
      slot.wingStart = high;
      if (!slot.flapsLeft) {
        slot.glideTime = mix(c.CRANE_GLIDE_TIME_MIN, c.CRANE_GLIDE_TIME_MAX, random());
      }
    }
    const falling = slot.flapTime < down;
    if (falling) {
      slot.stroke = Math.sin(Math.PI * slot.flapTime / down);
      slot.wings = mix(slot.wingStart, low, smooth(slot.flapTime / down));
    } else {
      const recover = (slot.flapTime - down) / c.CRANE_UPSTROKE_TIME;
      slot.stroke = -Math.sin(Math.PI * recover) * .55;
      slot.wings = mix(low, slot.glideTime > 0 || slot.flapsLeft === 1 ? 0 : high, smooth(recover));
    }
    if (slot.glideTime > 0) slot.wings = 0;
  }

  function poisson(rate) {
    return -Math.log(1 - random()) / rate;
  }

  function emitSpark(slot, x, y, z, pivot, frameFraction, opacity) {
    const body = slot.crane.group;
    const depth = -probe.copy(body.position).applyMatrix4(camera.matrixWorldInverse).z;
    const screenUnit = 2 * depth * Math.tan(camera.fov * radians / 2);
    const side = random() < .5 ? -1 : 1;
    lateral.copy(slot.right).multiplyScalar(-Math.sin(slot.heading) * side)
      .addScaledVector(slot.up, Math.cos(slot.heading) * side);
    sample.set(x, y, z).applyMatrix4(pivot.matrixWorld)
      .addScaledVector(body.position, frameFraction - 1)
      .addScaledVector(slot.previous, 1 - frameFraction)
      .addScaledVector(lateral, slot.screenLength * screenUnit * range(c.TRAIL_JITTER));
    const speed = range(c.TRAIL_DRIFT) * screenUnit / height;
    const spread = random() * Math.PI - Math.PI / 2;
    offset.copy(lateral).multiplyScalar(speed * Math.cos(spread))
      .addScaledVector(air.copy(slot.right).multiplyScalar(Math.cos(slot.heading))
        .addScaledVector(slot.up, Math.sin(slot.heading)), speed * Math.sin(spread))
      .addScaledVector(slot.up, -c.TRAIL_SINK * screenUnit / height);
    const cross = random() < c.TRAIL_CROSS_RATIO;
    const style = (cross ? 2 : 0) + (random() < c.DUST_GOLD_RATIO ? 1 : 0);
    const size = cross ? range(c.TRAIL_CROSS_SIZE) : mix(c.TRAIL_SIZE_MIN, c.TRAIL_SIZE_MAX, random());
    dust.emitTrail(sample, offset, mix(c.TRAIL_LIFE_MIN, c.TRAIL_LIFE_MAX, random()), size, style,
      c.TRAIL_ALPHA_MAX * opacity * mix(.55, 1, random()), random(), range(c.TRAIL_SPARKLE_HZ),
      slot, slot.screenLength);
  }

  function flight(slot, dt) {
    slot.elapsed += dt;
    const progress = clamp(slot.elapsed / slot.duration);
    const climb = clamp(slot.elapsed / slot.climb);
    const forward = clamp((slot.elapsed - slot.climb) / (slot.duration - slot.climb));
    wingsInFlight(slot, dt);
    const layer = slot.layer;
    const ramp = mix(...c.CRANE_SPEED_RAMP, forward);
    if (climb >= 1) {
      slot.advance += dt * ramp * (1 + c.CRANE_STROKE_PULSE * slot.stroke) / (slot.duration - slot.climb);
    }
    const t = clamp(slot.advance);
    const envelope = Math.sin(Math.PI * t);
    const oscillation = .75 * Math.sin(slot.elapsed * slot.noise + slot.phase) +
      .25 * Math.sin(slot.elapsed * slot.noise * 1.7 + slot.phase * .7);
    const sideways = slot.noiseAmplitude * oscillation * envelope;
    const heightFactor = 1 - smooth(t);
    const loopRadius = slot.screenLength * c.CRANE_CLIMB_RADIUS;
    const loop = Math.sin(period * climb) * Math.sin(Math.PI * climb) * loopRadius;
    const lift = slot.screenLength * c.CRANE_CLIMB_HEIGHT * smooth(climb) * heightFactor;
    let x = slot.x + t * slot.pathX / aspect + (loop - sideways * slot.pathY / slot.pathLength) / aspect;
    let y = slot.y + t * slot.pathY - lift + sideways * slot.pathX / slot.pathLength;
    if (slot.ground) {
      const approach = smooth(clamp(t / c.CRANE_GROUND_APPROACH));
      const ground = picture.ground.y - mix(...c.CRANE_GROUND_BAND, .5);
      y = mix(slot.y - lift, ground, approach) + c.CRANE_GROUND_BOB * oscillation * smooth(t * 5);
      x = slot.x + (t * slot.pathX + loop) / aspect;
    }
    const vx = (x - slot.physicalX) * aspect, vy = slot.physicalY - y;
    const step = Math.hypot(vx, vy);
    const motionHeading = step > .00001 ? Math.atan2(vy, vx) : slot.motionHeading;
    const turn = smooth(climb);
    const response = 1 - Math.exp(-dt / c.CRANE_POSE_RESPONSE);
    const headingChange = wrap(motionHeading - slot.motionHeading);
    slot.motionHeading = motionHeading;
    const maxTurn = c.CRANE_CLIMB_TURN_MAX_DEG * radians;
    const liftHeading = slot.restHeading + Math.max(-maxTurn, Math.min(maxTurn, wrap(motionHeading - slot.restHeading)));
    const aim = climb < 1 ? liftHeading : motionHeading;
    slot.heading += response * wrap(aim - slot.heading) * turn;
    const slope = Math.atan2(vy, Math.abs(vx) + .0001);
    const pitch = Math.max(-1, Math.min(1, slope / (Math.PI / 2))) * c.CRANE_PITCH_MAX_DEG * radians;
    slot.pitch = mix(slot.pitch, pitch * turn, response);
    const maxBank = c.CRANE_BANK_MAX_DEG * radians;
    const bank = maxBank * Math.tanh(headingChange * c.CRANE_BANK_CURVATURE / Math.max(dt, step)) * turn;
    slot.bank = mix(slot.bank, -bank, 1 - Math.exp(-dt / c.CRANE_BANK_RESPONSE));
    const lag = 1 - Math.exp(-dt / c.CRANE_ANATOMY_LAG);
    slot.lagPitch = mix(slot.lagPitch, slot.pitch, lag);
    slot.lagBank = mix(slot.lagBank, slot.bank, lag);
    slot.flex.value.set((slot.lagPitch - slot.pitch) * c.CRANE_ANATOMY_FLEX,
      (slot.lagBank - slot.bank) * c.CRANE_ANATOMY_FLEX);
    slot.distance += step;
    slot.physicalX = x; slot.physicalY = y;
    const blend = smooth(forward);
    const depth = mix(slot.depth, bookDepth * c.CRANE_LAYER_DEPTH[layer], blend);
    const reduction = (1 - slot.shrink) ** slot.elapsed;
    const size = slot.size * depth / slot.depth * mix(1, c.CRANE_LAYER_SCALES[layer], blend) * reduction;
    slot.screenLength = slot.startLength * size * slot.depth / (slot.size * depth);
    slot.screenX = x;
    slot.screenY = y - Math.sin(slot.wings * radians) * slot.screenLength * c.CRANE_BOB_AMOUNT;
    slot.previous.copy(slot.crane.group.position);
    pose(slot, slot.screenX, slot.screenY, depth, slot.heading, slot.bank, slot.pitch, size, slot.wings);
    if (!slot.vanished && (progress >= c.CRANE_FADE_START || x < .025 || x > .975 || y < .025 || y > .975)) {
      slot.vanished = true;
      slot.exitAge = slot.elapsed;
      for (let i = 0; i < c.CRANE_VANISH_POINTS; i++) {
        emitSpark(slot, random() * 2 - 1, random() * .35, random() * .4 - .2,
          slot.crane.group, 1, .52);
      }
    }
    const fade = slot.vanished ? 1 - smooth(clamp((slot.elapsed - slot.exitAge) / c.CRANE_EXIT_FADE)) : 1;
    setOpacity(slot, fade * mix(1, c.CRANE_LAYER_LIGHT[layer], blend) * Math.exp(-slot.elapsed * c.CRANE_DIM_PER_SEC));
    slot.nextSpark -= dt;
    const { crane } = slot;
    while (fade > 0 && slot.nextSpark <= 0) {
      const location = random();
      const when = clamp(1 + slot.nextSpark / dt);
      if (location < .45) {
        const left = location < .225;
        emitSpark(slot, -.55, .06, (left ? 1 : -1) * mix(1.4, 1.74, random()),
          left ? crane.wingLeftPivot : crane.wingRightPivot, when, fade);
      } else if (location < .78) {
        emitSpark(slot, -1.7, .85, 0, crane.group, when, fade);
      } else {
        emitSpark(slot, -.75, .17, (random() - .5) * .38, crane.group, when, fade);
      }
      slot.nextSpark += poisson(slot.trailRate);
    }
    if (!fade) retire(slot);
  }

  function form(slot, dt) {
    slot.gatherAge += dt;
    const time = clamp(slot.gatherAge / slot.gatherDuration);
    const unfold = smooth(clamp((time - c.CRANE_UNFOLD_START) / (1 - c.CRANE_UNFOLD_START)));
    const [low, high] = c.WING_ANGLE;
    const flap = Math.sin((slot.gatherAge - slot.gatherDuration) * period /
      (c.CRANE_DOWNSTROKE_TIME + c.CRANE_UPSTROKE_TIME));
    slot.wings = mix(c.CRANE_FOLDED_ANGLE, mix(0, (high - low) / 2 * flap, unfold), unfold);
    const k = 1.8;
    const back = 1 + (time - 1) ** 2 * ((k + 1) * time - 1);
    const overshoot = 4 * k ** 3 / (27 * (k + 1) ** 2);
    const size = slot.size * (back > 1
      ? 1 + (back - 1) * c.CRANE_FORM_OVERSHOOT / overshoot
      : mix(c.CRANE_FORM_SCALE, 1, back));
    slot.restHeading = slot.direction + Math.sin(Math.PI * (1 - time)) * c.CRANE_FORM_TWIST_DEG * radians;
    const movement = smooth(time);
    slot.screenX = mix(slot.fromX, slot.x, movement);
    slot.screenY = mix(slot.fromY, slot.y, movement);
    pose(slot, slot.screenX, slot.screenY, slot.depth, slot.restHeading, 0, 0, size, slot.wings);
    slot.faceSum.fill(0);
    const [faceStart, faceEnd] = c.CRANE_FACE_ARRIVAL;
    const [dotStart, dotEnd] = c.CRANE_DOT_BLEND;
    // 即使星点池已满，留空的折面也会在尾段平滑补齐。
    const fallback = smooth(clamp((time - c.CRANE_FACE_FALLBACK_START) / (1 - c.CRANE_FACE_FALLBACK_START)));
    let arrived = 0;
    for (let i = 0; i < slot.count; i++) {
      const id = slot.facets[i];
      const t = clamp((slot.gatherAge - slot.starts[i]) / (slot.ends[i] - slot.starts[i]));
      slot.approach[i] = easeCubic(t);
      slot.glow[i] = smooth(clamp((t - dotStart) / (dotEnd - dotStart)));
      const here = slot.emitted[i] ? smooth(clamp((t - faceStart) / (faceEnd - faceStart))) : fallback;
      slot.faceSum[id] += here;
      arrived += here;
      sample.fromArray(slot.samples, i * 3)
        .applyMatrix4(slot.pivots[surface[id].part].matrixWorld).toArray(slot.targets, i * 3);
    }
    for (let i = 0; i < slot.faceReveal.length; i++) {
      slot.faceReveal[i] = smooth(slot.faceCount[i] ? slot.faceSum[i] / slot.faceCount[i] : arrived / slot.count);
    }
    updateReveal(slot);
    setOpacity(slot, 1, arrived / slot.count);
    if (time >= 1) {
      slot.state = 'ready';
      slot.elapsed = 0;
    }
  }

  function update(dt) {
    if (dt <= 0) return;
    clock += dt;
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
      slot.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      slot.up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      if (slot.state === 'waiting' && slot.age >= slot.gatherAt &&
          active < limit && findSite(slot) && assignRoute(slot)) {
        const order = 4 + (2 - slot.layer) * .2;
        for (const mesh of slot.meshes) mesh.renderOrder = order;
        for (const line of slot.creases) line.renderOrder = order + .04;
        slot.points.renderOrder = order + .06;
        slot.shimmer.uniforms.pixelRatio.value = pixelRatio;
        slot.direction = wrap(slot.angle * radians);
        slot.state = 'form';
        slot.crane.group.visible = true;
        active++;
      }
      if (slot.state === 'fly') flight(slot, dt);
      else if (slot.state === 'form') form(slot, dt);
      else if (slot.state === 'ready') {
        slot.elapsed += dt;
        slot.wings = Math.sin(slot.elapsed * period /
          (c.CRANE_DOWNSTROKE_TIME + c.CRANE_UPSTROKE_TIME)) * c.WING_ANGLE[1] * .14;
        pose(slot, slot.screenX, slot.screenY, slot.depth, slot.restHeading, 0, 0, slot.size, slot.wings);
        if (slot.elapsed >= c.CRANE_HOVER_TIME && canLaunch(slot)) startFlight(slot);
      }
    }
  }

  return {
    begin, update,
    fit(w, h, mobile, ratio) {
      aspect = w / h;
      height = h;
      limit = c.CRANE_COUNT_MAX[mobile ? 'mobile' : 'desktop'];
      pixelRatio = ratio;
      for (let i = slots.length - 1; active > limit && i >= 0; i--) {
        const slot = slots[i];
        if (slot.state === 'form' || slot.state === 'ready' || slot.state === 'fly') retire(slot);
      }
    },
    clear() {
      for (const slot of slots) { slot.state = 'idle'; slot.crane.group.visible = false; }
      active = serial = creation = launchIndex = clock = 0;
      for (const launch of launches) launch.when = -Infinity;
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
