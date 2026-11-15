import { photoFlight as c } from './config.js';

const files = import.meta.glob('./assets/picture/doodle_*.png', { eager: true, query: '?url', import: 'default' });
let doodles;

function loadImage(url) {
  if (!url) return Promise.resolve(null);
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

function fallback(canvas, index, rough) {
  const ctx = canvas.getContext('2d');
  const s = canvas.width;
  const stroke = { stroke: c.PHOTO_INK_COLOR, strokeWidth: s * .012, roughness: 2, seed: index + 23 };
  const x = s / 2, y = s / 2;
  const hand = rough?.canvas(canvas);
  if (hand) {
    if (index % 2) hand.ellipse(x, y, s * .48, s * .45, stroke);
    hand.polygon([[x, y - s * .27], [x + s * .07, y - s * .065],
      [x + s * .25, y], [x + s * .065, y + s * .07], [x, y + s * .25],
      [x - s * .06, y + s * .065], [x - s * .25, y], [x - s * .06, y - s * .07]], stroke);
    return;
  }
  // 外部粗线库暂不可达时保留同一个四角图样。
  ctx.strokeStyle = c.PHOTO_INK_COLOR;
  ctx.lineWidth = stroke.strokeWidth;
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4, radius = s * (i % 2 ? .08 : .25);
    ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.stroke();
}

function drawCard(image, index, rough) {
  const canvas = document.createElement('canvas');
  const width = canvas.width = c.PHOTO_TEXTURE_SIZE;
  const height = canvas.height = Math.round(width * c.PHOTO_ASPECT);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = c.PHOTO_PAPER_COLOR;
  ctx.fillRect(0, 0, width, height);
  const margin = width * c.PHOTO_IMAGE_MARGIN;
  const inset = width - margin * 2;
  if (image) ctx.drawImage(image, margin, margin, inset, inset);
  else {
    const sketch = document.createElement('canvas');
    sketch.width = sketch.height = Math.round(inset);
    fallback(sketch, index, rough);
    ctx.drawImage(sketch, margin, margin, inset, inset);
  }
  ctx.strokeStyle = c.PHOTO_INK_COLOR;
  ctx.lineWidth = width * .0038;
  const pad = 2.4;
  ctx.beginPath();
  ctx.moveTo(pad, pad + .8);
  ctx.quadraticCurveTo(width * .56, pad - 1, width - pad, pad);
  ctx.lineTo(width - pad - .6, height - pad);
  ctx.quadraticCurveTo(width * .42, height - pad + 1, pad + .8, height - pad);
  ctx.closePath();
  ctx.stroke();
  return canvas;
}

export function loadPhotoTextures(T) {
  // 只解码一次，离开 Picture 时 GPU 纹理可释放，画布底稿仍供下次进入复用。
  doodles ??= Promise.all(Array.from({ length: 6 }, (_, index) =>
    loadImage(files[`./assets/picture/doodle_${String(index + 1).padStart(2, '0')}.png`]),
  )).then(async images => {
    let rough;
    if (images.some(image => !image)) {
      const module = c.ROUGH_MODULE;
      try { rough = (await import(/* @vite-ignore */ module)).default; } catch { /* 使用离线线稿。 */ }
    }
    return images.map((image, index) => drawCard(image, index, rough));
  });
  return doodles.then(cards => cards.map(card => {
    const texture = new T.CanvasTexture(card);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }));
}

export function photoMaterial(T) {
  return new T.ShaderMaterial({
    uniforms: {
      doodle: { value: null }, peel: { value: 0 }, dissolve: { value: -1 }, seed: { value: 0 },
      curvature: { value: new T.Vector3() }, arch: { value: 0 }, noiseAmount: { value: c.PHOTO_DISSOLVE_NOISE }, feather: { value: c.PHOTO_FEATHER },
      paper: { value: new T.Color(c.PHOTO_PAPER_COLOR) }, rim: { value: new T.Color(c.PHOTO_DISSOLVE_EDGE) },
    },
    vertexShader: `
      uniform float peel, arch;
      uniform vec3 curvature;
      varying vec2 vUvPhoto;
      varying vec2 vPaperFace;
      void main() {
        vUvPhoto = uv;
        vPaperFace = vec2(normal.z, normal.y);
        vec3 p = position;
        float corner = max(0.0, (p.x + 0.5) * (p.y / ${c.PHOTO_ASPECT.toFixed(3)} + 0.5));
        float offset = p.x * curvature.y;
        float angle = curvature.x * 3.14159265;
        float page = sin(angle + offset) - sin(angle) - cos(angle) * offset;
        p.z += peel * corner * corner + arch * curvature.z * page;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D doodle;
      uniform float dissolve, seed, noiseAmount, feather;
      uniform vec3 paper, rim;
      varying vec2 vUvPhoto;
      varying vec2 vPaperFace;
      void main() {
        vec2 uv = vUvPhoto;
        float height = abs(vPaperFace.x) > 0.5 ? uv.y : (abs(vPaperFace.y) > 0.5 ? step(0.0, vPaperFace.y) : uv.y);
        float mottled = sin(uv.x * 31.0 + seed + height * 9.0) * 0.58 +
          sin(uv.x * 47.0 - height * 26.0 + seed * 1.31) * 0.25 +
          sin(uv.x * 101.0 + height * 72.0 + seed) * 0.17;
        float edge = height + mottled * noiseAmount - dissolve;
        if (edge < 0.0) discard;
        vec3 color = paper * (vPaperFace.x > 0.5 ? 1.0 : vPaperFace.x < -0.5 ? 0.87 : 0.74);
        if (vPaperFace.x > 0.5) color = texture2D(doodle, uv).rgb;
        float glow = 1.0 - smoothstep(0.004, feather, edge);
        if (dissolve > 0.0) color = mix(color, rim, glow * 0.86);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  });
}
