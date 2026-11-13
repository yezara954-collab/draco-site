import { Container, Mesh, MeshGeometry, Sprite, Texture } from 'pixi.js';

import { INTRO, WIND } from './motion-config.js';

const LAYERS = ['oak-tree', 'oak-overhang', 'draco', 'paper-crane'];
// Shared world grid: both oak meshes use the same triangles even in their overlap.
const OAK_GRID = { x: 566, y: 53, width: 984, height: 760, columns: 30, rows: 24 };

function smooth(low, high, value) {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
}

function oakWeight(x, y) {
  const outward = smooth(62, 245, Math.abs(x - (1248 + .15 * (y - 370))));
  const crown = 1 - smooth(220, 500, y);
  // Lock the thick trunk and roots. Smaller boughs blend into the canopy.
  const trunk = smooth(340, 475, y) * (1 - smooth(72, 140, Math.abs(x - 1275)));
  return crown * (1 - trunk) * (.34 + .66 * Math.max(outward, 1 - smooth(115, 390, y)));
}

function craneWeight(u, v) {
  const tip = Math.max(1 - smooth(.04, .34, u), 1 - smooth(.13, .48, v));
  return tip * (1 - smooth(.72, .97, u) * smooth(.34, .6, v));
}

function canvas(width, height) {
  const element = document.createElement('canvas');
  element.width = width;
  element.height = height;
  return element;
}

function readWeights(texture) {
  const { width, height } = texture.orig;
  const context = canvas(width, height).getContext('2d');
  context.drawImage(texture.source.resource, 0, 0);
  const pixels = context.getImageData(0, 0, width, height).data;
  return (u, v) => pixels[(Math.round(v * (height - 1)) * width + Math.round(u * (width - 1))) * 4] / 255;
}

function buildGrid(sprite, bounds, oak, dracoWeights) {
  const { x, y, width, height, columns, rows } = bounds;
  // Subdivide only the first five rows so the tiny loose ends have their own vertices.
  const headRows = dracoWeights ? 5 : 0;
  const subdivisions = 4;
  const rowCount = rows + headRows * (subdivisions - 1);
  const vertical = Array.from({ length: rowCount + 1 }, (_, row) =>
    (row < headRows * subdivisions ? row / subdivisions : row - headRows * (subdivisions - 1)) / rows);
  const positions = [];
  const uvs = [];
  const weights = [];
  const indices = [];
  const source = sprite.texture.orig;
  for (let row = 0; row <= rowCount; row++) {
    for (let col = 0; col <= columns; col++) {
      const u = col / columns;
      const v = vertical[row];
      const worldX = x + width * u;
      const worldY = y + height * v;
      positions.push(width * u, height * v);
      // A transparent border lets the two oak meshes cover the same rectangle.
      uvs.push(
        oak ? ((worldX - sprite.x) / sprite.width * source.width + 2) / (source.width + 4) : u,
        oak ? ((worldY - sprite.y) / sprite.height * source.height + 2) / (source.height + 4) : v,
      );
      weights.push(oak ? oakWeight(worldX, worldY) : dracoWeights ? dracoWeights(u, v) : craneWeight(u, v));
      if (col < columns && row < rowCount) {
        const top = row * (columns + 1) + col;
        const bottom = top + columns + 1;
        indices.push(top, top + 1, bottom, top + 1, bottom + 1, bottom);
      }
    }
  }
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices), weights, vertical };
}

function layerTexture(sprite, padded, grid, bounds, debug = false) {
  const { width, height } = sprite.texture.orig;
  const pad = padded ? 2 : 0;
  const image = canvas(width + 2 * pad, height + 2 * pad);
  const context = image.getContext('2d');
  context.drawImage(sprite.texture.source.resource, pad, pad);
  if (debug) {
    const colors = canvas(width, height);
    const brush = colors.getContext('2d');
    const pixels = brush.createImageData(width, height);
    const { columns } = bounds;
    const { vertical } = grid;
    let top = 0;
    for (let y = 0; y < height; y++) {
      const row = (sprite.y + (y + .5) / height * sprite.height - bounds.y) / bounds.height;
      while (top < vertical.length - 2 && row >= vertical[top + 1]) top++;
      const fy = (row - vertical[top]) / (vertical[top + 1] - vertical[top]);
      for (let x = 0; x < width; x++) {
        const col = (sprite.x + (x + .5) / width * sprite.width - bounds.x) / bounds.width * columns;
        const left = Math.min(columns - 1, Math.floor(col));
        const fx = col - left;
        const start = top * (columns + 1) + left;
        const lower = start + columns + 1;
        const w = fx + fy <= 1
          ? grid.weights[start] * (1 - fx - fy) + grid.weights[start + 1] * fx + grid.weights[lower] * fy
          : grid.weights[lower + 1] * (fx + fy - 1) + grid.weights[start + 1] * (1 - fy) + grid.weights[lower] * (1 - fx);
        const pixel = (y * width + x) * 4;
        pixels.data[pixel] = 30 + 225 * w;
        pixels.data[pixel + 1] = 68 - 33 * w;
        pixels.data[pixel + 2] = 255 - 223 * w;
        pixels.data[pixel + 3] = 255;
      }
    }
    brush.putImageData(pixels, 0, 0);
    context.globalCompositeOperation = 'source-in';
    context.drawImage(colors, pad, pad);
  }
  return Texture.from(image);
}

