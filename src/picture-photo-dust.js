import { photoFlight as c } from './config.js';

const clamp = t => Math.min(1, Math.max(0, t));
const smooth = t => t * t * (3 - 2 * t);

export function makePhotoDust(T, group) {
  const limit = Math.max(c.DUST_MAX.desktop, c.DUST_MAX.mobile);
  const geometry = new T.BufferGeometry();
  const xyz = new Float32Array(limit * 3);
  const origin = new Float32Array(limit * 3);
  const drift = new Float32Array(limit * 3);
  const data = new Float32Array(limit * 7);
  const owners = new Array(limit).fill(null);
  const trails = new Array(limit).fill(null);
  const trailData = new Float64Array(limit * 4); // 航次、累计路程、初始体长、闪烁频率
  const trailTurn = c.CRANE_GATHER_TURN_DEG * Math.PI / 180;
  const size = new Float32Array(limit);
  const fade = new Float32Array(limit);
  const tint = new Float32Array(limit);
  const kind = new Float32Array(limit);
  const attributes = ['position', 'size', 'fade', 'tint', 'kind'].map((name, i) => {
    const attr = new T.BufferAttribute([xyz, size, fade, tint, kind][i], i === 0 ? 3 : 1).setUsage(T.DynamicDrawUsage);
    geometry.setAttribute(name, attr);
    return attr;
  });
  const ranges = attributes.map(() => ({ start: 0, count: 0 }));
  const material = new T.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false,
    // 屏幕式叠亮让重叠的星点趋近白色，防止密集区域无限加亮。
    blending: T.CustomBlending, blendSrc: T.OneFactor, blendDst: T.OneMinusSrcColorFactor,
    blendSrcAlpha: T.OneFactor, blendDstAlpha: T.OneMinusSrcAlphaFactor,
    uniforms: {
      pixelRatio: { value: 1 }, trailPass: { value: 0 },
      paper: { value: new T.Color(c.PHOTO_PAPER_COLOR) }, white: { value: new T.Color(c.DUST_COLOR_A) },
      gold: { value: new T.Color(c.DUST_COLOR_B) },
    },
    vertexShader: `
      attribute float size, fade, tint, kind;
      uniform float pixelRatio;
      varying vec3 vDust;
      void main() {
        vDust = vec3(fade, tint, kind);
        gl_PointSize = max(1.0, size * pixelRatio);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 paper, white, gold;
      uniform float trailPass;
      varying vec3 vDust;
      void main() {
        if (step(4.0, vDust.z) != trailPass) discard;
        float style = mod(vDust.z, 4.0);
        vec2 p = abs(gl_PointCoord * 2.0 - 1.0);
        float d = length(p);
        float glow = 1.0 - smoothstep(0.24, 1.0, d);
        float ray = max(1.0 - smoothstep(0.015, 0.24, p.x), 1.0 - smoothstep(0.015, 0.24, p.y));
        float star = ray * glow;
        float shape = mix(glow, max(glow * 0.32, star), step(2.0, style));
        vec3 color = mix(paper, mix(white, gold, mod(style, 2.0)), vDust.y);
        gl_FragColor = vec4(color, shape * vDust.x);
        #include <colorspace_fragment>
        gl_FragColor.rgb *= gl_FragColor.a;
      }`,
  });
  const points = new T.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 7;
  const trailMaterial = material.clone();
  trailMaterial.uniforms.trailPass.value = 1;
  trailMaterial.blendDst = T.OneFactor;
  const trailPoints = new T.Points(geometry, trailMaterial);
  trailPoints.frustumCulled = false;
  trailPoints.renderOrder = points.renderOrder;
  group.add(points, trailPoints);
  geometry.setDrawRange(0, 0);
  let count = 0, capacity = c.DUST_MAX.desktop;

  // 相纸星点与尾迹共用容量，绘制时各自使用自己的混合模式。
  function emit(position, offset, life, diameter, style, alpha, phase, owner = null, index = 0) {
    if (count >= capacity) return false;
    const i = count++, j = i * 7, k = i * 3;
    origin[k] = position.x; origin[k + 1] = position.y; origin[k + 2] = position.z;
    drift[k] = offset.x; drift[k + 1] = offset.y; drift[k + 2] = offset.z;
    data[j] = 0; data[j + 1] = life; data[j + 2] = diameter; data[j + 3] = style;
    data[j + 4] = alpha; data[j + 5] = phase; data[j + 6] = index;
    owners[i] = owner;
    if (owner) owner.emitted[index] = 1;
    trails[i] = null;
    return true;
  }

  function emitTrail(position, offset, life, diameter, style, alpha, phase, frequency, flyer, length) {
    if (count >= capacity * c.TRAIL_POOL_SHARE ||
        !emit(position, offset, life, diameter, style + 4, alpha, phase)) return;
    const i = count - 1, t = i * 4;
    trails[i] = flyer;
    trailData[t] = flyer.flightId;
    trailData[t + 1] = flyer.distance;
    trailData[t + 2] = length;
    trailData[t + 3] = frequency;
  }

  function remove(i) {
    const last = --count;
    if (i !== last) {
      origin.copyWithin(i * 3, last * 3, last * 3 + 3);
      drift.copyWithin(i * 3, last * 3, last * 3 + 3);
      data.copyWithin(i * 7, last * 7, last * 7 + 7);
      owners[i] = owners[last];
      trails[i] = trails[last];
      trailData.copyWithin(i * 4, last * 4, last * 4 + 4);
    }
    owners[last] = trails[last] = null;
  }

  function update(dt) {
    const previous = geometry.drawRange.count;
    for (let i = 0; i < count;) {
      const j = i * 7, k = i * 3;
      const age = data[j] += dt;
      const life = data[j + 1];
      const owner = owners[i];
      const normalized = clamp(age / life);
      const phase = data[j + 5];
      const style = data[j + 3];
      const isTrail = style >= 4;
      const target = data[j + 6];
      const t = i * 4;
      if (owner?.cancelled || (!owner && normalized >= 1) ||
          (owner && owner.glow[target] >= 1)) { remove(i); continue; }
      let opacity = 1;
      if (isTrail) {
        const flyer = trails[i];
        const length = trailData[t + 2] * c.TRAIL_MAX_LENGTH;
        const distance = flyer.flightId === trailData[t] ? flyer.distance - trailData[t + 1] : 0;
        const near = 1 - smooth(clamp((distance / length - .65) / .35));
        const blink = .60 + .40 * Math.sin((age * trailData[t + 3] + phase) * Math.PI * 2);
        const flash = style >= 6 ? 1 - smooth(clamp(age / c.TRAIL_CROSS_FLASH)) : 1;
        opacity = near * blink * flash * Math.min(1, age * 95) * (1 - smooth(normalized));
        if (!near || (style >= 6 && !flash)) { remove(i); continue; }
        for (let axis = 0; axis < 3; axis++) xyz[k + axis] = origin[k + axis] + drift[k + axis] * age;
      } else {
        const float = 1 - (1 - clamp(age / .78)) ** 2;
        const targetIndex = target * 3;
        const approach = owner ? owner.approach[target] : 0;
        for (let axis = 0; axis < 3; axis++) xyz[k + axis] = origin[k + axis] + drift[k + axis] * float;
        if (owner && approach > 0) {
          const dx = xyz[k] - owner.targets[targetIndex];
          const dy = xyz[k + 1] - owner.targets[targetIndex + 1];
          const dz = xyz[k + 2] - owner.targets[targetIndex + 2];
          const u = dx * owner.right.x + dy * owner.right.y + dz * owner.right.z;
          const v = dx * owner.up.x + dy * owner.up.y + dz * owner.up.z;
          const angle = approach * trailTurn * (phase > .5 ? 1 : -1);
          const cos = (Math.cos(angle) - 1) * c.CRANE_GATHER_SWIRL;
          const sin = Math.sin(angle) * c.CRANE_GATHER_SWIRL;
          const du = u * cos - v * sin, dv = u * sin + v * cos;
          xyz[k] = owner.targets[targetIndex] + (dx + owner.right.x * du + owner.up.x * dv) * (1 - approach);
          xyz[k + 1] = owner.targets[targetIndex + 1] + (dy + owner.right.y * du + owner.up.y * dv) * (1 - approach);
          xyz[k + 2] = owner.targets[targetIndex + 2] + (dz + owner.right.z * du + owner.up.z * dv) * (1 - approach);
        }
        const shimmer = .88 + .12 * Math.sin(age * 4.4 + phase * Math.PI * 2);
        opacity = shimmer * (owner ? 1 - owner.glow[target] : (1 - normalized) ** 1.6);
      }
      size[i] = data[j + 2] * (1 - (owner ? owner.glow[target] * .28 : normalized * .54));
      fade[i] = data[j + 4] * opacity;
      tint[i] = isTrail ? 1 : clamp(age / c.DUST_TINT_TIME);
      kind[i] = style;
      i++;
    }
    if (!count && !previous) return;
    geometry.setDrawRange(0, count);
    if (count) for (let i = 0; i < attributes.length; i++) {
      const attr = attributes[i];
      const range = ranges[i];
      attr.clearUpdateRanges();
      range.count = count * attr.itemSize;
      attr.updateRanges.push(range);
      attr.needsUpdate = true;
    }
  }

  return {
    emit, emitTrail, update,
    fit(mobile, pixelRatio) {
      capacity = c.DUST_MAX[mobile ? 'mobile' : 'desktop'];
      owners.fill(null, Math.min(count, capacity), count);
      trails.fill(null, Math.min(count, capacity), count);
      count = Math.min(count, capacity);
      geometry.setDrawRange(0, count);
      material.uniforms.pixelRatio.value = trailMaterial.uniforms.pixelRatio.value = pixelRatio;
    },
    clear() { owners.fill(null, 0, count); trails.fill(null, 0, count); count = 0; geometry.setDrawRange(0, 0); },
    destroy() { group.remove(points, trailPoints); geometry.dispose(); material.dispose(); trailMaterial.dispose(); },
  };
}
