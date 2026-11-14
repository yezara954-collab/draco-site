import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { gsap } from 'gsap';
import { PICTURE as config } from './motion-config.js';
import { openPhotoLibrary, preparePhoto, withPhotoImage } from './picture-storage.js';
import './picture.css';

const { stage, camera, paper, colors, timing } = config;

function makeStars() {
  const stars = new Graphics();
  const { count, seed, color, crossColor, radius, alpha } = config.stars;
  let state = seed;
  function random() {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  }
  for (let i = 0; i < count; i++) {
    const x = random() * stage.width;
    const y = random() * stage.height;
    stars.circle(x, y, radius[0] + random() * (radius[1] - radius[0]))
      .fill({ color, alpha: alpha[0] + random() * (alpha[1] - alpha[0]) });
    if (i % 17 === 0) {
      stars.moveTo(x - 4, y).lineTo(x + 4, y).moveTo(x, y - 4).lineTo(x, y + 4)
        .stroke({ color: crossColor, width: .8, alpha: .32 });
    }
  }
  return stars;
}

function makeCamera() {
  const rig = new Container({ label: 'picture-camera', x: camera.x, y: camera.y });
  const scale = new Container({ label: 'camera-artwork' });
  scale.scale.set(camera.width / 412, camera.height / 340);
  rig.addChild(scale);
  const body = new Graphics({ label: 'camera-body' });
  body.roundRect(-204, -145, 408, 297, 37).fill(colors.shadow).stroke({ color: colors.seam, width: 1.5 })
    .roundRect(-192, -162, 384, 224, 45).fill(colors.body).stroke({ color: colors.seam, width: 1.8 })
    .roundRect(-175, -143, 350, 164, 30).fill(colors.shell)
    .moveTo(-184, 31).lineTo(184, 31).stroke({ color: colors.seam, alpha: .7, width: 1.5 })
    .roundRect(-188, 67, 376, 69, 17).fill(colors.body)
    .roundRect(-157, -113, 89, 56, 10).fill(colors.shadow).stroke({ color: colors.seam, width: 1.5 })
    .roundRect(-147, -103, 69, 36, 6).fill(colors.lens)
    .roundRect(105, -109, 49, 34, 7).fill(colors.shadow).stroke({ color: colors.seam, width: 1.3 })
    .circle(133, -22, 20).fill(colors.shadow).stroke({ color: colors.gold, width: 2 })
    .circle(133, -22, 14).fill(colors.body).circle(133, -22, 2.5).fill(colors.gold);
  colors.stripes.forEach((color, index) => {
    body.roundRect(-22 + index * 11, 32, 11, 36, 2).fill(color);
  });
  const lens = new Graphics({ label: 'camera-lens' });
  lens.circle(0, -44, 80).fill(colors.shadow).stroke({ color: colors.seam, width: 2 })
    .circle(0, -44, 66).stroke({ color: colors.gold, width: 1.1, alpha: .76 })
    .circle(0, -44, 55).fill(colors.lens).stroke({ color: colors.seam, width: 1.6 })
    .circle(0, -44, 39).fill(colors.shadow)
    .ellipse(-15, -58, 14, 7).fill({ color: colors.flash, alpha: .28 })
    .circle(17, -28, 5).fill({ color: colors.flash, alpha: .13 });
  const light = new Graphics({ label: 'lens-flash', alpha: 0 });
  light.circle(0, -44, 56).fill({ color: colors.flash, alpha: .23 })
    .circle(0, -44, 37).fill({ color: colors.flash, alpha: .53 })
    .circle(0, -44, 15).fill(colors.flash);
  const slot = new Graphics({ label: 'camera-slot', x: camera.slot.x, y: camera.slot.y })
    .roundRect(-camera.slot.width / 2, -camera.slot.height / 2, camera.slot.width, camera.slot.height, 6)
    .fill(colors.shadow).stroke({ color: colors.seam, width: 1.15 });
  rig.addChild(slot);
  scale.addChild(body, lens, light);
  const lip = new Graphics({ label: 'camera-slot-foreground', x: camera.slot.x, y: camera.slot.y })
    .moveTo(-camera.slot.width / 2 + 6, 1).lineTo(camera.slot.width / 2 - 6, 1)
    .stroke({ color: colors.shadow, width: 4, cap: 'round' })
    .moveTo(-camera.slot.width / 2 + 7, -2).lineTo(camera.slot.width / 2 - 7, -2)
    .stroke({ color: colors.seam, width: 1.2, alpha: .8 });
  return { rig, light, lip };
}

