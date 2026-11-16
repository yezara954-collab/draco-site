import { photoFlight, photoUpload as c } from './config.js';

const databaseName = 'draco-picture';
const storeName = 'photos';
const formats = new Set(['image/jpeg', 'image/png', 'image/webp']);
const editVersion = 1;

export class UnsupportedPhotoError extends Error {}
export class PhotoLimitError extends Error {}

export function openPhotoLibrary() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(storeName, { keyPath: 'id', autoIncrement: true });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      function transact(mode, operation) {
        return new Promise((done, failed) => {
          const transaction = db.transaction(storeName, mode);
          let action, failure;
          transaction.oncomplete = () => done(action?.result);
          transaction.onabort = () => failed(failure ?? transaction.error);
          const store = transaction.objectStore(storeName);
          operation(store, next => { action = next; }, error => {
            failure = error;
            transaction.abort();
          });
        });
      }
      resolve({
        list: () => transact('readonly', (store, use) => use(store.getAll(undefined, c.UPLOAD_MAX_PHOTOS))),
        add: photo => transact('readwrite', (store, use, abort) => {
          const count = store.count();
          // 同一事务检查并写入，多标签页同时添加也不会超过上限。
          count.onsuccess = () => {
            if (count.result >= c.UPLOAD_MAX_PHOTOS) abort(new PhotoLimitError());
            else use(store.add(photo));
          };
        }),
        clear: () => transact('readwrite', (store, use) => use(store.clear())),
        close: () => db.close(),
      });
    };
  });
}

export function waitForPhotoFrame(signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    let frame = 0;
    function schedule() {
      frame = 0;
      if (document.hidden) {
        document.addEventListener('visibilitychange', schedule, { once: true });
        return;
      }
      frame = requestAnimationFrame(() => {
        if (document.hidden) { schedule(); return; }
        signal.removeEventListener('abort', abort);
        resolve();
      });
    }
    function abort() {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', schedule);
      reject(signal.reason);
    }
    signal.addEventListener('abort', abort, { once: true });
    schedule();
  });
}

function squareCanvas(edge) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = edge;
  return canvas;
}

function tintFilm(ctx, edge) {
  const image = ctx.getImageData(0, 0, edge, edge);
  const { data } = image;
  const [warmR, warmG, warmB] = c.FILM_WARM_COLOR;
  let seed = 9127;
  for (let y = 0, i = 0; y < edge; y++) {
    const dy = 2 * (y + .5) / edge - 1;
    for (let x = 0; x < edge; x++, i += 4) {
      const dx = 2 * (x + .5) / edge - 1;
      const vignette = 1 - c.FILM_VIGNETTE * ((dx * dx + dy * dy) * .5) ** 2;
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      const grain = ((seed >>> 0) / 4294967295 * 2 - 1) * c.FILM_GRAIN * 255;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const gray = .2126 * r + .7152 * g + .0722 * b;
      data[i] = ((r + (gray - r) * c.FILM_DESAT) * (1 - c.FILM_WARM) + warmR * c.FILM_WARM) * vignette + grain;
      data[i + 1] = ((g + (gray - g) * c.FILM_DESAT) * (1 - c.FILM_WARM) + warmG * c.FILM_WARM) * vignette + grain;
      data[i + 2] = ((b + (gray - b) * c.FILM_DESAT) * (1 - c.FILM_WARM) + warmB * c.FILM_WARM) * vignette + grain;
    }
  }
  ctx.putImageData(image, 0, 0);
}

function drawSquare(bitmap, maximum, film) {
  const size = Math.min(bitmap.width, bitmap.height);
  const canvas = squareCanvas(Math.min(size, maximum));
  const ctx = canvas.getContext('2d', { alpha: false, willReadFrequently: film });
  ctx.fillStyle = photoFlight.PHOTO_PAPER_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (bitmap.width - size) / 2, (bitmap.height - size) / 2, size, size,
    0, 0, canvas.width, canvas.height);
  if (film) tintFilm(ctx, canvas.width);
  return canvas;
}

function previewOf(canvas) {
  if (canvas.width <= photoFlight.PHOTO_TEXTURE_SIZE) return canvas;
  const preview = squareCanvas(photoFlight.PHOTO_TEXTURE_SIZE);
  const ctx = preview.getContext('2d', { alpha: false });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, 0, 0, preview.width, preview.height);
  canvas.width = canvas.height = 0;
  return preview;
}

async function decode(blob, signal, use) {
  await waitForPhotoFrame(signal);
  let bitmap;
  try {
    try {
      bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    } catch {
      signal.throwIfAborted();
      throw new UnsupportedPhotoError();
    }
    await waitForPhotoFrame(signal);
    return use(bitmap);
  } finally {
    bitmap?.close();
  }
}

export async function preparePhoto(file, signal, persist) {
  if (!formats.has(file.type) && (file.type || !/\.(jpe?g|png|webp)$/i.test(file.name))) {
    throw new UnsupportedPhotoError();
  }
  const canvas = await decode(file, signal, bitmap => drawSquare(bitmap, c.UPLOAD_MAX_SIDE, true));
  let blob;
  try {
    if (persist) {
      blob = await new Promise((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('无法生成照片')), 'image/webp', c.UPLOAD_QUALITY);
      });
    }
    await waitForPhotoFrame(signal);
    return { source: previewOf(canvas), record: { name: file.name, blob, editVersion } };
  } catch (error) {
    canvas.width = canvas.height = 0;
    throw error;
  }
}

export function restorePhoto(record, signal) {
  return decode(record.blob, signal, bitmap =>
    drawSquare(bitmap, photoFlight.PHOTO_TEXTURE_SIZE, record.editVersion !== editVersion));
}
