// 纸面网格使用同一张照片作为纹理。每个三角面保存自己的原始纸面坐标。
const rim = [
  [0, 0], [.31, 0], [.64, 0], [1, 0],
  [1, .33], [1, .67], [1, 1], [.67, 1],
  [.33, 1], [0, 1], [0, .66], [0, .32],
];
const crest = [
  [-2, -27, 15], [-46, -73, 43], [-11, -78, 31], [28, -25, 18],
  [43, -27, 39], [110, -57, 66], [73, 8, 34], [39, 22, 4],
  [29, 56, -6], [-8, 24, -2], [-92, -11, -21], [-34, 4, -14],
];
const center = rim.length;
const uv = [...rim, [.47, .5]];
const closed = [...crest, [12, 14, 21]];
const light = [.10, .06, .25, .02, .14, .13, .30, .18, .29, .14, .32, .17];

const smooth = x => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};

function mapTriangle(ctx, image, face, vertices, shade) {
  const [a, b, c] = vertices;
  const [u, v, w] = face.map(([x, y]) => [x * image.width, y * image.height]);
  const det = (v[0] - u[0]) * (w[1] - u[1]) - (w[0] - u[0]) * (v[1] - u[1]);
  const ax = ((b.x - a.x) * (w[1] - u[1]) - (c.x - a.x) * (v[1] - u[1])) / det;
  const bx = ((c.x - a.x) * (v[0] - u[0]) - (b.x - a.x) * (w[0] - u[0])) / det;
  const ay = ((b.y - a.y) * (w[1] - u[1]) - (c.y - a.y) * (v[1] - u[1])) / det;
  const by = ((c.y - a.y) * (v[0] - u[0]) - (b.y - a.y) * (w[0] - u[0])) / det;
  if (Math.abs(ax * by - bx * ay) < .0001) return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.closePath();
  ctx.fillStyle = '#f5f4eb';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.transform(ax, ay, bx, by, a.x - ax * u[0] - bx * u[1], a.y - ay * u[0] - by * u[1]);
  ctx.drawImage(image, 0, 0);
  ctx.restore();
  if (shade) {
    ctx.fillStyle = `rgba(20,56,145,${shade})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(224,241,255,${shade * .9})`;
    ctx.lineWidth = .7;
    ctx.stroke();
  }
  ctx.restore();
}

export function drawFoldingPaper(ctx, image, width, height, progress, flap = 0) {
  if (progress <= 0) {
    ctx.drawImage(image, -width / 2, -height / 2, width, height);
    return;
  }
  const points = uv.map(([u, v], index) => {
    const delay = index === center ? .13 : .07 + .17 * Math.abs(u - .48);
    const p = smooth((progress - delay) / (1 - delay));
    const [x, y, z] = closed[index];
    const lift = Math.sin(Math.PI * p) * (u - .47) * 54;
    const wing = index === 5 || index === 10 ? flap : 0;
    return {
      x: (u - .5) * width * (1 - p) + x * p - lift * .40,
      y: (v - .5) * height * (1 - p) + y * p - lift * .38 + wing,
      z: z * p + lift,
    };
  });
  const triangles = rim.map((_, i) => {
    const j = (i + 1) % center;
    return { ids: [i, j, center], depth: (points[i].z + points[j].z + points[center].z) / 3, shade: light[i] * smooth(progress * 1.5) };
  });
  triangles.sort((a, b) => a.depth - b.depth);
  for (const { ids, shade } of triangles) {
    mapTriangle(ctx, image, ids.map(i => uv[i]), ids.map(i => points[i]), shade);
  }
}
