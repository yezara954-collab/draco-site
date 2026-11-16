import { photoUpload as c } from './config.js';
import {
  openPhotoLibrary, PhotoLimitError, preparePhoto, restorePhoto, UnsupportedPhotoError,
} from './picture-storage.js';

export function mountPhotoUploads(scene, signal, motion, onPhoto, onClear) {
  const upload = scene.querySelector('.picture-upload');
  const clear = scene.querySelector('.picture-clear');
  const input = scene.querySelector('input[type="file"]');
  const status = scene.querySelector('.picture-upload-status');
  const note = scene.querySelector('.picture-upload-note');
  const photos = new Map();
  let library, busy = false, storedAny = false, notice;
  const limitText = `最多保存 ${c.UPLOAD_MAX_PHOTOS} 张`;

  function progress(text) {
    notice?.cancel();
    status.textContent = text;
  }

  function success(count) {
    progress(`已添加 ${count} 张照片`);
    const duration = c.UPLOAD_NOTICE_SECONDS * 1000;
    notice = status.animate(motion.matches
      ? [{ opacity: .72 }, { opacity: .72 }]
      : [{ opacity: 0 }, { opacity: .72, offset: .12 }, { opacity: .72, offset: .76 }, { opacity: 0 }],
    { duration });
    notice.onfinish = () => { status.textContent = ''; };
  }

  function setBusy(value) {
    busy = value;
    upload.disabled = clear.disabled = value;
    clear.hidden = !photos.size && !storedAny;
  }

  function add(id, source, priority) {
    const photo = { id, source, priority };
    photos.set(id, photo);
    clear.hidden = false;
    onPhoto(photo);
  }

  async function restore() {
    if (!c.PERSIST_PHOTOS) return;
    setBusy(true);
    try {
      library = await openPhotoLibrary();
      if (signal.aborted) {
        library.close();
        return;
      }
      const saved = await library.list();
      storedAny = saved.length > 0;
      for (const photo of saved) {
        try {
          const source = await restorePhoto(photo, signal);
          if (signal.aborted) { source.width = source.height = 0; return; }
          add(photo.id, source, false);
        } catch {
          if (signal.aborted) return;
          // 一张旧照片损坏时继续恢复其余照片。
        }
      }
    } catch {
      if (!signal.aborted) note.textContent = '无法打开本机照片库，本次添加的照片仅在当前页面可用。';
    } finally {
      if (!signal.aborted) setBusy(false);
    }
  }

  upload.addEventListener('click', () => input.click(), { signal });
  input.addEventListener('change', async () => {
    const files = Array.from(input.files);
    input.value = '';
    if (!files.length || busy) return;
    setBusy(true);
    note.textContent = '';
    let added = 0, unsupported = false, full = false, notSaved = false, failed = false;
    try {
      for (let i = 0; i < files.length; i++) {
        if (photos.size >= c.UPLOAD_MAX_PHOTOS) { full = true; break; }
        progress(`正在处理照片 ${i + 1} / ${files.length}`);
        let source;
        try {
          const prepared = await preparePhoto(files[i], signal, Boolean(library));
          source = prepared.source;
          let id = Symbol();
          if (library) {
            try { id = await library.add(prepared.record); storedAny = true; }
            catch (error) {
              if (error instanceof PhotoLimitError) { full = storedAny = true; break; }
              notSaved = true;
            }
          } else if (c.PERSIST_PHOTOS) notSaved = true;
          if (signal.aborted) return;
          add(id, source, true);
          source = null; // 所有权交给本机照片列表。
          added++;
        } catch (error) {
          if (signal.aborted) return;
          if (error instanceof UnsupportedPhotoError) unsupported = true;
          else failed = true;
        } finally {
          if (source) source.width = source.height = 0;
        }
      }
    } finally {
      if (!signal.aborted) {
        if (added) success(added);
        else progress('');
        note.textContent = [
          unsupported ? '这张照片格式暂不支持' : '',
          full ? limitText : '',
          failed ? '部分照片无法处理' : '',
          notSaved ? '部分照片仅在当前页面可用' : '',
        ].filter(Boolean).join(' · ');
        setBusy(false);
      }
    }
  }, { signal });

  clear.addEventListener('click', async () => {
    if (busy || (!photos.size && !storedAny) || !window.confirm('清除保存在这个浏览器里的全部照片？')) return;
    setBusy(true);
    try {
      await library?.clear();
      if (signal.aborted) return;
      onClear();
      storedAny = false;
      release();
      progress('');
      note.textContent = '已清除照片';
    } catch {
      if (!signal.aborted) note.textContent = '暂时无法清除照片，请重试。';
    } finally {
      if (!signal.aborted) {
        setBusy(false);
        if (!photos.size) upload.focus({ preventScroll: true });
      }
    }
  }, { signal });

  function release() {
    for (const { source } of photos.values()) source.width = source.height = 0;
    photos.clear();
  }

  restore();
  return {
    photos,
    destroy() { notice?.cancel(); library?.close(); release(); },
  };
}