function makeLayer(sprite, { webgl, debug, weights }) {
  const oak = sprite.label.startsWith('oak-');
  const bounds = oak ? OAK_GRID : {
    x: sprite.x, y: sprite.y, width: sprite.width, height: sprite.height,
    columns: weights ? 23 : 10, rows: weights ? 35 : 8,
  };
  const grid = buildGrid(sprite, bounds, oak, weights);
  const layer = new Container({ label: sprite.label + '-wind', x: bounds.x, y: bounds.y });
  const offsetX = sprite.x - bounds.x;
  const offsetY = sprite.y - bounds.y;
  const width = sprite.width;
  const height = sprite.height;
  const geometry = webgl && sprite.label !== 'paper-crane' ? new MeshGeometry({
    positions: grid.positions.slice(), uvs: grid.uvs, indices: grid.indices,
  }) : null;
  function mesh(texture, options) {
    return new Mesh({ geometry, texture, eventMode: 'none', ...options });
  }
  const debugTexture = debug ? layerTexture(sprite, Boolean(geometry) && oak, grid, bounds, true) : null;
  if (geometry) {
    const texture = oak ? layerTexture(sprite, true) : sprite.texture;
    layer.addChild(mesh(texture, { tint: sprite.tint, label: sprite.label + '-mesh' }));
    layer.eventMode = 'static';
    layer.hitArea = {
      contains: (x, y) => sprite.hitArea.contains(
        (x - offsetX) / width * sprite.texture.orig.width,
        (y - offsetY) / height * sprite.texture.orig.height,
      ),
    };
    layer.on('pointertap', event => sprite.emit('pointertap', event));
  } else {
    sprite.position.set(offsetX, offsetY);
    layer.addChild(sprite);
  }
  if (debug) {
    layer.addChild(geometry ? mesh(debugTexture, { alpha: WIND.debugOpacity })
      : new Sprite({ texture: debugTexture, x: offsetX, y: offsetY,
        width, height, alpha: WIND.debugOpacity, eventMode: 'none' }));
  }

  const moving = [];
  grid.weights.forEach((weight, index) => {
    if (!geometry || weight <= 0) return;
    const offset = index * 2;
    const worldX = grid.positions[offset] + bounds.x;
    const worldY = grid.positions[offset + 1] + bounds.y;
    const heightFraction = grid.positions[offset + 1] / bounds.height;
    const material = oak ? WIND.oak : heightFraction < .15 ? WIND.hair : WIND.robe;
    // Hair tips lag behind the roots. Fabric folds travel down from the shoulder.
    const lag = material.delay * (material === WIND.hair ? heightFraction / .15 : heightFraction);
    moving.push({ index, worldX, phase: worldX * .022 + worldY * .031, weight, material, lag });
  });
  return {
    layer, geometry, moving, rest: grid.positions,
    shifts: new Float32Array(grid.weights.length),
    constraints: geometry ? makeConstraints(grid) : [],
  };
}

// A displacement along one fixed vector makes each triangle's area linear
// in the three shifts. Limit only shifts that compress a triangle.
function makeConstraints({ indices, positions }) {
  const dx = WIND.direction;
  const dy = -WIND.lift;
  const constraints = [];
  for (let i = 0; i < indices.length; i += 3) {
    const [a, b, c] = indices.subarray(i, i + 3);
    const bx = positions[2 * b] - positions[2 * a];
    const by = positions[2 * b + 1] - positions[2 * a + 1];
    const cx = positions[2 * c] - positions[2 * a];
    const cy = positions[2 * c + 1] - positions[2 * a + 1];
    const area = bx * cy - by * cx;
    const wb = (dx * cy - dy * cx) / area;
    const wc = (bx * dy - by * dx) / area;
    constraints.push({ a, b, c, wa: -wb - wc, wb, wc });
  }
  return constraints;
}

