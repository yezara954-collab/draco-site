import { album as c } from './config.js';

const { colors } = c;
const [columns, rows] = c.PAGE_SEGMENTS;
const width = c.PAGE_WIDTH;
const depth = c.PAGE_DEPTH;

export function arch(u) {
  return c.OPEN_ARCH * Math.sin(Math.PI * u) + c.FREE_EDGE_LIFT * u;
}

function pageTexture(T, variant) {
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

  // 书沟排线与纤维纹理烘到纹理，翻页时跟着纸面变形。
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

  const frames = variant % 5 === 4 ? [[.22, .11, .45], [.37, .53, .45]]
    : [[.26 + (variant % 3) * .045, .22 + (variant % 4) * .042, .53 + (variant % 2) * .06]];
  for (const [x, y, w] of frames) {
    const h = w * width / depth;
    ctx.globalAlpha = .13;
    ctx.fillRect(x + .009, y + .008, w, h);
    ctx.globalAlpha = 1;
    ctx.fillStyle = c.PAGE_COLOR;
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = c.INK_COLOR;
    ctx.lineWidth = .003;
    ctx.globalAlpha = .76;
    ctx.strokeRect(x, y, w, h);
    ctx.globalAlpha = .41;
    ctx.lineWidth = .0016;
    ctx.strokeRect(x + .009, y + .006, w - .018, h - .012);
    ctx.globalAlpha = .86;
    ctx.lineWidth = .0022;
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const cx = x + (sx > 0 ? .024 : w - .024);
      const cy = y + (sy > 0 ? .017 : h - .017);
      ctx.beginPath();
      ctx.moveTo(cx, cy + sy * .037);
      ctx.lineTo(cx + sx * .054, cy);
      ctx.lineTo(cx, cy);
      ctx.closePath();
      ctx.stroke();
    }
  }
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

// 网格以书脊为 u=0；左右面与翻动页共用纹理和网格拓扑。
export function createPaper(T, ink, material) {
  const geometry = new T.PlaneGeometry(1, 1, columns, rows);
  const positions = geometry.attributes.position;
  positions.setUsage(T.DynamicDrawUsage);
  const edgeGeometry = new T.BufferGeometry();
  const border = [];
  for (let i = 0; i <= columns; i++) border.push(i);
  for (let j = 1; j <= rows; j++) border.push(j * (columns + 1) + columns);
  for (let i = columns - 1; i >= 0; i--) border.push(rows * (columns + 1) + i);
  for (let j = rows - 1; j >= 0; j--) border.push(j * (columns + 1));
  const edge = new T.BufferAttribute(new Float32Array(border.length * 3), 3).setUsage(T.DynamicDrawUsage);
  edgeGeometry.setAttribute('position', edge);
  const mesh = new T.Mesh(geometry, material);
  const outline = new T.Line(edgeGeometry, ink);
  mesh.frustumCulled = outline.frustumCulled = false;
  mesh.add(outline);
  const xs = new Float32Array(columns + 1);
  const ys = new Float32Array(columns + 1);
  return {
    mesh,
    pose(side, start, end, progress = 0, lift = 0, phase = 0, wind = 0, maximumAngle = Math.PI, sheetWidth = width, sheetDepth = depth, curlScale = 1) {
      const envelope = Math.sin(Math.PI * progress);
      const ease = progress;
      xs[0] = 0;
      ys[0] = 0;
      for (let i = 1; i <= columns; i++) {
        const u = (i - .5) / columns;
        // 沿纸的弧长积分局部切线，纸不会因为卷曲而凭空拉长。
        const delayed = ease - c.CURL_LAG * envelope * u;
        const curl = curlScale * c.CURL_AMOUNT * envelope * Math.min(1, maximumAngle / Math.PI) *
          (.66 * Math.sin(2 * Math.PI * u - .7) - .35 * u);
        const tangent = maximumAngle * delayed + curl;
        // 小角度抬页时，不能让先卷起的区域穿过原来的纸摞。
        const liftAngle = Math.max(tangent, .14 * envelope * (1 - u));
        xs[i] = xs[i - 1] + Math.cos(liftAngle) * sheetWidth / columns;
        ys[i] = ys[i - 1] + Math.sin(liftAngle) * sheetWidth / columns;
      }
      for (let j = 0; j <= rows; j++) {
        const v = j / rows;
        for (let i = 0; i <= columns; i++) {
          const u = i / columns;
          const index = j * (columns + 1) + i;
          const vertical = ys[i] + arch(u) + start + (end - start) * ease + lift * envelope * u;
          const flutter = c.EDGE_FLUTTER * envelope * u ** 2 *
            (Math.sin(phase + v * 6 + u * 4) + wind * (v - .5));
          positions.setXYZ(index, side * (c.SPINE_GAP + xs[i]), vertical + flutter,
            (v - .5) * sheetDepth + flutter * .38);
        }
      }
      positions.needsUpdate = true;
      geometry.computeVertexNormals();
      border.forEach((index, i) => edge.setXYZ(i, positions.getX(index), positions.getY(index), positions.getZ(index)));
      edge.needsUpdate = true;
    },
  };
}

