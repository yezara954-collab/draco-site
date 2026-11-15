import { getSiteAudioContext } from './site-audio.js';
import { picture as config, album as settings } from './config.js';
import { makeAlbumAir } from './picture-album-air.js';
import { mountAlbum } from './picture-album.js';
import { makeSky } from './picture-sky.js';
import { makeImpactSound } from './picture-sound.js';
import { openPhotoLibrary, preparePhoto } from './picture-storage.js';
import './picture.css';

const { palette } = config;

export function mountPicture(host) {
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const scene = document.createElement('section');
  scene.className = 'picture-scene';
  scene.setAttribute('aria-label', 'Picture 星空与流苏');
  scene.style.setProperty('--picture-black', palette.black);
  scene.style.setProperty('--picture-ink', palette.ink);
  scene.innerHTML = `
    <canvas class="picture-sky" aria-hidden="true"></canvas>
    <canvas class="picture-ground-light" aria-hidden="true"></canvas>
    <canvas class="picture-album" aria-hidden="true"></canvas>
    <div class="picture-controls">
      <div class="picture-actions">
        <button type="button" class="picture-sound"></button>
        <button type="button" class="picture-upload">添加照片</button>
      </div>
      <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple hidden>
      <p class="picture-status" role="status"></p>
    </div>`;
  host.append(scene);
  const canvas = scene.querySelector('canvas');
  const upload = scene.querySelector('.picture-upload');
  const input = scene.querySelector('input');
  const status = scene.querySelector('[role="status"]');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const sound = makeImpactSound();
  const toggle = scene.querySelector('.picture-sound');
  function labelSound() {
    toggle.setAttribute('aria-label', sound.enabled ? '关闭音效' : '开启音效');
    toggle.setAttribute('aria-pressed', String(sound.enabled));
    toggle.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9h4l5-4v14l-5-4H4z"/>${sound.enabled ? '<path d="M16 9a4 4 0 0 1 0 6m2-8a7 7 0 0 1 0 10"/>' : '<path d="m16 10 5 5m0-5-5 5"/>'}</svg>`;
  }
  labelSound();
  scene.addEventListener('click', event => {
    if (!toggle.contains(event.target)) sound.unlock();
  }, { signal });
  toggle.addEventListener('click', () => { sound.toggle(); labelSound(); }, { signal });
  document.addEventListener('visibilitychange', sound.sync, { signal });

  let book, albumReady = false;
  let intro = -1;
  let introStarted = false;
  const drawing = makeSky(canvas, motion, sound.play, sound.chime);
  drawing.fit();
  const air = makeAlbumAir(scene.querySelector('.picture-ground-light'));
  const observer = new ResizeObserver(() => {
    drawing.fit();
    book?.fit();
  });
  observer.observe(canvas);
  motion.addEventListener('change', () => {
    intro = settings.INTRO_WIND_DURATION;
    introStarted = true;
    if (motion.matches) {
      drawing.settle();
      book?.settle();
    }
  }, { signal });
  const moduleName = settings.THREE_MODULE;
  import(/* @vite-ignore */ moduleName).then(THREE => {
    if (signal.aborted) return;
    book = mountAlbum(THREE, scene.querySelector('.picture-album'), air, motion, drawing.samplePhotoWind);
    book.fit();
    if (motion.matches) {
      intro = settings.INTRO_WIND_DURATION;
      introStarted = true;
    }
  }).catch(error => {
    if (signal.aborted) return;
    book?.destroy();
    book = undefined;
    status.textContent = '相册暂时无法显示。请检查网络或浏览器的 WebGL 支持。';
    console.warn('Picture 相册 3D 图层加载失败', error);
  }).finally(() => { albumReady = !signal.aborted; });

  let library;
  upload.addEventListener('click', () => input.click(), { signal });
  input.addEventListener('change', async () => {
    const files = Array.from(input.files);
    input.value = '';
    if (!files.length) return;
    upload.disabled = true;
    let saved = 0;
    let failed = 0;
    try {
      library ??= await openPhotoLibrary();
      if (signal.aborted) {
        library.close();
        return;
      }
      for (const file of files) {
        try {
          const photo = await preparePhoto(file, signal);
          await library.add(photo);
          saved++;
        } catch {
          if (signal.aborted) return;
          failed++;
        }
      }
      if (!signal.aborted) {
        status.textContent = `已在本地保存 ${saved} 张${failed ? `，${failed} 张无法读取或保存` : ''}。照片将在后续阶段用于相册。`;
      }
    } catch {
      if (!signal.aborted) status.textContent = '无法打开本地照片库。';
    } finally {
      if (!signal.aborted) upload.disabled = false;
    }
  }, { signal });
  return {
    update(dt) {
      if (albumReady && !document.hidden && !motion.matches) {
        if (!introStarted) {
          introStarted = true;
          const state = getSiteAudioContext()?.state === 'running' ? 'running' : 'suspended';
          console.info(`audio state at intro: ${state}`);
          intro = 0;
        }
        if (intro < settings.INTRO_WIND_DURATION) {
          intro = Math.min(settings.INTRO_WIND_DURATION, intro + Math.min(dt, config.display.maxStep));
        }
      }
      drawing.update(dt, intro, book?.photoPushes);
      book?.update(dt, intro, drawing.sampleWind(settings.BOOK_CENTER_X, settings.WIND_SAMPLE_LAG), drawing.lights);
    },
    destroy() {
      lifetime.abort();
      observer.disconnect();
      book?.destroy();
      sound.destroy();
      library?.close();
      scene.remove();
    },
  };
}
