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
      pixelRatio: { value: 1 },
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
      varying vec3 vDust;
      void main() {
        vec2 p = abs(gl_PointCoord * 2.0 - 1.0);
        float d = length(p);
        float glow = 1.0 - smoothstep(0.24, 1.0, d);
        float ray = max(1.0 - smoothstep(0.015, 0.24, p.x), 1.0 - smoothstep(0.015, 0.24, p.y));
        float star = ray * glow;
        float shape = mix(glow, max(glow * 0.32, star), step(2.0, vDust.z));
        vec3 color = mix(paper, mix(white, gold, mod(vDust.z, 2.0)), vDust.y);
        gl_FragColor = vec4(color, shape * vDust.x);
        #include <colorspace_fragment>
        gl_FragColor.rgb *= gl_FragColor.a;
      }`,
  });
  const points = new T.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 7;
  group.add(points);
  geometry.setDrawRange(0, 0);
  let count = 0, capacity = c.DUST_MAX.desktop;

  // owner.targets 保存当前折面目标的三维坐标。普通尾迹不传 owner，留在原世界坐标。
  function emit(position, offset, life, diameter, style, alpha, phase, owner = null, index = 0) {
    if (count >= capacity || (count >= capacity * .8 && alpha === c.TRAIL_ALPHA_MAX)) return false;
    const i = count++, j = i * 7, k = i * 3;
    origin[k] = position.x; origin[k + 1] = position.y; origin[k + 2] = position.z;
    drift[k] = offset.x; drift[k + 1] = offset.y; drift[k + 2] = offset.z;
    data[j] = 0; data[j + 1] = life; data[j + 2] = diameter; data[j + 3] = style;
    data[j + 4] = alpha; data[j + 5] = phase; data[j + 6] = index;
    owners[i] = owner;
    return true;
  }

  function remove(i) {
    const last = --count;
    if (i !== last) {
      origin.copyWithin(i * 3, last * 3, last * 3 + 3);
      drift.copyWithin(i * 3, last * 3, last * 3 + 3);
      data.copyWithin(i * 7, last * 7, last * 7 + 7);
      owners[i] = owners[last];
    }
    owners[last] = null;
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
      const handoff = owner ? clamp(owner.handoff / c.CRANE_FORM_FADE) : normalized;
      if (handoff >= 1 || owner?.cancelled) { remove(i); continue; }
      const start = owner ? Math.max(owner.age - age, owner.gatherAt + phase * .14) : 0;
      const travel = owner ? clamp((owner.age - start) / Math.max(.075, owner.gatherEnd - start)) : 0;
      const approach = smooth(travel);
      const float = 1 - (1 - clamp(age / .78)) ** 2;
      const targetIndex = data[j + 6] * 3;
      for (let axis = 0; axis < 3; axis++) {
        const offset = drift[k + axis];
        let value = origin[k + axis] + offset * float;
        if (owner) value +=
          (owner.targets[targetIndex + axis] - value) * approach + offset * .65 * Math.sin(Math.PI * travel);
        xyz[k + axis] = value;
      }
      size[i] = data[j + 2] * (1 - (owner ? handoff * .28 : normalized * .54));
      const shimmer = .88 + .12 * Math.sin(age * 4.4 + phase * 6.283);
      fade[i] = data[j + 4] * shimmer * (1 - handoff) ** (owner ? 1 : 1.6);
      tint[i] = clamp(age / c.DUST_TINT_TIME);
      kind[i] = data[j + 3];
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
    emit, update,
    fit(mobile, pixelRatio) {
      capacity = c.DUST_MAX[mobile ? 'mobile' : 'desktop'];
      owners.fill(null, Math.min(count, capacity), count);
      count = Math.min(count, capacity);
      geometry.setDrawRange(0, count);
      material.uniforms.pixelRatio.value = pixelRatio;
    },
    clear() { owners.fill(null, 0, count); count = 0; geometry.setDrawRange(0, 0); },
    destroy() { group.remove(points); geometry.dispose(); material.dispose(); },
  };
}
