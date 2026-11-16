import { photoFlight as c } from './config.js';

function drawCard(image) {
  const canvas = document.createElement('canvas');
  const width = canvas.width = c.PHOTO_TEXTURE_SIZE;
  const height = canvas.height = Math.round(width * c.PHOTO_ASPECT);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = c.PHOTO_PAPER_COLOR;
  ctx.fillRect(0, 0, width, height);
  const margin = width * c.PHOTO_IMAGE_MARGIN;
  const inset = width - margin * 2;
  ctx.drawImage(image, margin, margin, inset, inset);
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

export function photoCardTexture(T, source) {
  const texture = new T.CanvasTexture(drawCard(source));
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

export function photoMaterial(T) {
  return new T.ShaderMaterial({
    transparent: true,
    uniforms: {
      photoMap: { value: null }, peel: { value: 0 },
      opacity: { value: 1 },
      curvature: { value: new T.Vector3() }, pageAxis: { value: new T.Vector2() }, arch: { value: 0 },
      paper: { value: new T.Color(c.PHOTO_PAPER_COLOR) },
      whitePaper: { value: new T.Color(c.CRANE_PAPER_COLOR) }, whiteMix: { value: 0 },
    },
    vertexShader: `
      uniform float peel, arch;
      uniform vec3 curvature;
      uniform vec2 pageAxis;
      varying vec2 vUvPhoto;
      varying vec3 vPaperFace;
      void main() {
        vUvPhoto = uv;
        vPaperFace = normal;
        vec3 p = position;
        float corner = max(0.0, (p.x + 0.5) * (p.y / ${c.PHOTO_ASPECT.toFixed(3)} + 0.5));
        float offset = dot(pageAxis, p.xy);
        float page = (sin((curvature.x + offset) * 3.14159265) -
          sin(curvature.x * 3.14159265)) * curvature.y + offset * curvature.z;
        p.z += peel * corner * corner + arch * page;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform sampler2D photoMap;
      uniform float opacity, whiteMix;
      uniform vec3 paper, whitePaper;
      varying vec2 vUvPhoto;
      varying vec3 vPaperFace;
      void main() {
        vec3 color = paper * (vPaperFace.z < -0.5 ? 0.89 : 0.78);
        if (vPaperFace.z > 0.5) color = texture2D(photoMap, vUvPhoto).rgb;
        gl_FragColor = vec4(mix(color, whitePaper, whiteMix), opacity);
        #include <colorspace_fragment>
      }`,
  });
}
