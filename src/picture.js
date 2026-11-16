import { getSiteAudioContext } from './site-audio.js';
import { picture as config, album as settings, photoFlight } from './config.js';
import { makeAlbumAir } from './picture-album-air.js';
import { mountAlbum } from './picture-album.js';
import { makeSky } from './picture-sky.js';
import { makeImpactSound } from './picture-sound.js';
import { mountPhotoUploads } from './picture-upload.js';
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
        <button type="button" class="picture-upload" title="照片仅存于当前浏览器，其他访客不可见">添加照片</button>
        <button type="button" class="picture-clear" hidden>清除照片</button>
      </div>
      <input type="file" accept="image/jpeg,image/png,image/webp" multiple hidden>
      <p class="picture-status picture-upload-status" role="status"></p>
      <p class="picture-status picture-upload-note" role="status"></p>
      <p class="picture-status picture-render-status" role="status"></p>
    </div>`;
  host.append(scene);
  const debug = new URLSearchParams(location.search).get('debug') === '1'
    ? document.createElement('div') : null;
  let debugSince = 0, debugFrames = 0, debugTotal = 0;
  if (debug) {
    debug.className = 'picture-debug';
    debug.textContent = 'FPS —　纸鹤 0　粒子 0　帧耗时 —';
    scene.append(debug);
    document.addEventListener('visibilitychange', () => {
      debugSince = debugFrames = debugTotal = 0;
    }, { signal });
  }
  const canvas = scene.querySelector('canvas');
  const status = scene.querySelector('.picture-render-status');
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
  const uploads = mountPhotoUploads(scene, signal, motion, photo => book?.addPhoto(photo), () => book?.clearPhotos());
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
    book = mountAlbum(THREE, scene.querySelector('.picture-album'), air, motion);
    book.fit();
    for (const photo of uploads.photos.values()) book.addPhoto(photo);
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

  return {
    update(dt) {
      const started = debug && !document.hidden ? performance.now() : 0;
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
      if (started) {
        if (!debugSince) debugSince = started;
        else {
          debugFrames++;
          debugTotal += performance.now() - started;
          const elapsed = started - debugSince;
          if (elapsed >= photoFlight.CRANE_DEBUG_INTERVAL * 1000) {
            const frame = elapsed / debugFrames;
            debug.textContent = `FPS ${(1000 / frame).toFixed(1)}　纸鹤 ${book?.craneCount ?? 0}　粒子 ${book?.particleCount ?? 0}
` +
              `帧间隔 ${frame.toFixed(1)} ms　场景 CPU ${(debugTotal / debugFrames).toFixed(1)} ms` +
              (albumReady && !book ? '　WebGL 不可用' : '');
            debugSince = started;
            debugFrames = debugTotal = 0;
          }
        }
      }
    },
    destroy() {
      lifetime.abort();
      observer.disconnect();
      book?.destroy();
      sound.destroy();
      uploads.destroy();
      scene.remove();
    },
  };
}
