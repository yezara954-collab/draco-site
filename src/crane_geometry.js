// 程序化千纸鹤几何。x 指向鸟喙，y 向上，正 z 对应左翅。
export const CRANE_SCALE = 1.0;

export const BODY_TRIANGLES = [
  [[0.95, 0.18, 0], [0, 0.5, 0], [0.02, 0.12, 0.22]],
  [[0.95, 0.18, 0], [0.02, 0.12, -0.22], [0, 0.5, 0]],
  [[-0.95, 0.18, 0], [0.02, 0.12, 0.22], [0, 0.5, 0]],
  [[-0.95, 0.18, 0], [0, 0.5, 0], [0.02, 0.12, -0.22]],
  [[0.95, 0.18, 0], [0.02, 0.12, 0.22], [0, -0.3, 0]],
  [[0.95, 0.18, 0], [0, -0.3, 0], [0.02, 0.12, -0.22]],
  [[-0.95, 0.18, 0], [0, -0.3, 0], [0.02, 0.12, 0.22]],
  [[-0.95, 0.18, 0], [0.02, 0.12, -0.22], [0, -0.3, 0]],
  [[0.9, 0.22, 0.08], [0.96, 0.02, 0], [1.7, 1.12, 0]],
  [[0.96, 0.02, 0], [0.9, 0.22, -0.08], [1.7, 1.12, 0]],
  [[0.9, 0.22, -0.08], [0.9, 0.22, 0.08], [1.7, 1.12, 0]],
  [[0.9, 0.22, 0.08], [0.9, 0.22, -0.08], [0.96, 0.02, 0]],
  [[1.7, 1.12, 0], [1.72, 1.13, 0.05], [2.12, 0.98, 0]],
  [[1.72, 1.13, 0.05], [1.68, 1.18, 0], [2.12, 0.98, 0]],
  [[1.68, 1.18, 0], [1.72, 1.13, -0.05], [2.12, 0.98, 0]],
  [[1.72, 1.13, -0.05], [1.7, 1.12, 0], [2.12, 0.98, 0]],
  [[1.7, 1.12, 0], [1.72, 1.13, -0.05], [1.68, 1.18, 0]],
  [[1.7, 1.12, 0], [1.68, 1.18, 0], [1.72, 1.13, 0.05]],
  [[-0.9, 0.22, 0.08], [-0.96, 0.02, 0], [-1.85, 1, 0]],
  [[-0.96, 0.02, 0], [-0.9, 0.22, -0.08], [-1.85, 1, 0]],
  [[-0.9, 0.22, -0.08], [-0.9, 0.22, 0.08], [-1.85, 1, 0]],
  [[-0.9, 0.22, 0.08], [-0.9, 0.22, -0.08], [-0.96, 0.02, 0]],
];
export const WING_PIVOT = [0, 0.5, 0.06];
export const WING_TRIANGLES_LEFT = [
  [[0.45, 0, 0], [0.05, 0.14, 0.79], [-0.55, 0.06, 0.84]],
  [[0.05, 0.14, 0.79], [-0.55, 0.05, 1.74], [-0.55, 0.06, 0.84]],
  [[-0.55, 0.06, 0.84], [-0.55, 0.05, 1.74], [-0.65, 0, 0]],
  [[0.45, 0, 0], [-0.55, 0.06, 0.84], [-0.65, 0, 0]],
];

function toGeometry(THREE, triangles, mirrorZ = false) {
  const positions = [];
  for (const triangle of triangles) {
    const points = mirrorZ ? [triangle[0], triangle[2], triangle[1]] : triangle;
    for (const p of points) positions.push(p[0], p[1], mirrorZ ? -p[2] : p[2]);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

export function createCrane(THREE, materialFactory) {
  const group = new THREE.Group();
  const bodyGeometry = toGeometry(THREE, BODY_TRIANGLES);
  const wingLeftGeometry = toGeometry(THREE, WING_TRIANGLES_LEFT);
  const wingRightGeometry = toGeometry(THREE, WING_TRIANGLES_LEFT, true);
  group.add(new THREE.Mesh(bodyGeometry, materialFactory('body')));

  const wingLeftPivot = new THREE.Group();
  wingLeftPivot.position.set(WING_PIVOT[0], WING_PIVOT[1], WING_PIVOT[2]);
  wingLeftPivot.add(new THREE.Mesh(wingLeftGeometry, materialFactory('wing')));
  const wingRightPivot = new THREE.Group();
  wingRightPivot.position.set(WING_PIVOT[0], WING_PIVOT[1], -WING_PIVOT[2]);
  wingRightPivot.add(new THREE.Mesh(wingRightGeometry, materialFactory('wing')));
  group.add(wingLeftPivot, wingRightPivot);
  group.scale.setScalar(CRANE_SCALE);

  function setWingAngle(degrees) {
    const angle = THREE.MathUtils.degToRad(degrees);
    wingLeftPivot.rotation.x = -angle;
    wingRightPivot.rotation.x = angle;
  }
  setWingAngle(20);
  return { group, bodyGeometry, wingLeftGeometry, wingRightGeometry, wingLeftPivot, wingRightPivot, setWingAngle };
}
