import { album as c, picture } from './config.js';

const capacity = Math.max(1, Math.floor(c.STARLIGHT_MAX_LIGHTS));
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const mix = (a, b, t) => a + (b - a) * t;

export function makePageLight(T) {
  const uniforms = {
    uAlbumSpots: { value: Array.from({ length: capacity }, () => new T.Vector4()) },
    uAlbumSpotCount: { value: 0 },
    uAlbumPixelScale: { value: new T.Vector2(1, 1) },
    uAlbumRadius: { value: 1 },
    uAlbumWarm: { value: new T.Color(c.STARLIGHT_WARM) },
    uAlbumCool: { value: new T.Color(c.STARLIGHT_COOL) },
    uAlbumBase: { value: c.PAGE_BASE_LIGHT },
    uAlbumKey: { value: c.PAGE_KEY_LIGHT },
    uAlbumLightCeiling: { value: c.STARLIGHT_INTENSITY[1] },
  };
  let box, screen, limit = capacity;
  const candidates = Array.from({ length: capacity }, () => ({ score: 0 }));

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
          uniform vec2 uAlbumPixelScale;
          uniform float uAlbumRadius, uAlbumBase, uAlbumKey, uAlbumLightCeiling;
          uniform vec3 uAlbumWarm, uAlbumCool;
        `)
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec3 albumBounce = vec3(0.0);
          float energy = 0.0;
          vec2 pixel = gl_FragCoord.xy * uAlbumPixelScale;
          for (int i = 0; i < ${capacity}; i++) {
            if (i >= uAlbumSpotCount) break;
            vec4 spot = uAlbumSpots[i];
            vec2 p = (pixel - spot.xy) / uAlbumRadius * vec2(0.83, 1.17);
            float d = dot(p, p);
            if (d >= 1.0) continue;
            float falloff = (1.0 - d) * (1.0 - d);
            float glint = exp(-min(abs(p.x), abs(p.y)) * 36.0) * exp(-length(p) * 7.0);
            float weight = spot.z * (0.96 * falloff + 0.04 * glint);
            albumBounce += weight * mix(uAlbumCool, uAlbumWarm, spot.w);
            energy += weight;
          }
          vec3 paper = diffuseColor.rgb * (uAlbumBase + uAlbumKey * vAlbumFacing);
          albumBounce *= min(1.0, uAlbumLightCeiling / max(energy, 0.0001));
          // 用剩余亮度承接反光，白处不会被过曝冲平。
          vec3 room = max(vec3(0.0001), vec3(1.0) - paper);
          diffuseColor.rgb = paper + room * (vec3(1.0) - exp(-albumBounce / sqrt(room)));
        `);
    };
  }

  function fit(bounds, width, height, canvas, mobile) {
    box = bounds;
    screen = { width, height };
    limit = Math.max(1, Math.floor(capacity * (mobile ? picture.display.mobileFactor : 1)));
    uniforms.uAlbumPixelScale.value.set(width / canvas.width, height / canvas.height);
    uniforms.uAlbumRadius.value = Math.max(1, c.STARLIGHT_RADIUS * Math.min(width, height));
    clear();
  }

  function clear() { uniforms.uAlbumSpotCount.value = 0; }

  function sample(lights) {
    clear();
    if (!c.STARLIGHT_ENABLED || !box || !lights?.length) return;
    const { top, bottom, left, right } = box;
    const radius = uniforms.uAlbumRadius.value;
    let count = 0;
    for (const star of lights) {
      const x = star.x;
      const outside = Math.max(left - x, x - right, 0);
      if (outside > radius || star.y > bottom + radius * .2) continue;
      const gap = Math.max(0, top - star.y);
      const falloff = star.falling ? 1 / (1 + (gap / (radius * 1.7)) ** 2)
        : 1 / (1 + (gap / (screen.height * .46)) ** 2);
      const reach = Math.max(0, 1 - outside / radius);
      const score = star.alpha * falloff * reach;
      if (score <= .06 || (count === limit && score <= candidates[count - 1].score)) continue;
      let index = Math.min(count, limit - 1);
      while (index > 0 && candidates[index - 1].score < score) {
        Object.assign(candidates[index], candidates[index - 1]);
        index--;
      }
      const y = star.falling ? clamp(star.y + radius * .14, top - radius * .36, bottom)
        : mix(top, bottom, clamp(star.y / (screen.height * .57), 0, 1) * .82);
      Object.assign(candidates[index], { score, x, y, warm: star.warm, falling: star.falling });
      count = Math.min(limit, count + 1);
    }
    const [low, high] = c.STARLIGHT_INTENSITY;
    for (let i = 0; i < count; i++) {
      const light = candidates[i];
      const intensity = (light.falling ? high : mix(low, high, light.score * .58)) * light.score;
      uniforms.uAlbumSpots.value[i].set(light.x, screen.height - light.y, intensity, Number(light.warm));
    }
    uniforms.uAlbumSpotCount.value = count;
  }

  return { attach, fit, clear, sample };
}
