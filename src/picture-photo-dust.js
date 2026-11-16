import { photoFlight as c, picture } from './config.js';

const clamp = t => Math.min(1, Math.max(0, t));
const smooth = t => t * t * (3 - 2 * t);
const TAU = Math.PI * 2;

export function makePhotoDust(T, group, camera) {
  const limit = Math.max(c.DUST_MAX.desktop, c.DUST_MAX.mobile);
  const stride = 6, stateStride = 10;
  const geometry = new T.BufferGeometry();
  const buffer = new T.InterleavedBuffer(new Float32Array(limit * stride), stride).setUsage(T.DynamicDrawUsage);
  geometry.setAttribute('position', new T.InterleavedBufferAttribute(buffer, 3, 0));
  geometry.setAttribute('spark', new T.InterleavedBufferAttribute(buffer, 3, 3));
  const vertices = buffer.array;
  const range = { start: 0, count: 0 };
  const origin = new Float32Array(limit * 3), velocity = new Float32Array(limit * 3);
  // 星点共用同一块 GPU 顶点缓冲；CPU 侧按生存期交换回收槽位。
  const state = new Float64Array(limit * stateStride);
  const flyers = new Array(limit).fill(null);
  const material = new T.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false,
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneFactor,
    blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneMinusSrcAlphaFactor,
    uniforms: {
      pixelRatio: { value: 1 },
      white: { value: new T.Color(c.DUST_COLOR_A) }, gold: { value: new T.Color(c.DUST_COLOR_B) },
    },
    vertexShader: `
      attribute vec3 spark;
      uniform float pixelRatio;
      varying vec2 vSpark;
      void main() {
        vSpark = spark.yz;
        gl_PointSize = max(1.0, spark.x * pixelRatio);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 white, gold;
      varying vec2 vSpark;
      void main() {
        vec2 p = abs(gl_PointCoord * 2.0 - 1.0);
        float glow = 1.0 - smoothstep(0.24, 1.0, length(p));
        float ray = max(1.0 - smoothstep(0.015, 0.24, p.x), 1.0 - smoothstep(0.015, 0.24, p.y));
        float shape = mix(glow, max(glow * 0.32, glow * ray), step(2.0, vSpark.y));
        gl_FragColor = vec4(mix(white, gold, mod(vSpark.y, 2.0)), shape * vSpark.x);
        #include <colorspace_fragment>
        gl_FragColor.rgb *= gl_FragColor.a;
      }`,
  });
  const points = new T.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 7;
  group.add(points);
  geometry.setDrawRange(0, 0);
  let count = 0, height = 1, capacity = c.DUST_MAX.desktop;
  const view = new T.Vector3(), right = new T.Vector3(), up = new T.Vector3(), drift = new T.Vector3();

  function emit(position, motion, life, diameter, style, alpha, phase, frequency, gravity, flyer, distance) {
    const i = count++, k = i * 3, j = i * stateStride;
    position.toArray(origin, k);
    motion.toArray(velocity, k);
    state[j] = 0; state[j + 1] = life; state[j + 2] = diameter; state[j + 3] = style;
    state[j + 4] = alpha; state[j + 5] = phase; state[j + 6] = frequency; state[j + 7] = gravity;
    state[j + 8] = flyer?.flightId ?? 0;
    state[j + 9] = distance;
    flyers[i] = flyer;
  }

  function emitDebris(position, vx, vy, life, diameter, style, phase, frequency) {
    if (count >= capacity) return;
    const depth = -view.copy(position).applyMatrix4(camera.matrixWorldInverse).z;
    const pixel = 2 * depth * Math.tan(camera.fov * Math.PI / 360) / height;
    const py = (1 - view.copy(position).project(camera).y) * .5;
    const dropRoom = (picture.ground.y - c.DEBRIS_GROUND_CLEARANCE - py) * height;
    if (dropRoom <= 0) return;
    const gravity = c.DEBRIS_GRAVITY;
    // 低处或矮屏上缩短寿命，保证碎屑在地面之前已经消失。
    const safeLife = (Math.sqrt(vy * vy + 2 * gravity * dropRoom) - vy) / gravity;
    drift.copy(right).multiplyScalar(vx * pixel).addScaledVector(up, -vy * pixel);
    emit(position, drift, Math.min(life, safeLife), diameter, style, c.DEBRIS_ALPHA_MAX, phase, frequency,
      gravity * pixel, null, 0);
  }

  function emitTrail(position, motion, life, diameter, style, alpha, phase, frequency, flyer, length, distance) {
    if (count >= capacity * c.TRAIL_POOL_SHARE) return;
    emit(position, motion, life, diameter, style, alpha, phase, frequency, 0, flyer, distance);
    trailLength[count - 1] = length * c.TRAIL_MAX_LENGTH;
  }

  const trailLength = new Float32Array(limit);

  function remove(i) {
    const last = --count;
    if (i !== last) {
      origin.copyWithin(i * 3, last * 3, last * 3 + 3);
      velocity.copyWithin(i * 3, last * 3, last * 3 + 3);
      state.copyWithin(i * stateStride, last * stateStride, (last + 1) * stateStride);
      flyers[i] = flyers[last];
      trailLength[i] = trailLength[last];
    }
    flyers[last] = null;
  }

  function update(dt) {
    const previous = geometry.drawRange.count;
    for (let i = 0; i < count;) {
      const j = i * stateStride, k = i * 3, out = i * stride;
      const age = state[j] += dt;
      const life = state[j + 1], style = state[j + 3], flyer = flyers[i];
      if (age >= life || (flyer && style >= 2 && age >= c.TRAIL_CROSS_FLASH)) { remove(i); continue; }
      const t = age / life;
      const shimmer = Math.sin((age * state[j + 6] + state[j + 5]) * TAU);
      let opacity = (1 - t) ** c.DEBRIS_FADE_POWER * (.86 + .14 * shimmer);
      if (flyer) {
        const remaining = flyer.flightId === state[j + 8]
          ? clamp((flyer.distance - state[j + 9]) / trailLength[i]) : 0;
        if (remaining >= 1) { remove(i); continue; }
        const near = 1 - smooth(clamp((remaining - .65) / .35));
        const flash = style >= 2 ? 1 - smooth(clamp(age / c.TRAIL_CROSS_FLASH)) : 1;
        opacity = near * (.60 + .40 * shimmer) * flash * Math.min(1, age * 95) * (1 - smooth(t));
      }
      const fall = -.5 * state[j + 7] * age * age;
      vertices[out] = origin[k] + velocity[k] * age + up.x * fall;
      vertices[out + 1] = origin[k + 1] + velocity[k + 1] * age + up.y * fall;
      vertices[out + 2] = origin[k + 2] + velocity[k + 2] * age + up.z * fall;
      vertices[out + 3] = state[j + 2] * (1 - .54 * t);
      vertices[out + 4] = state[j + 4] * opacity;
      vertices[out + 5] = style;
      i++;
    }
    if (!count && !previous) return;
    geometry.setDrawRange(0, count);
    if (count) {
      buffer.clearUpdateRanges();
      range.count = count * stride;
      buffer.updateRanges.push(range);
      buffer.needsUpdate = true;
    }
  }

  return {
    emitDebris, emitTrail, update,
    get count() { return count; },
    fit(mobile, pixelRatio, screenHeight) {
      height = screenHeight;
      right.set(1, 0, 0).applyQuaternion(camera.quaternion);
      up.set(0, 1, 0).applyQuaternion(camera.quaternion);
      capacity = c.DUST_MAX[mobile ? 'mobile' : 'desktop'];
      flyers.fill(null, Math.min(count, capacity), count);
      count = Math.min(count, capacity);
      geometry.setDrawRange(0, count);
      material.uniforms.pixelRatio.value = pixelRatio;
    },
    clear() { flyers.fill(null, 0, count); count = 0; geometry.setDrawRange(0, 0); },
    destroy() { group.remove(points); geometry.dispose(); material.dispose(); },
  };
}