function keepTrianglesOpen(shifts, constraints) {
  const compression = .72;
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const { a, b, c, wa, wb, wc } of constraints) {
      const da = wa * shifts[a];
      const db = wb * shifts[b];
      const dc = wc * shifts[c];
      if (da + db + dc >= -compression) continue;
      const positive = Math.max(0, da) + Math.max(0, db) + Math.max(0, dc);
      const factor = (compression + positive) / (positive - da - db - dc);
      if (da < 0) shifts[a] *= factor;
      if (db < 0) shifts[b] *= factor;
      if (dc < 0) shifts[c] *= factor;
      changed = true;
    }
    if (!changed) return;
  }
  let scale = 1;
  for (const { a, b, c, wa, wb, wc } of constraints) {
    const loss = -(wa * shifts[a] + wb * shifts[b] + wc * shifts[c]);
    if (loss > compression) scale = Math.min(scale, compression / loss);
  }
  if (scale < 1) for (let i = 0; i < shifts.length; i++) shifts[i] *= scale;
}

function makeGusts() {
  // Seed the first arrival inside the same 6–10 second range as later gusts.
  let seed = 1203;
  let next = 0;
  const arrivals = [];
  return time => {
    while (next <= time + 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const [min, max] = WIND.interval;
      next += min + (max - min) * seed / 4294967296;
      arrivals.push(next);
    }
    while (arrivals.length > 1 && arrivals[0] < time - WIND.rightEdge / WIND.waveSpeed - WIND.gustDuration) {
      arrivals.shift();
    }
    return arrivals;
  };
}

export function createWind(sprites, bounce, { webgl, weightTexture, debug }) {
  const dracoWeights = readWeights(weightTexture);
  const affected = Object.fromEntries(LAYERS.map(name => [
    name, makeLayer(sprites[name], { webgl, debug, weights: name === 'draco' ? dracoWeights : null }),
  ]));
  const draco = affected.draco;
  const movingBounce = webgl ? new Mesh({
    geometry: draco.geometry, texture: bounce.texture, x: bounce.x, y: bounce.y,
    tint: bounce.tint, blendMode: 'add', visible: false, eventMode: 'none', label: bounce.label,
  }) : bounce;
  const gusts = makeGusts();
  const meshes = Object.values(affected).filter(item => item.geometry);
  const oakOverlay = affected['oak-overhang'].geometry;

  return {
    layers: Object.fromEntries(LAYERS.map(name => [name, affected[name].layer])),
    bounce: movingBounce,
    update(time, introTime) {
      const arrivals = gusts(time);
      for (const { geometry, rest, moving, shifts, constraints } of meshes) {
        // Both tree layers use identical positions, including the anti-fold correction.
        if (geometry === oakOverlay) {
          geometry.positions.set(affected['oak-tree'].geometry.positions);
          geometry.getBuffer('aPosition').update();
          continue;
        }
        for (const { index, worldX, phase, weight, material, lag } of moving) {
          const localTime = time - (WIND.rightEdge - worldX) / WIND.waveSpeed - lag;
          const wave = .5 + .5 * Math.sin((time - lag) * 2.9 + phase * .16);
          let gust = 0;
          for (const start of arrivals) {
            const progress = (localTime - start) / WIND.gustDuration;
            if (progress > 0 && progress < 1) gust = Math.sin(Math.PI * progress) ** 2;
          }
          if (introTime !== null) {
            const arrival = INTRO.gustStart + worldX / INTRO.gustSpeed + lag * .28;
            const progress = (introTime - arrival) / INTRO.gustDuration;
            if (progress > 0 && progress < 1) {
              // Quick rise and a longer return to the breeze.
              const pulse = smooth(0, .21, progress) * (1 - smooth(.25, 1, progress));
              gust = Math.max(gust, INTRO.gustStrength * pulse);
            }
          }
          const breeze = material.breeze[0] + wave * (material.breeze[1] - material.breeze[0]);
          const peak = material.gust[0] + wave * (material.gust[1] - material.gust[0]);
          const flutter = 1 - material.flutter * (.5 + .5 * Math.sin(phase + (time - lag) * 12));
          shifts[index] = weight * (breeze + (peak - breeze) * gust) * flutter;
        }
        keepTrianglesOpen(shifts, constraints);
        const positions = geometry.positions;
        for (const { index } of moving) {
          positions[2 * index] = rest[2 * index] + shifts[index] * WIND.direction;
          positions[2 * index + 1] = rest[2 * index + 1] - shifts[index] * WIND.lift;
        }
        geometry.getBuffer('aPosition').update();
      }
    },
    reset() {
      for (const { geometry, rest } of meshes) {
        geometry.positions.set(rest);
        geometry.getBuffer('aPosition').update();
      }
    },
  };
}
