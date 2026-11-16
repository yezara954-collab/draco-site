import { album as c, picture, photoAlbum as settings, photoFlight } from './config.js';
import { makePageShadow } from './picture-album-light.js';
import { makeAlbumArt } from './picture-album-paper.js';
import { pageFrames } from './picture-album-layout.js';
import { makeAlbumPhotos } from './picture-album-photos.js';
import { makePhotoFlight } from './picture-photo.js';
import { frontArrival, random } from './picture-album-air.js';

const radians = x => x * Math.PI / 180;
const clamp = value => Math.max(0, Math.min(1, value));

function pageProgress(t, hero = false) {
  const phase = clamp(t);
  return hero ? phase * phase * (3 - 2 * phase) : phase * (2 - phase);
}

export function mountAlbum(T, canvas, air, motion) {
  const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  const scene = new T.Scene();
  const book = new T.Group();
  book.rotation.y = radians(c.BOOK_YAW_DEG);
  scene.add(book);
  const pageShadow = makePageShadow(T);

  const camera = new T.PerspectiveCamera(c.CAMERA_FOV, 1, .1, 120);
  const gallery = makeAlbumPhotos(T);
  const photo = makePhotoFlight(T, scene, camera, book, gallery, stagePriority, liftPhoto);
  const ray = new T.Raycaster(), pointer = new T.Vector2();
  const tested = [], hits = [], protectedEntries = new Set();
  const elevation = radians(c.CAMERA_ELEV_DEG);
  const azimuth = radians(c.CAMERA_AZIMUTH_DEG);
  const counter = new T.Vector3();
  let art, stacks, mobile, endpapers, hitBounds;
  let emissionPaused = false, destroyed = false;
  let w = 0, h = 0, dpr = 0;
  let clock = 0, active = [], sweep = null;
  let fromSide = 1, nextSweepAt = Infinity, sweepScale = 1;
  let localWind = 0, launches = 0;
  const photoAnchors = [];

  function makeFace(variant, side) {
    return { variant, side, slots: pageFrames(variant).map(frame => {
      const angle = radians(frame[3]);
      return { frame, sin: Math.sin(angle), cos: Math.cos(angle),
        entry: null, alpha: 1, lifted: -Infinity, due: Infinity, reveal: -Infinity, readyAt: 0 };
    }) };
  }

  function setStacks() {
    photoAnchors.length = 0;
    art.stationary.forEach((stack, side) => {
      const sheets = stacks[side];
      const count = sheets.length, sheet = sheets.at(-1);
      const face = stack.face = sheet ? (side ? sheet.right : sheet.left) : endpapers[side];
      stack.setHeight(count);
      for (const slot of face.slots) photoAnchors.push({ side: face.side, count, slot, face });
    });
  }

  function collectProtected(ignore) {
    protectedEntries.clear();
    for (const stack of art.stationary) for (const slot of stack.face.slots) {
      if (slot !== ignore && slot.entry) protectedEntries.add(slot.entry);
    }
    for (const { sheet } of active) for (const face of [sheet.right, sheet.left]) {
      for (const slot of face.slots) if (slot.entry) protectedEntries.add(slot.entry);
    }
    return protectedEntries;
  }

  function updateFace(face) {
    for (const slot of face.slots) {
      if (!gallery.allowed(slot.entry) || gallery.index(slot.entry) < 0) {
        const others = face.slots.filter(other => other !== slot).map(other => other.entry);
        slot.entry = gallery.pick(others);
      }
      if (clock >= slot.due) {
        const previous = slot.entry;
        const others = face.slots.filter(other => other !== slot).map(other => other.entry);
        others.push(previous);
        slot.entry = gallery.develop(others, previous, collectProtected(slot)) ?? previous;
        slot.due = Infinity;
        slot.reveal = clock;
      }
      if (slot.due < Infinity) slot.alpha = 1 - clamp((clock - slot.lifted) / settings.PHOTO_LIFT_FADE);
      else slot.alpha = clamp((clock - slot.reveal) / settings.PHOTO_DEVELOP_DURATION);
      // 出片模块使用同一份槽位时钟。
      slot.available = Boolean(slot.entry && slot.alpha >= 1 && clock >= slot.readyAt);
    }
  }

  function bindPhotos() {
    gallery.sync();
    for (const stack of art.stationary) {
      updateFace(stack.face);
    }
    for (const { sheet } of active) {
      updateFace(sheet.right);
      updateFace(sheet.left);
    }
  }

  function refreshBindings() {
    for (const stack of art.stationary) stack.bind(stack.face, stack.face);
    for (const { sheet, paper } of active) paper.bind(sheet.right, sheet.left);
  }

  function liftPhoto(anchor) {
    anchor.slot.lifted = clock;
    anchor.slot.due = clock + random([settings.PHOTO_DEVELOP_DELAY_MIN, settings.PHOTO_DEVELOP_DELAY_MAX]);
    anchor.slot.available = false;
  }

  function stagePriority(anchors, entry) {
    if (anchors.some(({ slot }) => slot.entry === entry && slot.due === Infinity && slot.alpha > 0)) return;
    const stableSide = fromSide === 1 ? -1 : 1;
    const candidate = anchors.find(({ slot, side }) => side === stableSide && slot.available) ??
      anchors.find(({ slot }) => slot.available);
    if (!candidate || !gallery.ensure(entry, collectProtected(candidate.slot))) return;
    const { slot } = candidate;
    slot.entry = entry;
    slot.readyAt = clock + settings.PRIORITY_PAGE_PREVIEW;
    slot.available = false;
  }

  function hitPhoto(clientX, clientY) {
    if (!hitBounds) return null;
    const bounds = canvas.getBoundingClientRect();
    const x = (clientX - bounds.left) / bounds.width * w;
    const y = (clientY - bounds.top) / bounds.height * h;
    if (x < hitBounds.left || x > hitBounds.right || y < hitBounds.top || y > hitBounds.bottom) return null;
    pointer.set(x / w * 2 - 1, 1 - y / h * 2);
    ray.setFromCamera(pointer, camera);
    tested.length = hits.length = 0;
    for (const stack of art.stationary) tested.push(stack.mesh);
    for (const { paper } of active) tested.push(paper.mesh);
    ray.intersectObjects(tested, false, hits);
    const hit = hits[0];
    if (!hit?.uv) return null;
    const stack = art.stationary.find(item => item.mesh === hit.object);
    if (!stack) return null;
    for (const slot of stack.face.slots) {
      if (!slot.entry || slot.alpha < .15 || gallery.index(slot.entry) < 0) continue;
      const [x, y, size] = slot.frame;
      const u = hit.uv.x - x;
      const v = (1 - hit.uv.y - y) * c.PAGE_DEPTH / c.PAGE_WIDTH;
      if (Math.abs(u * slot.cos + v * slot.sin) <= size * .5 &&
          Math.abs(v * slot.cos - u * slot.sin) <= size * photoFlight.PHOTO_ASPECT * .5) return slot.entry;
    }
    return null;
  }

  function disposeBook() {
    const resources = new Set(art?.bases ?? []);
    book.traverse(object => {
      if (object.geometry) resources.add(object.geometry);
      if (object.material) {
        resources.add(object.material);
        if (object.material.map) resources.add(object.material.map);
      }
    });
    resources.forEach(resource => resource.dispose());
    book.clear();
  }

  function build(isMobile) {
    if (art) disposeBook();
    mobile = isMobile;
    const count = Math.max(2, c.PAGES_COUNT[mobile ? 'mobile' : 'desktop']);
    gallery.fit(mobile);
    const total = settings.PAGE_LAYOUTS_COUNT;
    const sheets = Array.from({ length: count }, (_, i) => ({
      right: makeFace(i % total, 1), left: makeFace((i + 3) % total, -1),
    }));
    endpapers = [makeFace(2 % total, -1), makeFace(5 % total, 1)];
    stacks = [[], sheets];
    const ghostCount = Math.min(c.MOTION_BLUR_GHOSTS.length, c.MOTION_BLUR_ALPHA.length);
    art = makeAlbumArt(T, book, count, pageShadow, mobile ? Math.floor(ghostCount * picture.display.mobileFactor) : ghostCount, gallery);
    setStacks();
    if (Number.isFinite(nextSweepAt) || sweep) nextSweepAt = clock;
    fromSide = 1;
    sweepScale = 1;
    sweep = null;
    active = [];
  }

  function boxAt(distance) {
    const horizontal = Math.cos(elevation) * distance;
    camera.position.set(Math.sin(azimuth) * horizontal, Math.sin(elevation) * distance,
      Math.cos(azimuth) * horizontal);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    book.updateMatrixWorld(true);
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (const side of [-1, 1]) for (const i of [0, .25, .5, .75, 1]) for (const end of [-1, 1]) {
      counter.set(side * (c.SPINE_GAP + i * (c.PAGE_WIDTH + c.COVER_BORDER)),
        c.COVER_DEPTH + Math.ceil(c.PAGES_COUNT[mobile ? 'mobile' : 'desktop'] / 2) * c.PAGE_THICKNESS +
          c.OPEN_ARCH * Math.sin(Math.PI * i) + c.FREE_EDGE_LIFT * i,
        end * (c.PAGE_DEPTH / 2 + c.COVER_BORDER));
      counter.applyMatrix4(book.matrixWorld).project(camera);
      const x = (counter.x + 1) * w / 2, y = (1 - counter.y) * h / 2;
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
    }
    return { left, right, top, bottom };
  }

  function fit() {
    const width = Math.max(1, canvas.clientWidth);
    const height = Math.max(1, canvas.clientHeight);
    const ratio = Math.min(devicePixelRatio || 1, picture.display.maxDpr);
    if (w === width && h === height && dpr === ratio) return;
    w = width;
    h = height;
    dpr = ratio;
    const isMobile = w <= picture.display.mobileWidth;
    if (!art || isMobile !== mobile) build(isMobile);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    air.resize(w, h, dpr);
    camera.clearViewOffset();
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const maxWidth = w * c.BOOK_WIDTH_VW[mobile ? 'mobile' : 'desktop'];
    let near = 3.6, far = 110;
    for (let i = 0; i < 18; i++) {
      const distance = (near + far) / 2;
      const box = boxAt(distance);
      if (box.right - box.left > maxWidth || box.bottom - box.top > h * c.BOOK_HEIGHT_LIMIT) near = distance;
      else far = distance;
    }
    const box = boxAt(far);
    const dx = (box.left + box.right) / 2 - w * c.BOOK_CENTER_X;
    const dy = box.bottom - h * picture.ground.y;
    camera.setViewOffset(w, h, dx, dy, w, h);
    photo.fit(w, h, mobile, dpr);
    const bounds = { left: box.left - dx, right: box.right - dx, top: box.top - dy, bottom: box.bottom - dy };
    hitBounds = bounds;
    pageShadow.fit(bounds, w, h, canvas, mobile);
    bindPhotos();
    refreshBindings();
    const visiblePages = active.flatMap(({ paper }) => [paper.mesh, ...paper.ghosts]).filter(mesh => mesh.visible);
    visiblePages.forEach(mesh => { mesh.visible = false; });
    photo.group.visible = false;
    renderer.render(scene, camera);
    air.groundAt(canvas, bounds);
    photo.group.visible = true;
    visiblePages.forEach(mesh => { mesh.visible = true; });
    renderer.render(scene, camera);
  }

  function beginSweep() {
    const total = stacks[fromSide].length;
    sweep = {
      from: fromSide, to: 1 - fromSide, total, issued: 0, at: clock,
      hero: total - 1,
      landed: Array(total).fill(null),
    };
  }

  function launch() {
    const paper = art.moving.find(sheet => !sheet.mesh.visible);
    if (!paper) return false;
    const { from, issued: rank } = sweep;
    const start = c.COVER_DEPTH + stacks[from].length * c.PAGE_THICKNESS + .004;
    const end = c.COVER_DEPTH + (rank + 1) * c.PAGE_THICKNESS + .004;
    const sheet = stacks[from].pop();
    const hero = rank === sweep.hero;
    const duration = random(hero ? c.HERO_FLIP_DURATION : [c.FLURRY_PAGE_DURATION_MIN, c.FLURRY_PAGE_DURATION_MAX]) * sweepScale;
    paper.mesh.visible = true;
    active.push({ paper, from, start, end, time: clock, phase: Math.random() * 6, hero, sheet, rank, duration });
    sweep.issued++;
    launches++;
    sweep.at += random([c.FLURRY_STAGGER_MIN, c.FLURRY_STAGGER_MAX]) * sweepScale;
    setStacks();
    return true;
  }

  function update(dt, intro, wind, lights) {
    if (!art || motion.matches || document.hidden) return;
    const step = Math.min(dt, picture.display.maxStep);
    clock += step;
    launches = 0;
    localWind += ((wind?.force ?? 0) / picture.rope.gravity - localWind) * Math.min(1, step * 6);
    if (!sweep && (clock >= nextSweepAt || (nextSweepAt === Infinity && intro >= frontArrival(c.BOOK_CENTER_X)))) {
      beginSweep();
    }
    if (sweep) {
      let landed = false;
      for (let i = active.length - 1; i >= 0; i--) {
        const flip = active[i];
        if (clock - flip.time < flip.duration) continue;
        flip.paper.mesh.visible = false;
        flip.paper.ghosts.forEach(ghost => { ghost.visible = false; });
        active.splice(i, 1);
        sweep.landed[flip.rank] = flip.sheet;
        landed = true;
      }
      if (landed) {
        // 单页时长略有差异，纸摞仍以起翻顺序叠放。
        stacks[sweep.to] = sweep.landed.filter(variant => variant !== null);
        setStacks();
      }
      while (sweep.issued < sweep.total && clock >= sweep.at) {
        if (!launch()) break;
      }
      if (sweep.issued === sweep.total && !active.length) {
        fromSide = sweep.to;
        sweep = null;
        nextSweepAt = clock + c.SWEEP_TURN_BEAT;
        sweepScale = Math.max(c.SWEEP_MIN_SCALE, sweepScale * c.SWEEP_ACCEL);
      }
    }
    for (const flip of active) {
      const progress = (clock - flip.time) / flip.duration;
      const turning = pageProgress(progress, flip.hero);
      const side = flip.from ? 1 : -1;
      flip.paper.pose(side, flip.start, flip.end, turning, flip.hero ? .23 : .065, clock * 18 + flip.phase,
        localWind, Math.PI, c.PAGE_WIDTH, c.PAGE_DEPTH, flip.hero ? .68 : 1);
      flip.paper.ghosts.forEach((ghost, i) => {
        const lag = c.MOTION_BLUR_GHOSTS[i];
        ghost.visible = !flip.hero && progress > lag && progress < .97;
        if (!ghost.visible) return;
        const angle = side * Math.PI * (pageProgress(progress - lag) - turning);
        ghost.rotation.z = angle;
        const hinge = flip.start + (flip.end - flip.start) * turning;
        ghost.position.set(Math.sin(angle) * hinge, (1 - Math.cos(angle)) * hinge, -.006 * (i + 1));
      });
    }
    pageShadow.sample(lights);
    bindPhotos();
    photo.update(step, photoAnchors, launches, emissionPaused);
    refreshBindings();
    renderer.render(scene, camera);
  }

  gallery.ready.then(() => {
    if (destroyed || !art) return;
    bindPhotos();
    refreshBindings();
    renderer.render(scene, camera);
  });
  return {
    fit, update, hitPhoto, photoPushes: photo.pushes,
    pauseEmission(value) { emissionPaused = value; },
    addPhoto(record) {
      const entry = gallery.add(record);
      if (record.priority) photo.queuePhoto(entry);
      if (art && motion.matches) { bindPhotos(); refreshBindings(); renderer.render(scene, camera); }
    },
    clearPhotos() {
      gallery.clear();
      photo.clearPhotos();
      if (art) { bindPhotos(); refreshBindings(); renderer.render(scene, camera); }
    },
    get textureBytes() { return gallery.bytes + (art?.bases.length ?? 0) * c.TEXTURE_SIZE ** 2 * 4 * 4 / 3; },
    get craneCount() { return photo.craneCount; },
    get particleCount() { return photo.particleCount; },
    settle() {
      photo.clear();
      build(mobile);
      pageShadow.clear();
      bindPhotos();
      refreshBindings();
      renderer.render(scene, camera);
    },
    destroy() {
      destroyed = true;
      photo.destroy();
      disposeBook();
      gallery.destroy();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
