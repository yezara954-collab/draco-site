import { album as c, picture } from './config.js';

const capacity = Math.max(1, Math.floor(c.STARLIGHT_MAX_LIGHTS));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mix = (a, b, t) => a + (b - a) * t;
const linear = value => ((value + .055) / 1.055) ** 2.4;

export function makePageLight(T) {
  // 负直径表示五角星，负强度表示冷白色。每个光源只占一个 vec4。
  const uniforms = {
    uAlbumSpots: { value: Array.from({ length: capacity }, () => new T.Vector4()) },
    uAlbumSpotCount: { value: 0 },
    uAlbumPixelScale: { value: new T.Vector2(1, 1) },
    uAlbumWarm: { value: new T.Color(c.STARLIGHT_WARM) },
    uAlbumCool: { value: new T.Color(c.STARLIGHT_COOL) },
    uAlbumLuma: { value: new T.Vector2(...c.PAGE_BASE_LUMA.map(luma => linear(luma) / linear(248 / 255))) },
    uAlbumTintMax: { value: c.STARLIGHT_TINT_AMOUNT[1] },
  };
  let box, screen, limit = capacity;
  const candidates = Array.from({ length: capacity }, () => ({}));

  function attach(material) {
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vAlbumFacing;')
        .replace('#include <project_vertex>', `
          vAlbumFacing = abs(dot(normalize(normalMatrix * normal), mat3(viewMatrix) * vec3(-.34, .91, .22)));
          #include <project_vertex>
        `);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying float vAlbumFacing;
          uniform vec4 uAlbumSpots[${capacity}];
          uniform int uAlbumSpotCount;
          uniform vec2 uAlbumPixelScale, uAlbumLuma;
          uniform float uAlbumTintMax;
          uniform vec3 uAlbumWarm, uAlbumCool;

          float softAlbumStar(vec2 p, bool five) {
            float halfSector = 3.14159265 / (five ? 5.0 : 4.0);
            float inner = five ? 0.48 : 0.29;
            float angle = atan(p.x, p.y + 0.00001);
            float a = abs(mod(angle + halfSector, 2.0 * halfSector) - halfSector);
            float edge = inner * sin(halfSector) / (inner * sin(halfSector - a) + sin(a));
            return 1.0 - smoothstep(edge - 0.16, edge + 0.16, length(p));
          }
        `)
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec3 starColor = vec3(0.0);
          float energy = 0.0;
          float core = 0.0;
          vec2 pixel = gl_FragCoord.xy * uAlbumPixelScale;
          for (int i = 0; i < ${capacity}; i++) {
            if (i >= uAlbumSpotCount) break;
            vec4 spot = uAlbumSpots[i];
            vec2 p = (pixel - spot.xy) / (abs(spot.z) * 0.5);
            float d = dot(p, p);
            if (d >= 1.35) continue;
            float weight = abs(spot.w) * softAlbumStar(p, spot.z < 0.0);
            starColor += weight * (spot.w > 0.0 ? uAlbumWarm : uAlbumCool);
            energy += weight;
            core = max(core, abs(spot.w) * exp(-d * 12.0));
          }
          vec3 paper = diffuseColor.rgb * mix(uAlbumLuma.x, uAlbumLuma.y, clamp(vAlbumFacing, 0.0, 1.0));
          vec3 tint = starColor / max(energy, 0.00001);
          vec3 lit = mix(paper, tint, min(energy, uAlbumTintMax));
          diffuseColor.rgb = mix(lit, vec3(0.99), min(0.80, core * 1.30));
        `);
    };
  }

  function fit(bounds, width, height, canvas, mobile) {
    box = bounds;
    screen = { width, height, scale: Math.min(width, height) / 900 };
    limit = Math.max(1, Math.floor(capacity * (mobile ? picture.display.mobileFactor : 1)));
    uniforms.uAlbumPixelScale.value.set(width / canvas.width, height / canvas.height);
    clear();
  }

  function clear() { uniforms.uAlbumSpotCount.value = 0; }

  function sample(lights) {
    clear();
    if (!c.STARLIGHT_ENABLED || !box || !lights?.length) return 0;
    const { top, bottom, left, right } = box;
    const [minimum, maximum] = c.STARLIGHT_SHAPE_SIZE;
    const reach = maximum * screen.scale * .65;
    let count = 0;
    for (const star of lights) {
      const x = star.x;
      const outside = Math.max(left - x, x - right, 0);
      if (outside >= reach || star.y > bottom + reach * .2) continue;
      const gap = Math.max(0, top - star.y);
      const depth = gap / (star.falling ? reach * 1.7 : screen.height * .56);
      const score = star.alpha * (1 - outside / reach) / (1 + depth * depth);
      if (score <= .08 || (count === limit && score <= candidates[count - 1].score)) continue;
      let index = Math.min(count, limit - 1);
      while (index > 0 && candidates[index - 1].score < score) {
        Object.assign(candidates[index], candidates[index - 1]);
        index--;
      }
      const y = star.falling ? clamp(star.y + reach * .16, top - reach * .35, bottom)
        : mix(top, bottom, .12 + .70 * clamp(star.y / (screen.height * .57), 0, 1));
      const size = mix(minimum, maximum, Math.sqrt(score)) * screen.scale;
      const [low, high] = c.STARLIGHT_TINT_AMOUNT;
      const flash = star.falling ? c.STARLIGHT_FLASH * clamp(1 - gap / reach, 0, 1) : 0;
      const tint = mix(low, high, score) * Math.sqrt(score) + flash;
      Object.assign(candidates[index], { score, x, y, warm: star.warm, arms: star.arms, size, tint });
      count = Math.min(limit, count + 1);
    }
    for (let i = 0; i < count; i++) {
      const { x, y, size, tint, warm, arms } = candidates[i];
      uniforms.uAlbumSpots.value[i].set(x, screen.height - y, arms === 5 ? -size : size, warm ? tint : -tint);
    }
    uniforms.uAlbumSpotCount.value = count;
    return count;
  }

  return { attach, fit, clear, sample, candidates };
}
