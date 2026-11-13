import { Application, Assets, Container, RendererType, Sprite } from 'pixi.js';
import { gsap } from 'gsap';
import '@fontsource/bodoni-moda/latin-400.css';
import './style.css';
import placements from './placements.json';
import { makeCraneRig, makeMirrorLighting, makeReflection, startEnvironment } from './environment.js';

import { createWind } from './wind.js';
import { makeIntro } from './intro.js';
import { createInteractions } from './interactions.js';
import { createFerret } from './ferret.js';
import { createWand, makeNextRoute } from './wand.js';

const WIDTH = 1600;
const HEIGHT = 1000;
const stage = document.querySelector('#stage');
const art = document.querySelector('#art');
const viewport = document.querySelector('.viewport');
const route = makeNextRoute(stage);
let wand;
const canInteract = () => !route.inNext && !wand?.active;

const assetUrls = {
  draco: new URL('./assets/draco.png', import.meta.url).href,
  'draco-cast': new URL('./assets/draco-cast.png', import.meta.url).href,
  'mirror-glass': new URL('./assets/mirror-glass.png', import.meta.url).href,
  'mirror-frame': new URL('./assets/mirror-frame.png', import.meta.url).href,
  'ferret-low': new URL('./assets/ferret-low.png', import.meta.url).href,
  'ferret-raised': new URL('./assets/ferret-raised.png', import.meta.url).href,
  'oak-tree': new URL('./assets/oak-tree.png', import.meta.url).href,
  'oak-overhang': new URL('./assets/oak-overhang.png', import.meta.url).href,
  'paper-crane': new URL('./assets/paper-crane.png', import.meta.url).href,
};

function fitStage() {
  const scale = Math.min(viewport.clientWidth / WIDTH, viewport.clientHeight / HEIGHT);
  gsap.set(stage, { scale });
}
new ResizeObserver(fitStage).observe(viewport);
fitStage();

