import { album as c, picture } from './config.js';

const capacity = Math.max(1, Math.floor(c.STAR_SHADOW_MAX));
const clamp = value => Math.max(0, Math.min(1, value));
const mix = (a, b, t) => a + (b - a) * t;
const maxRadiusScale = Math.max(1, Math.min(1.5, c.STAR_SHADOW_SCALE_MAX));
const baseRadiusScale = Math.max(1, Math.min(maxRadiusScale, c.STAR_SHADOW_SCALE));

export function makePageShadow(T) {
  // 负半径代表五角星。阴影投影在纸页片元上，翻页时仍被实际纸页轮廓裁切。
  const uniforms = {
    uAlbumShadows: { value: Array.from({ length: capacity }, () => new T.Vector4()) },
    uAlbumShadowBlur: { value: new Float32Array(capacity) },
    uAlbumShadowCount: { value: 0 },
    uAlbumPixelScale: { value: new T.Vector2(1, 1) },
  };
  const candidates = Array.from({ length: capacity }, () => ({}));
  let box, scale, limit, cssHeight;

  function attach(material) {
    material.onBeforeCompile = shader => {
      Object.assign(shader.uniforms, uniforms);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          uniform vec4 uAlbumShadows[${capacity}];
          uniform float uAlbumShadowBlur[${capacity}];
          uniform int uAlbumShadowCount;
          uniform vec2 uAlbumPixelScale;

          float starSilhouette(vec2 p, float radius, float blur, bool five) {
            float sector = 3.14159265 / (five ? 5.0 : 4.0);
            float inner = five ? 0.48 : 0.29;
            float angle = atan(p.x, p.y + 0.00001);
            float a = abs(mod(angle + sector, 2.0 * sector) - sector);
            float slope = inner * sin(sector) / (inner * sin(sector - a) + sin(a));
            float feather = blur * 0.5;
            return 1.0 - smoothstep(-feather, feather, length(p) - slope * radius);
          }
        `)
        .replace('#include <colorspace_fragment>', `#include <colorspace_fragment>
          vec2 pixel = gl_FragCoord.xy * uAlbumPixelScale;
          float transmission = 1.0;
          for (int i = 0; i < ${capacity}; i++) {
            if (i >= uAlbumShadowCount) break;
            vec4 shadow = uAlbumShadows[i];
            vec2 delta = pixel - shadow.xy;
            float radius = abs(shadow.z);
            float blur = uAlbumShadowBlur[i];
            float reach = radius + blur * 0.5;
            if (dot(delta, delta) >= reach * reach) continue;
            float shape = starSilhouette(delta, radius, blur, shadow.z < 0.0);
            transmission *= 1.0 - shadow.w * shape;
          }
          gl_FragColor.rgb *= transmission;
        `);
    };
  }

  function fit(bounds, width, height, canvas, mobile) {
    box = bounds;
    cssHeight = height;
    scale = Math.min(width, height) / 900;
    limit = Math.max(1, Math.floor(capacity * (mobile ? picture.display.mobileFactor : 1)));
    uniforms.uAlbumPixelScale.value.set(width / canvas.width, height / canvas.height);
    clear();
  }

  function clear() {
    uniforms.uAlbumShadowCount.value = 0;
  }

  function sample(stars) {
    clear();
    if (!c.STAR_SHADOW_ENABLED || !box || !stars?.length) return;
    const { left, right, top, bottom } = box;
    const [dx, dy] = c.STAR_SHADOW_OFFSET;
    const depth = bottom - top;
    const maxGap = bottom * .72;
    let count = 0;
    for (const star of stars) {
      if (star.x < left || star.x > right || star.y >= bottom || (!star.falling && star.y >= top)) continue;
      const distance = Math.max(0, bottom - star.y);
      const near = clamp(1 - distance / maxGap);
      const score = star.y;
      if (count === limit && score <= candidates[count - 1].score) continue;
      let at = Math.min(count, limit - 1);
      while (at > 0 && score > candidates[at - 1].score) {
        Object.assign(candidates[at], candidates[at - 1]);
        at--;
      }
      const receiver = mix(top + depth * .08, bottom - depth * .18, near);
      const y = star.falling ? star.y : receiver;
      Object.assign(candidates[at], {
        score, near, x: star.x + dx * scale, y: y + dy * scale,
        visibility: star.shadowAlpha ?? star.alpha, five: star.arms === 5, coreRadius: star.coreRadius,
      });
      count = Math.min(limit, count + 1);
    }
    // WebGL 的纵坐标以画布底边为原点，与页面坐标方向相反。
    for (let i = 0; i < count; i++) {
      const { near, x, y, visibility, five, coreRadius } = candidates[i];
      const radius = Math.max(c.STAR_SHADOW_MIN_RADIUS, coreRadius * mix(maxRadiusScale, baseRadiusScale, near));
      const alpha = mix(c.STAR_SHADOW_ALPHA_MIN, c.STAR_SHADOW_ALPHA_MAX, near) * visibility;
      uniforms.uAlbumShadows.value[i].set(x, cssHeight - y, five ? -radius : radius, alpha);
      uniforms.uAlbumShadowBlur.value[i] =
        mix(c.STAR_SHADOW_BLUR_MAX, c.STAR_SHADOW_BLUR_MIN, near);
    }
    uniforms.uAlbumShadowCount.value = count;
  }

  return { attach, fit, clear, sample };
}
