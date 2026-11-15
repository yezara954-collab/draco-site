import { album as c, picture } from './config.js';
import { makePageLight } from './picture-album-light.js';
import { makeAlbumArt } from './picture-album-paper.js';
import { frontArrival, integer, random } from './picture-album-air.js';

const radians = x => x * Math.PI / 180;
const clamp = value => Math.max(0, Math.min(1, value));

function pageProgress(t) {
  const crest = .51;
  if (t < .44) return crest * (1 - (1 - t / .44) ** 2.35);
  if (t < .55) return crest + (t - .44) * .10;
  const fall = clamp((t - .55) / .45);
  return .521 + .479 * fall * fall * (3 - 2 * fall);
}

export function mountAlbum(T, canvas, air, motion) {
  const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  const scene = new T.Scene();
  const book = new T.Group();
  book.rotation.y = radians(c.BOOK_YAW_DEG);
  scene.add(book);
  const pageLight = makePageLight(T);

  const camera = new T.PerspectiveCamera(c.CAMERA_FOV, 1, .1, 120);
  const elevation = radians(c.CAMERA_ELEV_DEG);
  const azimuth = radians(c.CAMERA_AZIMUTH_DEG);
  const counter = new T.Vector3();
  let art, stacks, mobile;
  let w = 0, h = 0, dpr = 0;
  let clock = 0, active = [], sweep = null;
  let fromSide = 1, nextSweepAt = Infinity;
  let localWind = 0;

  function setStacks() {
    return art.stationary.map((stack, side) => stack.setHeight(
      stacks[side].length, art.pages[stacks[side].at(-1) ?? side],
    ));
  }

  function disposeBook() {
    const resources = new Set(art ? [...art.pages.flatMap(page => [page, page.map]), art.endpaper] : []);
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
    const variants = Array.from({ length: count }, (_, i) => i % c.FRAME_VARIANTS);
    stacks = [[], variants];
    const ghostCount = Math.min(c.MOTION_BLUR_GHOSTS.length, c.MOTION_BLUR_ALPHA.length);
    art = makeAlbumArt(T, book, count, pageLight, mobile ? Math.floor(ghostCount * picture.display.mobileFactor) : ghostCount);
    setStacks();
    if (Number.isFinite(nextSweepAt) || sweep) nextSweepAt = clock;
    fromSide = 1;
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
    const bounds = { left: box.left - dx, right: box.right - dx, top: box.top - dy, bottom: box.bottom - dy };
    pageLight.fit(bounds, w, h, canvas, mobile);
    const visiblePages = active.flatMap(({ paper }) => [paper.mesh, ...paper.ghosts]).filter(mesh => mesh.visible);
    visiblePages.forEach(mesh => { mesh.visible = false; });
    renderer.render(scene, camera);
    air.groundAt(canvas, bounds);
    visiblePages.forEach(mesh => { mesh.visible = true; });
    renderer.render(scene, camera);
  }

  function beginSweep() {
    const total = stacks[fromSide].length;
    sweep = {
      from: fromSide, to: 1 - fromSide, total, issued: 0, at: clock,
      hero: integer([Math.floor(total * .35), Math.floor(total * .65)]),
      landed: Array(total).fill(null),
    };
  }

  function launch() {
    const paper = art.moving.find(sheet => !sheet.mesh.visible);
    if (!paper) return false;
    const { from, issued: rank } = sweep;
    const start = c.COVER_DEPTH + stacks[from].length * c.PAGE_THICKNESS + .004;
    const end = c.COVER_DEPTH + (rank + 1) * c.PAGE_THICKNESS + .004;
    const variant = stacks[from].pop();
    const hero = rank === sweep.hero;
    const duration = random(hero ? c.HERO_FLIP_DURATION : [c.FLURRY_PAGE_DURATION_MIN, c.FLURRY_PAGE_DURATION_MAX]);
    paper.mesh.material = art.pages[variant];
    paper.mesh.visible = true;
    active.push({ paper, from, start, end, time: clock, phase: Math.random() * 6, hero, variant, rank, duration });
    sweep.issued++;
    sweep.at = clock + random([c.FLURRY_STAGGER_MIN, c.FLURRY_STAGGER_MAX]);
    setStacks();
    return true;
  }

  function update(dt, intro, wind, lights) {
    if (!art || motion.matches || document.hidden) return;
    const step = Math.min(dt, picture.display.maxStep);
    clock += step;
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
        sweep.landed[flip.rank] = flip.variant;
        landed = true;
      }
      if (landed) {
        // 即使中段慢页晚落，纸摞仍以起翻顺序叠放。
        stacks[sweep.to] = sweep.landed.filter(variant => variant !== null);
        setStacks();
      }
      if (sweep.issued < sweep.total && clock >= sweep.at) launch();
      if (sweep.issued === sweep.total && !active.length) {
        fromSide = sweep.to;
        sweep = null;
        nextSweepAt = clock + random([c.SWEEP_PAUSE_MIN, c.SWEEP_PAUSE_MAX]);
      }
    }
    for (const flip of active) {
      const progress = (clock - flip.time) / flip.duration;
      const turning = pageProgress(progress);
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
    const lit = pageLight.sample(lights);
    air.glowAt(pageLight.candidates, lit);
    renderer.render(scene, camera);
  }

  return {
    fit, update,
    settle() {
      build(mobile);
      pageLight.clear();
      air.glowAt([], 0);
      renderer.render(scene, camera);
    },
    destroy() {
      disposeBook();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
