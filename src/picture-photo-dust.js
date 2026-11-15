import { photoFlight as c, picture } from './config.js';

const clamp = t => Math.min(1, Math.max(0, t));

export function makePhotoDust(T, group) {
  const limit = Math.max(c.DUST_MAX.desktop, c.DUST_MAX.mobile);
  const geometry = new T.BufferGeometry();
  const screen = new Float32Array(limit * 3);
  const data = new Float32Array(limit * 10);
  const target = new Float32Array(limit * 2);
  const hasTarget = new Uint8Array(limit);
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
    set('position', screen, 3), set('size', size, 1), set('fade', fade, 1),
    set('tint', tint, 1), set('kind', kind, 1),
  ];
  const ranges = attributes.map(() => ({ start: 0, count: 0 }));
  const material = new T.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: false, blending: T.AdditiveBlending,
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
        gl_Position = vec4(position.x * 2.0 - 1.0, 1.0 - position.y * 2.0, 0.0, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 paper, white, gold;
      varying vec3 vDust;
      void main() {
        vec2 p = abs(gl_PointCoord * 2.0 - 1.0);
        float d = length(p);
        float glow = 1.0 - smoothstep(0.12, 1.0, d);
        float ray = max(1.0 - smoothstep(0.02, 0.24, p.x), 1.0 - smoothstep(0.02, 0.24, p.y));
        float star = ray * glow;
        float shape = mix(glow, max(glow * 0.46, star), step(2.0, vDust.z));
        vec3 color = mix(paper, mix(white, gold, mod(vDust.z, 2.0)), vDust.y);
        gl_FragColor = vec4(color, shape * vDust.x);
        #include <colorspace_fragment>
      }`,
  });
  const points = new T.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 5;
  group.add(points);
  geometry.setDrawRange(0, 0);
  let count = 0, capacity = c.DUST_MAX.desktop;

  // 坐标为屏幕比例。destination 可接收以后编排的目标，当前走默认落地轨迹。
  function emit(x, y, speed, floatTime, fallTime, landing, diameter, style, phase, destination = null) {
    if (count >= capacity) return false;
    const i = count++, j = i * 10;
    data[j] = 0; data[j + 1] = x; data[j + 2] = y; data[j + 3] = speed;
    data[j + 4] = floatTime; data[j + 5] = fallTime;
    data[j + 6] = landing; data[j + 7] = diameter; data[j + 8] = phase; data[j + 9] = style;
    hasTarget[i] = Number(Boolean(destination));
    if (destination) {
      target[i * 2] = destination.x;
      target[i * 2 + 1] = destination.y;
    }
    return true;
  }

  function remove(i) {
    const last = --count;
    if (i === last) return;
    data.copyWithin(i * 10, last * 10, last * 10 + 10);
    target.copyWithin(i * 2, last * 2, last * 2 + 2);
    hasTarget[i] = hasTarget[last];
  }

  function update(dt) {
    const previous = geometry.drawRange.count;
    for (let i = 0; i < count;) {
      const j = i * 10;
      const age = data[j] += dt;
      const x = data[j + 1], y = data[j + 2], speed = data[j + 3];
      const float = data[j + 4], fall = data[j + 5];
      const land = age - float - fall;
      if (land >= c.DUST_LAND_FLASH + c.DUST_LAND_FADE) { remove(i); continue; }
      const moving = Math.min(age, float + fall);
      const drift = Math.max(.012, .986 - x);
      const sway = Math.sin(moving * 5 + data[j + 8]) * .008 *
        Math.sin(Math.PI * moving / (float + fall));
      const fallProgress = clamp((age - float) / fall);
      const heldY = y - .027 * Math.sin(Math.min(age / float, 1) * Math.PI * .5);
      let px = x + drift * (1 - Math.exp(-speed * moving / drift)) + sway;
      let py = heldY + (data[j + 6] - heldY) * fallProgress ** 2;
      if (hasTarget[i]) {
        const toward = 1 - Math.exp(-moving * c.DUST_TARGET_PULL);
        px += (target[i * 2] - px) * toward;
        py += (target[i * 2 + 1] - py) * toward;
      }
      screen[i * 3] = Math.min(.991, Math.max(.009, px));
      screen[i * 3 + 1] = py;
      size[i] = data[j + 7] * (land >= 0 ? 1 + (c.DUST_LAND_SCALE - 1) * (1 - clamp(land / c.DUST_LAND_FLASH)) : 1);
      fade[i] = land >= 0
        ? 1 - clamp((land - c.DUST_LAND_FLASH) / c.DUST_LAND_FADE)
        : .62 + .34 * (.5 + .5 * Math.sin(age * 4.9 + data[j + 8]));
      tint[i] = clamp(age / c.DUST_TINT_TIME);
      kind[i] = data[j + 9];
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
      count = Math.min(count, capacity);
      geometry.setDrawRange(0, count);
      material.uniforms.pixelRatio.value = pixelRatio;
    },
    groundAt(depth) { return picture.ground.y + depth * c.DUST_LAND_BAND; },
    clear() { count = 0; geometry.setDrawRange(0, 0); },
    destroy() { group.remove(points); geometry.dispose(); material.dispose(); },
  };
}