function scatterStars() {
  const sky = document.querySelector('#night-stars');
  let seed = 1931;
  function random() {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  const stars = [[308,92],[355,115],[270,127],[135,146],[82,324],[101,275],[194,289],[333,397],
    [398,469],[461,479],[669,151],[611,182],[474,144],[517,602],[109,658],[298,541],[395,527],
    [361,710],[452,706],[1480,139],[1507,165],[1011,654],[1117,722],[1332,116]];
  for (let index = 0; index < 46; index++) stars.push([80 + 1430 * random(), 91 + 652 * random()]);
  for (const [x, y] of stars) {
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', x);
    dot.setAttribute('cy', y);
    dot.setAttribute('r', (.37 + random() * .7).toFixed(2));
    dot.setAttribute('opacity', (.09 + random() * .32).toFixed(2));
    sky.append(dot);
  }
}

async function typesetTitle() {
  await document.fonts.load('155px "Bodoni Moda"');
  const metrics = document.createElement('canvas').getContext('2d');
  metrics.font = '155px "Bodoni Moda"';
  const baseline = 909;
  for (const span of document.querySelectorAll('.title-word')) {
    const text = metrics.measureText(span.textContent);
    const width = text.actualBoundingBoxLeft + text.actualBoundingBoxRight;
    const scaleX = (+span.dataset.right - +span.dataset.left) / width;
    // Locate the real DOM baseline before fitting the word to its reference bounds.
    const marker = document.createElement('i');
    marker.style.cssText = 'display:inline-block;width:0;height:0';
    span.append(marker);
    const naturalBaseline = marker.offsetTop;
    marker.remove();
    span.style.left = `${+span.dataset.left + text.actualBoundingBoxLeft * scaleX}px`;
    span.style.top = `${baseline - naturalBaseline}px`;
    span.style.transform = `scaleX(${scaleX})`;
  }
}

function alphaHitArea(source) {
  const { width, height } = source;
  const readback = document.createElement('canvas');
  readback.width = width;
  readback.height = height;
  const context = readback.getContext('2d', { willReadFrequently: true });
  context.drawImage(source, 0, 0);
  const { data } = context.getImageData(0, 0, width, height);
  const mask = new Uint8Array(width * height);
  for (let pixel = 0; pixel < mask.length; pixel++) mask[pixel] = data[pixel * 4 + 3];
  return {
    contains(x, y, threshold = 0) {
      if (x < 0 || y < 0 || x >= width || y >= height) return false;
      return mask[Math.floor(y) * width + Math.floor(x)] > threshold;
    },
  };
}

// The composite applies different exposure levels to the original painted layers.
const layerTints = {
  'oak-tree': 0xb3b3b3,
  'oak-overhang': 0xdcdcdc,
  'mirror-frame': 0xe9e9e9,
  'mirror-glass': 0xf6f6f6,
  'ferret-raised': 0xe5e5e5,
};

function pickLayer(layer) {
  if (!canInteract()) return;
  if (layer === 'draco' || layer === 'draco-cast') wand?.start();
  art.dispatchEvent(new CustomEvent('poster:pick', { bubbles: true, detail: { layer } }));
}

function makeSprite(label, texture) {
  const [x, y, width, height] = placements[label];
  const sprite = new Sprite({ label, texture });
  sprite.position.set(x, y);
  sprite.width = width;
  sprite.height = height;
  sprite.tint = layerTints[label] ?? 0xffffff;
  sprite.eventMode = 'static';
  sprite.hitArea = alphaHitArea(texture.source.resource);
  sprite.on('pointertap', () => pickLayer(label));
  return sprite;
}

async function renderPoster() {
  const app = new Application();
  await app.init({
    width: WIDTH, height: HEIGHT, preference: ['webgl', 'canvas'],
    backgroundAlpha: 0, resolution: Math.min(devicePixelRatio || 1, 2),
    autoDensity: true, antialias: true, autoStart: false,
  });
  const webgl = app.renderer.type === RendererType.WEBGL;
  art.dataset.renderer = webgl ? 'webgl' : 'canvas';
  app.canvas.setAttribute('aria-hidden', 'true');
  art.append(app.canvas);
  const layers = new Container({ label: 'poster-artwork' });
  app.stage.addChild(layers);

  const entries = await Promise.all(Object.entries(assetUrls).map(async ([name, url]) =>
    [name, makeSprite(name, await Assets.load(url))]));
  const sprites = Object.fromEntries(entries);
  const debugView = new URLSearchParams(location.search).get('debug');
  const ferret = createFerret(sprites, debugView === 'ferret', () => pickLayer('ferret'), canInteract);
  const glass = sprites['mirror-glass'];
  const lighting = makeMirrorLighting(glass, sprites.draco);
  const reflections = [
    makeReflection('mirror-reflection-left', [675, 369, 747, 410, 732, 444, 664, 452]),
    makeReflection('mirror-reflection-right', [852, 474, 925, 456, 918, 516, 848, 530]),
  ];
  const debug = debugView === 'wind';
  const [idleWeights, castWeights] = await Promise.all([
    Assets.load(new URL('./assets/draco-wind-weights.png', import.meta.url).href),
    Assets.load(new URL('./assets/draco-cast-wind-weights.png', import.meta.url).href),
  ]);
  const wind = createWind(sprites, lighting.bounce, { webgl, debug, idleWeights, castWeights });
  const idle = wind.layers.draco;
  const casting = wind.layers['draco-cast'];
  const frame = sprites['mirror-frame'];
  const poseDebug = debugView === 'pose';
  const poses = new Container({ label: 'draco-poses' });
  poses.addChild(idle, casting, wind.bounce);
  function setCastPose(active) {
    idle.visible = !active || poseDebug;
    casting.visible = active || poseDebug;
    wind.bounce.renderable = !active && !poseDebug;
    idle.alpha = poseDebug ? .52 : 1;
    casting.alpha = poseDebug ? .58 : 1;
    idle.eventMode = active ? 'none' : (webgl ? 'static' : 'passive');
    casting.eventMode = active ? (webgl ? 'static' : 'passive') : 'none';
    // Preserve the original layering at rest and clear the frame/foliage for the cast.
    if (active) layers.setChildIndex(poses, layers.getChildIndex(crane) - 1);
    else layers.setChildIndex(poses, layers.getChildIndex(frame) + 2);
    stage.dataset.pose = active ? 'cast' : 'idle';
  }
  const crane = makeCraneRig(wind.layers['paper-crane'], placements['paper-crane']);
  const craneArtwork = wind.layers['paper-crane'];
  const craneGlow = new Sprite({
    label: 'paper-crane-spell-glow', texture: sprites['paper-crane'].texture,
    x: craneArtwork.x, y: craneArtwork.y,
    width: placements['paper-crane'][2], height: placements['paper-crane'][3],
    blendMode: 'add', eventMode: 'none', alpha: 0,
  });
  crane.addChild(craneGlow);
  lighting.bounce = wind.bounce;
  layers.addChild(
    wind.layers['oak-tree'],
    glass,
    lighting.stencil,
    lighting.sweep,
    ...reflections,
    frame,
    wind.layers['oak-overhang'],
    poses,
    ferret.layer,
    crane,
  );

  setCastPose(false);
  if (poseDebug) {
    const caption = document.createElement('p');
    caption.className = 'pose-debug-caption';
    caption.textContent = '姿势对齐 · 待机与挥杖叠加（静止）';
    stage.append(caption);
  }
  app.render();
  await typesetTitle();
  const intro = makeIntro(stage);
  const apple = document.querySelector('#green-apple');
  wand = createWand(stage, crane, craneGlow, route, debugView === 'wand', setCastPose);
  function isClickable(x, y) {
    const box = app.canvas.getBoundingClientRect();
    if (x < box.left || x >= box.right || y < box.top || y >= box.bottom) return false;
    const target = app.renderer.events.rootBoundary.hitTest(
      (x - box.left) * WIDTH / box.width, (y - box.top) * HEIGHT / box.height,
    );
    return ['draco', 'draco-wind', 'draco-cast', 'draco-cast-wind', 'ferret'].includes(target?.label);
  }
  const interactions = createInteractions(stage, apple, isClickable, () => pickLayer('green-apple'), canInteract);
  startEnvironment(app, { glass, lighting, reflections, crane, wind, intro, interactions, ferret, wand, poseDebug });
  stage.classList.add('ready');
}

scatterStars();
renderPoster().catch((error) => {
  console.error('Unable to render the poster', error);
  document.querySelector('#render-error').hidden = false;
});
