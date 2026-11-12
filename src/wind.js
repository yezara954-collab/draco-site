import { Container, Mesh, MeshGeometry, Sprite, Texture } from 'pixi.js';

const WIND = {
  breeze: .36,             // 持续微风的基础风力
  gust: .64,               // 阵风额外增加的风力
  interval: [6, 10],       // 阵风到达树冠右端的间隔（秒）
  gustDuration: 1.9,       // 阵风经过某个点的持续时间（秒）
  waveSpeed: 460,          // 阵风由右向左的传播速度（舞台像素 / 秒）
  rightEdge: 1540,         // 阵风开始传播的位置（舞台像素）
  hair: .95,               // 发梢最强时向左的最大位移（舞台像素）
  robe: 3.8,               // 袍摆和袖口最强时向左的最大位移
  oak: 3.2,                // 两张树图共用的树冠最大位移
  crane: .8,               // 纸鹤翼尖的最大位移
  craneTilt: 2.2,          // 风给纸鹤叠加的最大倾角（度）
  flutter: .19,            // 边缘颤动占局部位移的比例
  debugOpacity: .52,       // 调试权重图的透明度
};

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
  const positions = [];
  const uvs = [];
  const weights = [];
  const amplitudes = [];
  const indices = [];
  const source = sprite.texture.orig;
  for (let row = 0; row <= rows; row++) {
    for (let col = 0; col <= columns; col++) {
      const u = col / columns;
      const v = row / rows;
      const worldX = x + width * u;
      const worldY = y + height * v;
      positions.push(width * u, height * v);
      // A transparent border lets the two oak meshes cover the same rectangle.
      uvs.push(
        oak ? ((worldX - sprite.x) / sprite.width * source.width + 2) / (source.width + 4) : u,
        oak ? ((worldY - sprite.y) / sprite.height * source.height + 2) / (source.height + 4) : v,
      );
      weights.push(oak ? oakWeight(worldX, worldY) : dracoWeights ? dracoWeights(u, v) : craneWeight(u, v));
      amplitudes.push(oak ? WIND.oak : dracoWeights ? (v < .15 ? WIND.hair : WIND.robe) : WIND.crane);
      if (col < columns && row < rows) {
        const top = row * (columns + 1) + col;
        const bottom = top + columns + 1;
        indices.push(top, top + 1, bottom, top + 1, bottom + 1, bottom);
      }
    }
  }
  return { positions: new Float32Array(positions), uvs: new Float32Array(uvs),
    indices: new Uint32Array(indices), weights, amplitudes };
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
    const { columns, rows } = bounds;
    for (let y = 0; y < height; y++) {
      const row = (sprite.y + (y + .5) / height * sprite.height - bounds.y) / bounds.height * rows;
      const top = Math.min(rows - 1, Math.floor(row));
      const fy = row - top;
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
  const geometry = webgl ? new MeshGeometry({
    positions: grid.positions.slice(), uvs: grid.uvs, indices: grid.indices,
  }) : null;
  function mesh(texture, options) {
    return new Mesh({ geometry, texture, eventMode: 'none', ...options });
  }
  const debugTexture = debug ? layerTexture(sprite, webgl && oak, grid, bounds, true) : null;
  if (webgl) {
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
    layer.addChild(webgl ? mesh(debugTexture, { alpha: WIND.debugOpacity })
      : new Sprite({ texture: debugTexture, x: offsetX, y: offsetY,
        width, height, alpha: WIND.debugOpacity, eventMode: 'none' }));
  }

  const moving = [];
  grid.weights.forEach((weight, index) => {
    if (weight <= 0) return;
    const offset = index * 2;
    const worldX = grid.positions[offset] + bounds.x;
    const worldY = grid.positions[offset + 1] + bounds.y;
    moving.push({ offset, worldX, phase: worldX * .027 + worldY * .032,
      strength: weight * grid.amplitudes[index] });
  });
  return { layer, geometry, rest: grid.positions, moving };
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

  return {
    layers: Object.fromEntries(LAYERS.map(name => [name, affected[name].layer])),
    bounce: movingBounce,
    update(time) {
      const arrivals = gusts(time);
      function pressure(x) {
        const localTime = time - (WIND.rightEdge - x) / WIND.waveSpeed;
        const breeze = WIND.breeze * (.72 + .28 * Math.sin(localTime * 2 + .6));
        let gust = 0;
        for (const start of arrivals) {
          const progress = (localTime - start) / WIND.gustDuration;
          if (progress > 0 && progress < 1) gust += Math.sin(Math.PI * progress) ** 2;
        }
        return breeze + WIND.gust * gust;
      }
      for (const { geometry, rest, moving } of meshes) {
        const positions = geometry.positions;
        for (const { offset, worldX, phase, strength } of moving) {
          const force = pressure(worldX) * strength;
          const flutter = Math.sin(phase + time * 9) * WIND.flutter;
          positions[offset] = rest[offset] - force * (1 - WIND.flutter + flutter);
          positions[offset + 1] = rest[offset + 1] + force * (.15 * Math.sin(phase + time * 3) + flutter);
        }
        geometry.getBuffer('aPosition').update();
      }
      return -WIND.craneTilt * pressure(427);
    },
    reset() {
      for (const { geometry, rest } of meshes) {
        geometry.positions.set(rest);
        geometry.getBuffer('aPosition').update();
      }
    },
  };
}
