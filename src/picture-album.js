import { album as c, picture } from './config.js';
import { makeAlbumArt } from './picture-album-paper.js';
import { frontArrival, integer, random } from './picture-album-air.js';

const radians = x => x * Math.PI / 180;
const flipInterval = () => random([c.FLIP_INTERVAL_MIN, c.FLIP_INTERVAL_MAX]);

export function mountAlbum(T, canvas, air, motion) {
  const renderer = new T.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  const scene = new T.Scene();
  const book = new T.Group();
  book.rotation.y = radians(c.BOOK_YAW_DEG);
  scene.add(book);
  scene.add(new T.HemisphereLight(c.colors.skylight, c.colors.bouncedLight, c.AMBIENT_LIGHT));
  const key = new T.DirectionalLight(c.colors.keyLight, c.KEY_LIGHT);
  key.position.set(-3, 6, 2);
  scene.add(key);

  const camera = new T.PerspectiveCamera(c.CAMERA_FOV, 1, .1, 120);
  const elevation = radians(c.CAMERA_ELEV_DEG);
  const azimuth = radians(c.CAMERA_AZIMUTH_DEG);
  const counter = new T.Vector3();
  let art, counts, pageIndex, mobile;
  let w = 0, h = 0, dpr = 0;
  let clock = 0, nextFlip = flipInterval(), plans = [], active = [];
  let introFlipped = false, handledGust = -1;
  let localWind = 0;

  function setStacks() {
    return art.stationary.map((stack, side) => stack.setHeight(
      counts[side], art.pages[pageIndex[side] % art.pages.length],
    ));
  }

  function disposeBook() {
    const resources = new Set(art?.pages.flatMap(page => [page, page.map]));
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
    const count = Math.max(2, Math.round(c.PAGES_COUNT * (mobile ? picture.display.mobileFactor : 1)));
    counts = [Math.floor(count / 2), Math.ceil(count / 2)];
    pageIndex = [0, 1];
    art = makeAlbumArt(T, book, count);
    setStacks();
    plans = [];
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
        c.COVER_DEPTH + Math.ceil(c.PAGES_COUNT / 2) * c.PAGE_THICKNESS +
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
    air.resize(w, h, dpr, mobile);
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
    for (const { paper } of active) paper.mesh.visible = false;
    renderer.render(scene, camera);
    air.groundAt(canvas, { left: box.left - dx, right: box.right - dx, top: box.top - dy, bottom: box.bottom - dy });
    for (const { paper } of active) paper.mesh.visible = true;
    renderer.render(scene, camera);
  }

  function schedule(span, gap, wanted) {
    let at = clock;
    const length = integer(span);
    for (let i = 0; i < length; i++) {
      plans.push({ at, wanted });
      at += random(gap);
    }
    nextFlip = at + c.FLIP_DURATION_MIN + flipInterval();
  }

  function launch(wanted) {
    const paper = art.moving.find(sheet => !sheet.mesh.visible);
    if (!paper) return false;
    let from = wanted ?? (Math.random() < c.BACKFLIP_CHANCE ? 0 : 1);
    if (counts[from] === 0) from = 1 - from;
    if (counts[from] === 0) return false;
    const to = 1 - from;
    const half = wanted == null && Math.random() < c.HALF_FLIP_CHANCE;
    const start = c.COVER_DEPTH + counts[from] * c.PAGE_THICKNESS + .004;
    const end = c.COVER_DEPTH + (counts[to] + 1) * c.PAGE_THICKNESS + .004;
    paper.mesh.material = art.pages[pageIndex[from] % art.pages.length];
    paper.mesh.visible = true;
    active.push({ paper, from, to, half, start, end, time: clock, phase: Math.random() * 6,
      duration: wanted == null ? random([c.FLIP_DURATION_MIN, c.FLIP_DURATION_MAX])
        : random([c.FLIP_DURATION_MIN, (c.FLIP_DURATION_MIN + c.FLIP_DURATION_MAX) / 2]) });
    if (!half) {
      counts[from]--;
      pageIndex[from]++;
      setStacks();
    }
    return true;
  }

  function update(dt, intro, wind) {
    if (!art || motion.matches || document.hidden) return;
    clock += Math.min(dt, picture.display.maxStep);
    localWind += ((wind?.force ?? 0) / picture.rope.gravity - localWind) * Math.min(1, dt * 6);
    if (!introFlipped && intro >= frontArrival(c.BOOK_CENTER_X) && intro < c.INTRO_WIND_DURATION) {
      introFlipped = true;
      schedule(c.INTRO_WIND_FLIP_COUNT, c.INTRO_WIND_FLIP_SPACING, c.INTRO_WIND_DIRECTION > 0 ? 0 : 1);
    }
    const gust = wind?.gust;
    if (intro >= c.INTRO_WIND_DURATION && gust && gust.id !== handledGust &&
        Math.abs(gust.force) > c.GUST_THRESHOLD && !plans.length && !active.length) {
      handledGust = gust.id;
      schedule(c.GUST_FLIP_COUNT, c.GUST_FLIP_SPACING, gust.force > 0 ? 0 : 1);
    }
    if (intro >= c.INTRO_WIND_DURATION && clock >= nextFlip) {
      launch();
      nextFlip = clock + flipInterval();
    }
    while (plans.length && plans[0].at <= clock) {
      if (!launch(plans[0].wanted)) break;
      plans.shift();
    }
    for (let i = active.length - 1; i >= 0; i--) {
      const flip = active[i];
      const progress = Math.min(1, (clock - flip.time) / flip.duration);
      if (progress >= 1) {
        flip.paper.mesh.visible = false;
        active.splice(i, 1);
        if (!flip.half) {
          counts[flip.to]++;
          pageIndex[flip.to]++;
          setStacks();
        }
        continue;
      }
      const phase = flip.half ? Math.sin(progress * Math.PI) * .49 : progress;
      flip.paper.pose(flip.from ? 1 : -1, flip.start, flip.half ? flip.start : flip.end,
        phase, .07, clock * 7 + flip.phase, localWind,
        flip.half ? radians(c.HALF_FLIP_ANGLE_DEG) * 2 : Math.PI);
    }
    renderer.render(scene, camera);
  }

  return {
    fit, update,
    settle() {
      build(mobile);
      renderer.render(scene, camera);
    },
    destroy() {
      disposeBook();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