export function makeAlbumArt(T, book, count, light, ghostCount) {
  const ink = new T.LineBasicMaterial({ color: c.INK_COLOR, transparent: true, opacity: c.INK_OUTLINE_ALPHA });
  const coverInk = new T.LineBasicMaterial({ color: colors.cover });
  const cover = new T.MeshBasicMaterial({ color: colors.cover, side: T.DoubleSide });
  const edgeMaterial = new T.MeshBasicMaterial({ color: c.PAGE_SHADE, side: T.DoubleSide });
  const edgeInk = new T.LineBasicMaterial({ color: c.PAGE_EDGE_COLOR });
  const pages = Array.from({ length: c.FRAME_VARIANTS }, (_, i) => new T.MeshBasicMaterial({
    map: pageTexture(T, i), side: T.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  }));
  pages.forEach(light.attach);
  const stationary = [-1, 1].map(side => {
    const coverPaper = createPaper(T, coverInk, cover);
    coverPaper.pose(side, c.COVER_DEPTH, c.COVER_DEPTH, 0, 0, 0, 0, Math.PI,
      width + c.COVER_BORDER, depth + 2 * c.COVER_BORDER);
    book.add(coverPaper.mesh);

    const top = createPaper(T, ink, pages[0]);
    book.add(top.mesh);
    // 纸摞的三条可见侧边由一张封闭裙边连起来，独立墨线表现叠纸而非空隙。
    const coordinates = [];
    for (let i = 0; i <= columns; i++) coordinates.push([i / columns, .5]);
    coordinates.push([1, -.5]);
    for (let i = columns - 1; i >= 0; i--) coordinates.push([i / columns, -.5]);
    const sideGeometry = new T.BufferGeometry();
    const edgePositions = new T.BufferAttribute(new Float32Array(coordinates.length * 6), 3);
    sideGeometry.setAttribute('position', edgePositions);
    sideGeometry.setIndex(coordinates.slice(1).flatMap((_, i) => [2 * i, 2 * i + 1, 2 * i + 2,
      2 * i + 1, 2 * i + 3, 2 * i + 2]));
    const wall = new T.Mesh(sideGeometry, edgeMaterial);
    wall.frustumCulled = false;
    book.add(wall);
    const lines = Array.from({ length: count }, () => {
      const geometry = new T.BufferGeometry();
      geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(coordinates.length * 3), 3));
      const line = new T.Line(geometry, edgeInk);
      line.frustumCulled = false;
      book.add(line);
      return line;
    });
    return {
      setHeight(number, material) {
        const bottom = c.COVER_DEPTH;
        const height = bottom + Math.max(1, number) * c.PAGE_THICKNESS;
        top.mesh.material = material;
        top.pose(side, height, height);
        coordinates.forEach(([u, z], i) => {
          const x = side * (c.SPINE_GAP + u * width);
          edgePositions.setXYZ(2 * i, x, bottom + arch(u), z * depth);
          edgePositions.setXYZ(2 * i + 1, x, height + arch(u), z * depth);
        });
        edgePositions.needsUpdate = true;
        lines.forEach((line, layer) => {
          line.visible = layer < number;
          if (!line.visible) return;
          const points = line.geometry.attributes.position;
          coordinates.forEach(([u, z], i) => points.setXYZ(i,
            side * (c.SPINE_GAP + u * width + .004), bottom + (layer + .45) * c.PAGE_THICKNESS + arch(u),
            z * (depth + .015)));
          points.needsUpdate = true;
        });
        return height;
      },
    };
  });
  const spine = new T.Mesh(new T.CylinderGeometry(c.SPINE_HEIGHT, c.SPINE_HEIGHT, depth + .03, 14), cover);
  spine.rotation.x = Math.PI / 2;
  spine.position.y = c.SPINE_HEIGHT;
  book.add(spine);
  const ghostMaterials = c.MOTION_BLUR_ALPHA.slice(0, ghostCount).map(opacity => new T.MeshBasicMaterial({
    color: colors.white, side: T.DoubleSide, transparent: true, opacity, depthWrite: false,
  }));
  const moving = Array.from({ length: c.MAX_MOVING_PAGES }, () => {
    const paper = createPaper(T, ink, pages[0]);
    paper.mesh.visible = false;
    book.add(paper.mesh);
    paper.ghosts = ghostMaterials.map(material => {
      const ghost = new T.Mesh(paper.mesh.geometry, material);
      ghost.visible = ghost.frustumCulled = false;
      book.add(ghost);
      return ghost;
    });
    return paper;
  });
  return { stationary, moving, pages };
}
