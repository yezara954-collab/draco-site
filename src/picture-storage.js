import { PICTURE } from './motion-config.js';

const databaseName = 'draco-picture';
const storeName = 'photos';
const formats = new Set(['image/jpeg', 'image/png', 'image/webp']);

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
          const action = operation(transaction.objectStore(storeName));
          transaction.oncomplete = () => done(action.result);
          transaction.onabort = () => failed(transaction.error);
        });
      }
      resolve({
        list: () => transact('readonly', store => store.getAll()),
        add: photo => transact('readwrite', store => store.add(photo)),
        remove: id => transact('readwrite', store => store.delete(id)),
        close: () => db.close(),
      });
    };
  });
}

export async function withPhotoImage(blob, useImage) {
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return await useImage(image);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function resizeImage(image, maxEdge, quality) {
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      canvas.width = canvas.height = 0;
      if (blob) resolve(blob);
      else reject(new Error('无法生成缩放图片'));
    }, 'image/webp', quality);
  });
}

export async function preparePhoto(file, signal) {
  if (!formats.has(file.type) && (file.type || !/\.(jpe?g|png|webp)$/i.test(file.name))) {
    throw new Error('请选择 JPEG、PNG 或 WebP 图片');
  }
  if (file.size > PICTURE.photo.maxBytes) throw new Error('图片超过单张 25 MiB 上限');
  return withPhotoImage(file, async image => {
    signal.throwIfAborted();
    const { maxEdge, thumbnailEdge, quality, thumbnailQuality } = PICTURE.photo;
    const [blob, thumbnail] = await Promise.all([
      resizeImage(image, maxEdge, quality),
      resizeImage(image, thumbnailEdge, thumbnailQuality),
    ]);
    signal.throwIfAborted();
    return { name: file.name, blob, thumbnail };
  });
}
