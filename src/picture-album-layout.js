import { album as c, photoAlbum as a, photoFlight as flight } from './config.js';

const layouts = [
  [[.53, .43, .58, -3]],
  [[.39, .29, .45, 3], [.66, .69, .42, -4]],
  [[.60, .54, .62, 2]],
  [[.63, .30, .44, -2], [.38, .69, .43, 3]],
  [[.43, .47, .55, 4]],
  [[.37, .28, .41, -4], [.65, .68, .49, 2]],
  [[.56, .47, .65, -1]],
  [[.65, .28, .46, 4], [.43, .72, .38, -3]],
];
const aspect = c.PAGE_WIDTH / c.PAGE_DEPTH;
const noise = n => (Math.sin(n * 2.719) * 43758.5453 % 1 + 1) % 1;

export function pageFrames(variant) {
  const layout = layouts[variant % layouts.length];
  const [min, max] = a.PAGE_PHOTOS_PER_PAGE;
  const frames = layout.length < min ? layouts[1] : layout;
  return frames.slice(0, Math.max(1, Math.min(2, max)));
}

export function pageTexture(T, variant) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = c.TEXTURE_SIZE;
  const ctx = canvas.getContext('2d');
  ctx.scale(canvas.width, canvas.height);
  const wash = ctx.createLinearGradient(0, 0, 1, .12);
  wash.addColorStop(0, c.PAGE_SHADE);
  wash.addColorStop(.13, c.PAGE_COLOR);
  wash.addColorStop(1, c.PAGE_COLOR);
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, 1, 1);
  ctx.strokeStyle = c.INK_COLOR;
  ctx.lineWidth = .00085;
  for (let i = 0; i < 125; i++) {
    const y = (i + .5) / 125;
    ctx.globalAlpha = .11 + (i % 7) * .018;
    ctx.beginPath();
    ctx.moveTo(.003, y);
    ctx.quadraticCurveTo(.033, y - .003, .058 + .026 * Math.sin(i * 2.4), y + .009);
    ctx.stroke();
  }
  ctx.fillStyle = c.INK_COLOR;
  ctx.globalAlpha = .045;
  for (let i = 0; i < 1700; i++) {
    ctx.fillRect((i * .6180339) % 1, (i * .729513) % 1, .0015, .00125);
  }
  pageFrames(variant).forEach(([x, y, width, degrees], i) => {
    const height = width * flight.PHOTO_ASPECT;
    const key = variant * 2 + i + 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, aspect);
    ctx.rotate(degrees * Math.PI / 180);
    ctx.globalAlpha = .13;
    ctx.fillRect(-width / 2 + .009, -height / 2 + .011, width, height);
    // 透明窗口留给图集；窗内胶带、相角的透明度也烘在同一张基础纹理上。
    ctx.globalAlpha = 1;
    ctx.clearRect(-width / 2, -height / 2, width, height);
    if (noise(key) < a.WASHI_TAPE_CHANCE) {
      ctx.save();
      ctx.translate(width * (key % 2 ? .32 : -.32), -height * .48);
      ctx.rotate(key % 2 ? .38 : -.33);
      ctx.fillStyle = key % 2 ? '#e6d6a9' : '#d4d1c9';
      ctx.strokeStyle = '#aaa18c';
      ctx.globalAlpha = .64;
      ctx.beginPath();
      ctx.moveTo(-.087, -.023); ctx.lineTo(.082, -.025); ctx.lineTo(.077, -.014);
      ctx.lineTo(.088, -.005); ctx.lineTo(.080, .006); ctx.lineTo(.086, .023);
      ctx.lineTo(-.086, .025); ctx.lineTo(-.080, .010); ctx.lineTo(-.089, 0);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = .0012;
      ctx.globalAlpha = .32;
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = '#ece8db';
      ctx.strokeStyle = c.INK_COLOR;
      ctx.lineWidth = .0022;
      ctx.globalAlpha = .78;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const cx = sx * (width / 2 - .008), cy = sy * (height / 2 - .008);
        ctx.beginPath(); ctx.moveTo(cx - sx * .044, cy);
        ctx.lineTo(cx, cy - sy * .038); ctx.lineTo(cx, cy);
        ctx.closePath(); ctx.fill(); ctx.stroke();
      }
    }
    if (noise(key + 40) < a.CAPTION_LINES_CHANCE) {
      ctx.globalAlpha = .29;
      ctx.strokeStyle = '#a29a8a';
      ctx.lineWidth = .0022;
      for (let line = 0; line < 1 + key % 2; line++) {
        const base = height * .5 + .035 + line * .026;
        ctx.beginPath();
        ctx.moveTo(-width * .31, base);
        for (let j = 1; j <= 14; j++) {
          const n = key * 71 + line * 17 + j;
          ctx.quadraticCurveTo(-width * .31 + (j - .5) * width * .041,
            base + (noise(n) - .5) * .022, -width * .31 + j * width * .041,
            base + (noise(n + 197) - .5) * .011);
        }
        ctx.stroke();
      }
    }
    ctx.restore();
  });
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function makePhotoPage(T, light, bases, gallery) {
  const material = new T.MeshBasicMaterial({
    map: bases[0], side: T.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const uniforms = {
    uPageAtlas: { value: null },
    uPageGrid: { value: 1 },
    uPageTile: { value: a.PHOTO_ATLAS_TILE },
    uPageDevelop: { value: new T.Color(a.PHOTO_DEVELOP_PAPER) },
    uPageFront: { value: bases[0] }, uPageBack: { value: bases[0] },
    uPageRect: { value: Array.from({ length: 4 }, () => new T.Vector4()) },
    uPageSlot: { value: Array.from({ length: 4 }, () => new T.Vector4()) },
    uPageMirror: { value: new T.Vector2(1, -1) },
  };
  light.attach(material);
  const shadow = material.onBeforeCompile;
  material.onBeforeCompile = shader => {
    shadow(shader);
    Object.assign(shader.uniforms, uniforms);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>
      uniform sampler2D uPageAtlas, uPageFront, uPageBack;
      uniform float uPageGrid, uPageTile;
      uniform vec3 uPageDevelop;
      uniform vec4 uPageRect[4], uPageSlot[4];
      uniform vec2 uPageMirror;
      vec3 bookPhoto(vec3 under, vec2 uv, vec4 rect, vec4 slot, float mirror) {
        if (slot.x < 0.0) return under;
        vec2 p = (uv - rect.xy) * vec2(1.0, ${(1 / aspect).toFixed(9)});
        vec2 q = vec2(p.x * slot.z + p.y * slot.y, p.y * slot.z - p.x * slot.y);
        q /= rect.zw;
        if (any(greaterThan(abs(q), vec2(0.5)))) return under;
        vec2 sub = vec2(0.5 + q.x * mirror, 0.5 - q.y);
        sub = mix(vec2(0.5 / uPageTile), vec2(1.0 - 0.5 / uPageTile), sub);
        vec2 cell = vec2(mod(slot.x, uPageGrid), uPageGrid - 1.0 - floor(slot.x / uPageGrid));
        vec3 photo = texture2D(uPageAtlas, (cell + sub) / uPageGrid).rgb;
        return mix(uPageDevelop, photo, slot.w);
      }
    `).replace('#include <map_fragment>', `
      bool frontSide = gl_FrontFacing;
      vec4 base = frontSide ? texture2D(uPageFront, vMapUv) : texture2D(uPageBack, vMapUv);
      vec2 photoUV = vec2(vMapUv.x, 1.0 - vMapUv.y);
      vec3 image = uPageDevelop;
      if (frontSide) {
        image = bookPhoto(image, photoUV, uPageRect[0], uPageSlot[0], uPageMirror.x);
        image = bookPhoto(image, photoUV, uPageRect[1], uPageSlot[1], uPageMirror.x);
      } else {
        image = bookPhoto(image, photoUV, uPageRect[2], uPageSlot[2], uPageMirror.y);
        image = bookPhoto(image, photoUV, uPageRect[3], uPageSlot[3], uPageMirror.y);
      }
      diffuseColor.rgb *= mix(image, base.rgb, base.a);
    `);
  };
  material.customProgramCacheKey = () => 'picture-photo-atlas';
  function setFace(face, offset) {
    for (let i = 0; i < 2; i++) {
      const value = face.slots[i], slot = uniforms.uPageSlot.value[offset + i];
      if (!value) { slot.set(-1, 0, 1, 0); continue; }
      const [x, y, w] = value.frame;
      uniforms.uPageRect.value[offset + i].set(x, y, w, w * flight.PHOTO_ASPECT);
      slot.set(gallery.index(value.entry), value.sin, value.cos, value.alpha);
    }
  }
  return {
    material,
    bind(front, back) {
      uniforms.uPageAtlas.value = gallery.atlas;
      uniforms.uPageGrid.value = gallery.grid || 1;
      uniforms.uPageFront.value = bases[front.variant];
      uniforms.uPageBack.value = bases[back.variant];
      uniforms.uPageMirror.value.set(front.side, back.side);
      setFace(front, 0);
      setFace(back, 2);
    },
  };
}
