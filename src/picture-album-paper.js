import { album as c, photoAlbum as a } from './config.js';
import { pageTexture, makePhotoPage } from './picture-album-layout.js';

const { colors } = c;
const [columns, rows] = c.PAGE_SEGMENTS;
const width = c.PAGE_WIDTH;
const depth = c.PAGE_DEPTH;

export function arch(u) {
  return c.OPEN_ARCH * Math.sin(Math.PI * u) + c.FREE_EDGE_LIFT * u;
}

// 网格以书脊为 u=0；左右面与翻动页共用纹理和网格拓扑。
export function createPaper(T, ink, material) {
  const geometry = new T.PlaneGeometry(1, 1, columns, rows);
  geometry.boundingSphere = new T.Sphere(new T.Vector3(), 2 * (width + depth));
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

export function makeAlbumArt(T, book, count, light, ghostCount, gallery) {
  const ink = new T.LineBasicMaterial({ color: c.INK_COLOR, transparent: true, opacity: c.INK_OUTLINE_ALPHA });
  const coverInk = new T.LineBasicMaterial({ color: colors.cover });
  const cover = new T.MeshBasicMaterial({ color: colors.cover, side: T.DoubleSide });
  const edgeMaterial = new T.MeshBasicMaterial({ color: c.PAGE_SHADE, side: T.DoubleSide });
  const edgeInk = new T.LineBasicMaterial({ color: c.PAGE_EDGE_COLOR });
  const bases = Array.from({ length: a.PAGE_LAYOUTS_COUNT }, (_, i) => pageTexture(T, i));
  const stationary = [-1, 1].map(side => {
    const coverPaper = createPaper(T, coverInk, cover);
    coverPaper.pose(side, c.COVER_DEPTH, c.COVER_DEPTH, 0, 0, 0, 0, Math.PI,
      width + c.COVER_BORDER, depth + 2 * c.COVER_BORDER);
    book.add(coverPaper.mesh);

    const view = makePhotoPage(T, light, bases, gallery);
    const top = createPaper(T, ink, view.material);
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
      mesh: top.mesh, bind: view.bind,
      setHeight(number) {
        const bottom = c.COVER_DEPTH;
        const height = bottom + Math.max(1, number) * c.PAGE_THICKNESS;
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
    const view = makePhotoPage(T, light, bases, gallery);
    const paper = createPaper(T, ink, view.material);
    paper.bind = view.bind;
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
  return { stationary, moving, bases };
}
