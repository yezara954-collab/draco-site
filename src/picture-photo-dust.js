import { photoFlight as c } from './config.js';

export function makePhotoDust(T, group) {
  const limit = Math.max(c.DUST_MAX.desktop, c.DUST_MAX.mobile);
  const geometry = new T.BufferGeometry();
  const xyz = new Float32Array(limit * 3);
  const velocity = new Float32Array(limit * 3);
  const target = new Float32Array(limit * 3);
  const hasTarget = new Uint8Array(limit);
  const ages = new Float32Array(limit);
  const lives = new Float32Array(limit);
  const baseSizes = new Float32Array(limit);
  const size = new Float32Array(limit);
  const fade = new Float32Array(limit);
  const tint = new Float32Array(limit);
  const kind = new Float32Array(limit);
  const set = (name, values, width) => {
    const attr = new T.BufferAttribute(values, width).setUsage(T.DynamicDrawUsage);
    geometry.setAttribute(name, attr);
    return attr;
  };
  const attributes = [
    set('position', xyz, 3), set('size', size, 1), set('fade', fade, 1),
    set('tint', tint, 1), set('kind', kind, 1),
  ];
  const ranges = attributes.map(() => ({ start: 0, count: 0 }));
  const material = new T.ShaderMaterial({
    transparent: true, depthWrite: false, blending: T.NormalBlending,
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
        float point = 1.0 - smoothstep(0.14, 1.0, d);
        float ray = max(1.0 - smoothstep(0.03, 0.17, p.x), 1.0 - smoothstep(0.03, 0.17, p.y));
        float star = ray * (1.0 - smoothstep(0.05, 1.0, d));
        float spark = step(1.0, vDust.z);
        vec3 color = mix(paper, mix(white, gold, fract(vDust.z)), vDust.y);
        gl_FragColor = vec4(color, mix(point, max(point * 0.6, star), spark) * vDust.x);
        #include <colorspace_fragment>
      }`,
  });
  const points = new T.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 5;
  group.add(points);
  geometry.setDrawRange(0, 0);
  let count = 0, capacity = c.DUST_MAX.desktop;

  function emit(position, speed, life, diameter, style, destination = null) {
    if (count >= capacity) return false;
    const i = count++, at = i * 3;
    xyz[at] = position.x; xyz[at + 1] = position.y; xyz[at + 2] = position.z;
    velocity[at] = speed.x; velocity[at + 1] = speed.y; velocity[at + 2] = speed.z;
    ages[i] = 0; lives[i] = life; baseSizes[i] = diameter; kind[i] = style;
    hasTarget[i] = Number(Boolean(destination));
    if (destination) {
      target[at] = destination.x; target[at + 1] = destination.y; target[at + 2] = destination.z;
    }
    return true;
  }

  function remove(i) {
    const last = --count;
    if (i === last) return;
    const a = i * 3, b = last * 3;
    for (let channel = 0; channel < 3; channel++) {
      xyz[a + channel] = xyz[b + channel];
      velocity[a + channel] = velocity[b + channel];
      target[a + channel] = target[b + channel];
    }
    hasTarget[i] = hasTarget[last];
    ages[i] = ages[last]; lives[i] = lives[last]; baseSizes[i] = baseSizes[last]; kind[i] = kind[last];
  }

  function update(dt) {
    const previous = geometry.drawRange.count;
    for (let i = 0; i < count;) {
      ages[i] += dt;
      const phase = ages[i] / lives[i];
      if (phase >= 1) { remove(i); continue; }
      const at = i * 3;
      for (let axis = 0; axis < 3; axis++) {
        const component = at + axis;
        if (hasTarget[i]) velocity[component] +=
          (target[component] - xyz[component]) * c.DUST_TARGET_PULL * dt;
        xyz[component] += velocity[component] * dt;
      }
      size[i] = baseSizes[i] * (1 - phase * .82);
      fade[i] = Math.min(1, ages[i] / .12) * (1 - phase) ** 1.55;
      tint[i] = Math.min(1, ages[i] / c.DUST_TINT_TIME);
      i++;
    }
    if (count || previous) {
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
  }

  return {
    emit, update,
    fit(mobile, pixelRatio) {
      capacity = c.DUST_MAX[mobile ? 'mobile' : 'desktop'];
      count = Math.min(count, capacity);
      geometry.setDrawRange(0, count);
      material.uniforms.pixelRatio.value = pixelRatio;
    },
    clear() { count = 0; geometry.setDrawRange(0, 0); },
    destroy() { group.remove(points); geometry.dispose(); material.dispose(); },
  };
}