export function mountPicture(host) {
  const lifetime = new AbortController();
  const { signal } = lifetime;
  const scene = document.createElement('section');
  scene.className = 'picture-scene';
  scene.setAttribute('aria-label', 'Picture 拍立得');
  scene.innerHTML = `
    <div class="picture-stage-area">
      <div class="picture-stage">
        <button type="button" class="picture-shutter" aria-label="按下拍立得快门" disabled></button>
      </div>
    </div>
    <div class="picture-library">
      <div class="picture-library-header">
        <h2 class="picture-library-title">Picture</h2>
        <button type="button" class="picture-upload" disabled>添加照片</button>
        <input type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" multiple hidden>
      </div>
      <ul class="picture-thumbnails" aria-label="已添加的照片"></ul>
      <p class="picture-status" role="status"></p>
    </div>`;
  const surface = scene.querySelector('.picture-stage');
  const shutter = scene.querySelector('.picture-shutter');
  const upload = scene.querySelector('.picture-upload');
  const input = scene.querySelector('input');
  const thumbnails = scene.querySelector('ul');
  const status = scene.querySelector('.picture-status');
  surface.style.setProperty('--picture-stage-ratio', stage.width / stage.height);
  Object.assign(shutter.style, {
    left: `${100 * (camera.x - camera.width / 2) / stage.width}%`,
    top: `${100 * (camera.y - camera.height / 2) / stage.height}%`,
    width: `${100 * camera.width / stage.width}%`,
    height: `${100 * camera.height / stage.height}%`,
  });
  host.prepend(scene);

  let app;
  let library;
  let cameraArt;
  let sheet;
  let sheetMask;
  let photoTexture;
  let timeline;
  let clock = 0;
  let printedId;
  let printing = false;
  let saving = false;
  let records = [];
  let currentId;
  const urls = new Map();
  const motion = matchMedia('(prefers-reduced-motion: reduce)');

  function report(message, error = false) {
    status.textContent = message;
    status.dataset.error = String(error);
  }

  function syncControls() {
    upload.disabled = !library || saving;
    shutter.disabled = !app || !library || printing;
    shutter.setAttribute('aria-busy', String(printing));
  }

  function readyMessage() {
    if (!records.length) return '添加照片后，点击相机出片。照片仅保存在当前浏览器。';
    return '点击相机出片。拍完会按添加顺序选中下一张。';
  }

  function choose(id) {
    currentId = id;
    for (const button of thumbnails.querySelectorAll('.picture-select')) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.id) === id));
    }
  }

  function addThumbnail(record) {
    const item = document.createElement('li');
    item.className = 'picture-thumbnail';
    item.dataset.id = record.id;
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'picture-select';
    select.dataset.id = record.id;
    select.setAttribute('aria-label', `选择 ${record.name}`);
    select.title = record.name;
    const image = new Image();
    const url = URL.createObjectURL(record.thumbnail);
    urls.set(record.id, url);
    image.src = url;
    image.alt = '';
    select.append(image);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'picture-delete';
    remove.setAttribute('aria-label', `删除 ${record.name}`);
    remove.textContent = '×';
    item.append(select, remove);
    thumbnails.append(item);
  }

  thumbnails.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button) return;
    const item = button.closest('li');
    const id = Number(item.dataset.id);
    if (button.classList.contains('picture-select')) {
      choose(id);
      return;
    }
    button.disabled = true;
    try {
      await library.remove(id);
      if (signal.aborted) return;
      const position = records.findIndex(record => record.id === id);
      records = records.filter(record => record.id !== id);
      item.remove();
      URL.revokeObjectURL(urls.get(id));
      urls.delete(id);
      if (currentId === id) choose(records[position]?.id ?? records[0]?.id);
      thumbnails.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
      if (!records.length) upload.focus({ preventScroll: true });
      report(readyMessage());
    } catch {
      if (signal.aborted) return;
      button.disabled = false;
      report('照片删除失败，请重试。', true);
    }
  }, { signal });

  upload.addEventListener('click', () => input.click(), { signal });
  input.addEventListener('change', async () => {
    const files = [...input.files];
    input.value = '';
    if (saving || !library || !files.length) return;
    saving = true;
    syncControls();
    report('正在读取和保存照片…');
    let count = 0;
    const failures = [];
    try {
      for (const file of files) {
        let photo;
        try {
          photo = await preparePhoto(file, signal);
        } catch (error) {
          if (signal.aborted) return;
          failures.push(`${file.name}：${error.name === 'EncodingError' ? '图片损坏或无法解码' : error.message}`);
          continue;
        }
        try {
          const id = await library.add(photo);
          if (signal.aborted) return;
          const record = { ...photo, id };
          records.push(record);
          addThumbnail(record);
          count++;
          if (currentId === undefined) choose(id);
          else choose(currentId);
        } catch {
          if (signal.aborted) return;
          failures.push(`${file.name}：保存失败，请检查浏览器存储空间和权限`);
        }
      }
      report(failures.length ? `已保存 ${count} 张。${failures.join('；')}` : readyMessage(), Boolean(failures.length));
    } finally {
      saving = false;
      if (!signal.aborted) syncControls();
    }
  }, { signal });

  async function loadLibrary() {
    try {
      const opened = await openPhotoLibrary();
      if (signal.aborted) {
        opened.close();
        return;
      }
      library = opened;
      records = await library.list();
      if (signal.aborted) return;
      for (const record of records) addThumbnail(record);
      choose(records[0]?.id);
      report(readyMessage());
      syncControls();
    } catch {
      if (signal.aborted) return;
      library?.close();
      library = null;
      report('无法读取本地照片库，请检查浏览器存储权限后重试。', true);
    }
  }

  async function loadRenderer() {
    const pending = new Application();
    try {
      await pending.init({
        width: stage.width, height: stage.height, autoStart: false,
        preference: ['webgl', 'canvas'], backgroundColor: 0, antialias: true,
        resolution: Math.min(devicePixelRatio || 1, stage.maxDpr),
      });
      if (signal.aborted) {
        pending.destroy({ removeView: true }, { children: true });
        return;
      }
      app = pending;
      app.canvas.setAttribute('aria-hidden', 'true');
      surface.prepend(app.canvas);
      cameraArt = makeCamera();
      sheetMask = new Graphics({ label: 'ejection-mask' })
        .rect(camera.x - camera.slot.width / 2, camera.y + camera.slot.y, camera.slot.width, stage.height)
        .fill(0xffffff);
      const foreground = new Container({ label: 'camera-foreground', x: camera.x, y: camera.y });
      foreground.addChild(cameraArt.lip);
      app.stage.addChild(makeStars(), cameraArt.rig, sheetMask, foreground);
      sheetMask.renderable = false;
      app.render();
      syncControls();
    } catch (error) {
      if (pending.renderer) pending.destroy({ removeView: true }, { children: true });
      app = null;
      if (signal.aborted) return;
      shutter.disabled = true;
      scene.insertAdjacentHTML('afterbegin', '<p class="picture-render-error" role="alert">相机加载失败，请返回板块页后重试。</p>');
      console.error('Picture renderer unavailable:', error);
    }
  }

  function makePaper(image) {
    const frame = new Container({ label: 'polaroid-paper' });
    const visibleWidth = paper.width - paper.inset * 2;
    const visibleHeight = paper.height - paper.inset - paper.foot;
    const backdrop = new Graphics().roundRect(0, 0, paper.width, paper.height, 4).fill(colors.paper)
      .rect(paper.inset, paper.inset, visibleWidth, visibleHeight).fill(colors.picture);
    // 以相纸开孔尺寸生成单张贴图，保持覆盖裁切；拍完立即销毁纹理。
    const canvas = document.createElement('canvas');
    canvas.width = visibleWidth * 2;
    canvas.height = visibleHeight * 2;
    const context = canvas.getContext('2d');
    const scale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
    photoTexture = Texture.from(canvas, true);
    const photo = new Sprite({ texture: photoTexture, x: paper.inset, y: paper.inset });
    photo.width = visibleWidth;
    photo.height = visibleHeight;
    frame.addChild(backdrop, photo);
    frame.pivot.set(paper.width / 2, paper.height / 2);
    return frame;
  }

  function clearPaper() {
    if (sheet) {
      sheet.mask = null;
      sheet.removeFromParent();
      sheet.destroy({ children: true });
      sheet = null;
    }
    photoTexture?.destroy(true);
    photoTexture = null;
  }

  function advancePhoto(printedId) {
    if (currentId !== printedId) return;
    choose((records.find(record => record.id > printedId) ?? records[0])?.id);
  }

  shutter.addEventListener('click', async () => {
    if (printing || !app) return;
    if (!records.length) {
      report(readyMessage());
      upload.focus({ preventScroll: true });
      return;
    }
    const record = records.find(photo => photo.id === currentId) ?? records[0];
    printing = true;
    printedId = record.id;
    syncControls();
    report(`正在冲印 ${record.name}…`);
    try {
      await withPhotoImage(record.blob, image => {
        if (signal.aborted) return;
        sheet = makePaper(image);
        const worldX = camera.x + camera.slot.x;
        const worldY = camera.y + camera.slot.y;
        app.stage.addChildAt(sheet, app.stage.children.length - 1);
        // 只由路由的逐帧更新定位时间轴，GSAP 自身的时钟不会推进这段动画。
        timeline = gsap.timeline({ paused: true });
        clock = 0;
        if (motion.matches) {
          sheet.position.set(paper.x, paper.y);
          sheet.alpha = 0;
          timeline.to(sheet, { alpha: 1, duration: timing.reducedFade })
            .to(sheet, { alpha: 0, duration: timing.reducedFade }, timing.reducedFade + timing.hold);
        } else {
          sheet.position.set(worldX, worldY - paper.height / 2);
          sheet.mask = sheetMask;
          const floatStart = timing.charge + timing.eject;
          timeline.to(cameraArt.light, { alpha: camera.flash, duration: timing.charge * .38 })
            .to(cameraArt.light, { alpha: 0, duration: timing.charge * .62 })
            .to(cameraArt.rig, {
              x: camera.x + camera.shake, duration: timing.charge / 4,
              yoyo: true, repeat: 3, ease: 'sine.inOut',
            }, 0)
            .to(sheet, { y: worldY + paper.height / 2 + 6, duration: timing.eject, ease: 'power1.inOut' }, timing.charge)
            .call(() => { sheet.mask = null; }, [], floatStart)
            .to(sheet, {
              x: paper.x, y: paper.y, angle: paper.angle,
              duration: timing.float, ease: 'power2.out',
            }, floatStart)
            .to(sheet, { alpha: 0, duration: timing.fade, ease: 'sine.inOut' }, floatStart + timing.float + timing.hold);
        }
        app.render();
      });
    } catch {
      if (signal.aborted) return;
      timeline?.kill();
      timeline = null;
      clearPaper();
      printing = false;
      syncControls();
      app.render();
      report('这张照片无法出片，请重新添加或选择另一张。', true);
    }
  }, { signal });

  void loadLibrary();
  void loadRenderer();

  return {
    update(dt) {
      if (!timeline || document.hidden) return;
      clock = Math.min(clock + Math.min(dt, timing.maxFrameStep), timeline.duration());
      timeline.totalTime(clock);
      if (clock >= timeline.duration()) {
        timeline.kill();
        timeline = null;
        clearPaper();
        advancePhoto(printedId);
        printing = false;
        syncControls();
        report(readyMessage());
      }
      app.render();
    },
    destroy() {
      lifetime.abort();
      timeline?.kill();
      clearPaper();
      library?.close();
      for (const url of urls.values()) URL.revokeObjectURL(url);
      urls.clear();
      app?.destroy({ removeView: true }, { children: true });
      scene.remove();
    },
  };
}
