import { photoAlbum as c, photoUpload, photoFlight } from './config.js';
import { photoCardTexture } from './picture-photo-art.js';

const files = Object.entries(import.meta.glob('./assets/photos/default_*.jpg',
  { eager: true, query: '?url', import: 'default' })).sort(([a], [b]) => a.localeCompare(b));

function loadImage(url) {
  const image = new Image();
  image.src = url;
  return image.decode().then(() => image);
}

export function makeAlbumPhotos(T) {
  const defaults = [], users = new Map();
  const tile = c.PHOTO_ATLAS_TILE;
  let atlas, canvas, ctx, grid = 0, occupants = [], deck = [], last, closed = false;
  let dirty = false, selection = [], tileCursor = 0, poolCursor = 0;
  let seed = crypto.getRandomValues(new Uint32Array(1))[0];
  function random() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }
  const tileIndices = new Map();

  function makeEntry(id, source, isDefault) {
    return { id, texture: photoCardTexture(T, source), isDefault };
  }

  function attach(entry, index) {
    const previous = occupants[index];
    if (previous) tileIndices.delete(previous);
    occupants[index] = entry;
    tileIndices.set(entry, index);
    ctx.drawImage(entry.texture.image, index % grid * tile, Math.floor(index / grid) * tile, tile, tile);
    atlas.needsUpdate = true;
  }

  function allowed(entry) {
    if (!entry) return false;
    if (entry.isDefault) return !users.size || photoUpload.MIX_DEFAULT_RATIO > 0;
    return users.get(entry.id) === entry;
  }

  function sync() {
    if (!dirty || !atlas) return;
    dirty = false;
    selection = users.size ? [...users.values()] : defaults.slice();
    if (users.size && photoUpload.MIX_DEFAULT_RATIO > 0) selection.unshift(...defaults);
    deck = deck.filter(allowed);
    for (const [entry, index] of tileIndices) {
      if (allowed(entry)) continue;
      tileIndices.delete(entry);
      occupants[index] = null;
      ctx.clearRect(index % grid * tile, Math.floor(index / grid) * tile, tile, tile);
      atlas.needsUpdate = true;
    }
    for (const entry of selection) {
      if (tileIndices.has(entry)) continue;
      const index = occupants.indexOf(null);
      if (index < 0) break;
      attach(entry, index);
    }
  }

  const ready = Promise.allSettled(files.map(([, url]) => loadImage(url))).then(results => {
    if (closed) return;
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === 'fulfilled') defaults.push(makeEntry('default-' + i, results[i].value, true));
      else console.error('Picture 默认照片无法加载', files[i][0], results[i].reason);
    }
    dirty = true;
  });

  function pick(exclude, preferredAvoid) {
    const available = entry => tileIndices.has(entry) && !exclude?.includes(entry);
    const wantDefault = users.size && random() < photoUpload.MIX_DEFAULT_RATIO;
    const matching = entry => available(entry) && (!users.size || entry.isDefault === Boolean(wantDefault));
    let index = deck.findIndex(entry => matching(entry) && entry !== last && entry !== preferredAvoid);
    if (index < 0) {
      if (!deck.some(matching)) {
        deck = selection.slice();
        for (let i = deck.length - 1; i > 0; i--) {
          const j = Math.floor(random() * (i + 1));
          [deck[i], deck[j]] = [deck[j], deck[i]];
        }
      }
      index = deck.findIndex(entry => matching(entry) && entry !== last && entry !== preferredAvoid);
      if (index < 0) index = deck.findIndex(entry => matching(entry) && entry !== preferredAvoid);
      if (index < 0) index = deck.findIndex(matching);
      if (index < 0) index = deck.findIndex(available);
    }
    if (index >= 0) last = deck.splice(index, 1)[0];
    else last = selection.find(available) ?? selection.find(entry => tileIndices.has(entry)) ?? null;
    return last;
  }

  function release(entry) {
    entry.texture.dispose();
    entry.texture.image.width = entry.texture.image.height = 0;
  }

  function unseen(seen, previous) {
    const canUse = entry => !seen.has(entry) && entry !== previous;
    for (const entry of deck) if (canUse(entry) && allowed(entry)) return entry;
    return selection.find(canUse) ?? selection.find(entry => !seen.has(entry)) ?? null;
  }

  function ensure(entry, protectedEntries) {
    if (!allowed(entry)) return false;
    if (tileIndices.has(entry)) return true;
    let index = occupants.indexOf(null);
    if (index < 0) {
      for (let i = 0; i < occupants.length; i++) {
        const at = (tileCursor + i) % occupants.length;
        if (!protectedEntries.has(occupants[at])) { index = at; break; }
      }
    }
    if (index < 0) return false;
    attach(entry, index);
    tileCursor = (index + 1) % occupants.length;
    return true;
  }

  return {
    ready, sync, allowed, pick, unseen,
    get poolKey() { return users.size ? 'users' : 'defaults'; },
    get atlas() { return atlas; },
    get grid() { return grid; },
    get bytes() {
      const cardBytes = photoFlight.PHOTO_TEXTURE_SIZE * Math.round(photoFlight.PHOTO_TEXTURE_SIZE *
        photoFlight.PHOTO_ASPECT) * 4 * 4 / 3;
      return (canvas?.width ?? 0) ** 2 * 4 + (defaults.length + users.size) * cardBytes;
    },
    index: entry => tileIndices.get(entry) ?? -1,
    ensure,
    develop(exclude, previous, protectedEntries) {
      // 手机页图集只有 16 个格子。显影时轮换不可见的格子，让后续出片覆盖整个池。
      for (let i = 0; i < selection.length; i++) {
        const at = (poolCursor + i) % selection.length;
        const entry = selection[at];
        if (entry === previous || exclude.includes(entry) || tileIndices.has(entry)) continue;
        if (ensure(entry, protectedEntries)) { poolCursor = (at + 1) % selection.length; return entry; }
      }
      return pick(exclude, previous);
    },
    add({ id, source }) {
      if (users.has(id)) return users.get(id);
      const entry = makeEntry(id, source, false);
      users.set(id, entry);
      dirty = true;
      return entry;
    },
    clear() {
      for (const entry of users.values()) release(entry);
      users.clear();
      dirty = true;
      sync();
    },
    fit(mobile) {
      const size = c.PHOTO_ATLAS_SIZE[mobile ? 'mobile' : 'desktop'];
      if (canvas?.width === size) return;
      atlas?.dispose();
      canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      ctx = canvas.getContext('2d', { alpha: false });
      grid = size / tile;
      occupants = Array(grid * grid).fill(null);
      tileIndices.clear();
      atlas = new T.CanvasTexture(canvas);
      atlas.colorSpace = T.SRGBColorSpace;
      atlas.minFilter = T.LinearFilter;
      atlas.magFilter = T.LinearFilter;
      atlas.generateMipmaps = false;
      dirty = true;
      sync();
    },
    destroy() {
      closed = true;
      atlas?.dispose();
      for (const entry of defaults) release(entry);
      for (const entry of users.values()) release(entry);
      users.clear();
    },
  };
}
