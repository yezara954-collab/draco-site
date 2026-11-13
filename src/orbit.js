import { makeOrbitSky } from './orbit-sky.js';
import { ORBIT as settings, ORBIT_SKY } from './motion-config.js';

const HOME = '#';
const ORBIT = '#/next';
const TURN = 2 * Math.PI;
const sections = settings.sections;
const step = TURN / sections.length;
const covers = import.meta.glob('./assets/covers/cover-*.png', { eager: true, import: 'default' });
const icons = {
  picture: '<rect x="8" y="11" width="48" height="42" rx="2"/><path d="m9 46 14-15 9 9 8-11 15 17"/><circle cx="24" cy="24" r="3"/>',
  fanfic: '<path d="M38 53H14V10h24l10 10v7M38 10v10h10M21 26h13m-13 8h11m-11 8h8m4 7 2-8 16-16 6 6-16 16z"/>',
  letter: '<rect x="8" y="15" width="48" height="34" rx="2"/><path d="m9 17 23 17 23-17M9 47l16-17m14 0 16 17"/>',
  music: '<path d="M24 44V17l25-6v28m-25-15 25-6"/><ellipse cx="17" cy="46" rx="7" ry="5"/><ellipse cx="42" cy="41" rx="7" ry="5"/>',
};
const clamp = value => Math.max(0, Math.min(1, value));
const mix = (a, b, t) => a + (b - a) * t;
const ease = t => t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
const out = t => 1 - (1 - clamp(t)) ** 3;
const wrap = index => (index + sections.length) % sections.length;
const shortest = angle => ((angle + Math.PI) % TURN + TURN) % TURN - Math.PI;

function svg(name, attributes, parent) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  parent.append(node);
  return node;
}

function routeBack(link, fallback, expected, sync) {
  link.addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (history.state?.orbitFrom === expected) history.back();
    else {
      history.replaceState(null, '', fallback);
      sync();
    }
  });
}

export function makeNextRoute(stage) {
  const screen = document.createElement('section');
  screen.className = 'orbit-scene';
  screen.setAttribute('aria-label', '板块');
  screen.innerHTML = `
    <a class="orbit-back" href="#" aria-label="返回首页">←</a>
    <div class="orbit-interaction">
      <div class="orbit-world">
        <svg class="orbit-lines" aria-hidden="true"></svg>
        <div class="orbit-cards"></div>
      </div>
      <button type="button" class="orbit-arrow orbit-prev" aria-label="上一个板块">‹</button>
      <button type="button" class="orbit-arrow orbit-next" aria-label="下一个板块">›</button>
      <h1 class="orbit-label" aria-live="polite"></h1>
    </div>
    <svg class="orbit-dust" aria-hidden="true"></svg>`;
  const child = document.createElement('section');
  child.className = 'orbit-child';
  child.innerHTML = '<a class="orbit-back" href="#/next" aria-label="返回板块页">←</a><div><h1></h1><p>Coming soon</p></div>';
  stage.after(screen, child);
  const world = screen.querySelector('.orbit-world');
  const interaction = screen.querySelector('.orbit-interaction');
  const lines = screen.querySelector('.orbit-lines');
  const label = screen.querySelector('.orbit-label');
  const previous = screen.querySelector('.orbit-prev');
  const next = screen.querySelector('.orbit-next');
  const childTitle = child.querySelector('h1');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ellipse = svg('ellipse', { class: 'orbit-ellipse' }, lines);
  const points = Array.from({ length: 5 }, (_, i) =>
    svg('circle', { r: i === 0 ? 2.4 : 1.5, class: 'orbit-point' }, lines));
  const debug = new URLSearchParams(location.search).get('debug') === 'orbit';
  const debugLines = debug ? svg('svg', { class: 'orbit-debug', 'aria-hidden': 'true' }, world) : null;
  const debugEllipse = debug ? svg('ellipse', { class: 'orbit-ellipse' }, debugLines) : null;
  const markers = debug ? sections.map(() => svg('circle', { r: 6, class: 'orbit-marker' }, debugLines)) : [];
  const dust = screen.querySelector('.orbit-dust');
  const particles = Array.from({ length: settings.dustCount }, (_, i) => ({
    angle: i * 2.39996, reach: .16 + (i * 7 % 21) / 30,
    point: svg('circle', { r: .6 + (i % 7) * .18 }, dust),
  }));

  const cards = sections.map(({ id, name, colors }, i) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'orbit-card';
    button.setAttribute('aria-label', name);
    button.style.setProperty('--cover-light', colors[0]);
    button.style.setProperty('--cover-dark', colors[1]);
    button.innerHTML = `<span class="orbit-card-face">
      <span class="orbit-placeholder">
        <svg viewBox="0 0 64 64" aria-hidden="true">${icons[id]}</svg>
        <span class="orbit-card-name"></span>
      </span></span>`;
    button.querySelector('.orbit-card-name').textContent = name;
    const cover = covers[`./assets/covers/cover-${id}.png`];
    if (cover) {
      const image = new Image();
      image.alt = '';
      image.draggable = false;
      image.addEventListener('load', () => button.querySelector('.orbit-card-face').append(image), { once: true });
      image.src = cover;
    }
    button.addEventListener('click', () => select(i));
    screen.querySelector('.orbit-cards').append(button);
    return button;
  });

  let sky;
  let page = '';
  let index = 0;
  let angle = 0;
  let rotation;
  let entrance = Infinity;
  let time = 0;
  let radiusX = 0, radiusY = 0;
  let centerX = 0, centerY = 0, trackOffset = 0;
  let tiltX = 0, tiltY = 0, targetX = 0, targetY = 0;
  let drag;
  let cloudDrag;
  const dragSettings = ORBIT_SKY.drag;
  const isControl = target => target?.closest('.orbit-card, .orbit-arrow, .orbit-back');
  let suppressClick = false;
  const enterEnd = settings.riseTime + (cards.length - 1) * settings.stagger;

  function fit() {
    const w = interaction.clientWidth;
    const h = interaction.clientHeight;
    if (!w || !h) return;
    sky ??= makeOrbitSky(screen);
    centerX = w / 2;
    centerY = h / 2;
    const narrow = w < settings.mobileWidth;
    const width = Math.min(settings.cardWidth, w * (narrow ? .405 : .29), h * .37);
    const height = width * 1.25;
    sky.fit(w, h, width, reduced.matches);
    trackOffset = height * .49;
    const [rx, ry] = narrow ? settings.mobileRadius : settings.radius;
    radiusX = width * rx;
    radiusY = width * ry;
    world.style.setProperty('--card-width', `${width}px`);
    interaction.style.setProperty('--controls-x', `${width * .61 + 22}px`);
    interaction.style.setProperty('--controls-y', `${radiusY + height * .31}px`);
    interaction.style.setProperty('--label-y', `${radiusY + height / 2 + 18}px`);
    for (const [key, value] of Object.entries({ cx: w / 2, cy: h / 2, rx: radiusX, ry: radiusY })) {
      ellipse.setAttribute(key, key === 'cy' ? value + trackOffset : value);
      debugEllipse?.setAttribute(key, value);
    }
    paint();
  }

  function placePoint(point, a, offset = 0) {
    point.setAttribute('cx', centerX + Math.sin(a) * radiusX);
    point.setAttribute('cy', centerY + offset + Math.cos(a) * radiusY);
  }

  function paint() {
    const layoutOpacity = rotation?.fade ? Math.abs(1 - 2 * clamp(rotation.age / settings.fadeTurn)) : 1;
    world.style.opacity = layoutOpacity;
    world.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
    cards.forEach((card, i) => {
      const a = i * step - angle;
      const depth = (1 + Math.cos(a)) / 2;
      const value = ([back, front, curve]) => mix(back, front, depth ** curve);
      const rise = out((entrance - i * settings.stagger) / settings.riseTime);
      card.style.transform = `translate(-50%, -50%) translate(${Math.sin(a) * radiusX}px, ${Math.cos(a) * radiusY + (1 - rise) * 35}px) scale(${value(settings.scale)})`;
      card.style.filter = `brightness(${value(settings.brightness)}) blur(${value(settings.blur)}px)`;
      card.style.opacity = rise;
      card.style.zIndex = Math.round(depth * 1000);
    });
    points.forEach((point, i) => placePoint(point, i * TURN / points.length - angle + time * TURN / settings.pointPeriod, trackOffset));
    markers.forEach((marker, i) => placePoint(marker, i * step - angle));
    const introLabel = out((entrance - enterEnd) / settings.labelFade);
    label.style.opacity = introLabel * (rotation ? 1 - Math.sin(Math.PI * clamp(rotation.age / rotation.duration)) : 1);
    screen.style.opacity = out(entrance / settings.enterFade);
    const progress = clamp(entrance / settings.dustTime);
    dust.style.opacity = (1 - progress) * out(progress * 12);
    if (progress < 1) {
      const w = screen.clientWidth;
      const h = screen.clientHeight;
      const reach = Math.hypot(w, h) * out(progress);
      particles.forEach(({ angle, reach: distance, point }) => {
        point.setAttribute('cx', w / 2 + Math.cos(angle) * reach * distance);
        point.setAttribute('cy', h / 2 + Math.sin(angle) * reach * distance);
      });
    }
  }

  function setIndex(value) {
    index = value;
    label.textContent = sections[index].name;
    cards.forEach((card, i) => {
      const front = i === index;
      card.classList.toggle('is-front', front);
      card.setAttribute('aria-current', String(front));
    });
  }

  function push(hash, from) {
    history.pushState({ orbitFrom: from }, '', hash);
    sync();
  }

  function sync() {
    const hash = location.hash;
    const sub = sections.findIndex(section => hash === '#/' + section.id);
    const destination = hash === ORBIT ? 'orbit' : sub >= 0 ? 'child' : '';
    if (page && !destination) {
      location.reload();
      return;
    }
    if (destination === 'orbit') {
      const fromChild = page === 'child';
      rotation = null;
      angle = index * step;
      entrance = fromChild || reduced.matches ? Infinity : 0;
      if (fromChild) requestAnimationFrame(() => cards[index].focus({ preventScroll: true }));
    }
    if (destination === 'child') {
      setIndex(sub);
      childTitle.textContent = sections[sub].name;
    }
    if (destination !== 'orbit' && cloudDrag) finishCloudDrag();
    page = destination;
    stage.inert = Boolean(page);
    stage.classList.toggle('routed-away', Boolean(page));
    screen.hidden = page !== 'orbit';
    child.hidden = page !== 'child';
    if (page === 'orbit') fit();
    if (page === 'child') child.querySelector('a').focus({ preventScroll: true });
  }

  function select(target, direction = 0) {
    if (page !== 'orbit' || rotation) return;
    if (target === index) {
      push('#/' + sections[index].id, ORBIT);
      return;
    }
    let travel = shortest(target * step - angle);
    if (Math.abs(Math.abs(travel) - Math.PI) < .001 && direction) travel = direction * Math.PI;
    const fade = reduced.matches;
    rotation = { from: angle, travel, target, age: 0, fade, duration: fade ? settings.fadeTurn : settings.turnTime };
  }

  function shift(direction) {
    select(wrap(index + direction), direction);
  }

  previous.addEventListener('click', () => shift(-1));
  next.addEventListener('click', () => shift(1));
  window.addEventListener('keydown', event => {
    if (page !== 'orbit' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    shift(event.key === 'ArrowLeft' ? -1 : 1);
  });
  interaction.addEventListener('dragstart', event => event.preventDefault());
  interaction.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || event.target.closest('.orbit-arrow')) return;
    suppressClick = false;
    drag = null;
    if (!isControl(event.target)) {
      if (!sky || reduced.matches) return;
      cloudDrag = { id: event.pointerId, x: event.clientX, samples: [[event.timeStamp, event.clientX]] };
      interaction.setPointerCapture(event.pointerId);
      interaction.classList.add('is-grabbing');
      sky.grab();
      return;
    }
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  });
  function finishCloudDrag(event) {
    if (!cloudDrag) return;
    const { id, samples } = cloudDrag;
    const last = samples.at(-1);
    const first = samples[0];
    const seconds = (last[0] - first[0]) / 1000;
    const recent = event && event.timeStamp - last[0] < dragSettings.releaseWindow * 1000;
    const velocity = recent && seconds > 0
      ? (last[1] - first[1]) / interaction.clientWidth * dragSettings.sensitivity / seconds : 0;
    cloudDrag = null;
    sky?.release(velocity);
    interaction.classList.remove('is-grabbing');
    if (interaction.hasPointerCapture(id)) interaction.releasePointerCapture(id);
  }

  function swipeCard(event) {
    if (drag?.id !== event.pointerId || drag.swiped || page !== 'orbit') return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (Math.abs(dx) < settings.swipeDistance || Math.abs(dx) <= Math.abs(dy)) return;
    drag.swiped = true;
    suppressClick = true;
    shift(dx < 0 ? 1 : -1);
  }

  window.addEventListener('pointermove', event => {
    swipeCard(event);
    if (cloudDrag?.id !== event.pointerId) return;
    const { samples, x } = cloudDrag;
    sky.drag((event.clientX - x) / interaction.clientWidth * dragSettings.sensitivity);
    cloudDrag.x = event.clientX;
    samples.push([event.timeStamp, event.clientX]);
    while (samples.length > 2 && event.timeStamp - samples[0][0] > dragSettings.releaseWindow * 1000) samples.shift();
  });
  interaction.addEventListener('lostpointercapture', event => {
    if (cloudDrag?.id === event.pointerId) finishCloudDrag();
    if (drag?.id === event.pointerId) drag = null;
  });
  window.addEventListener('pointerup', event => {
    if (cloudDrag?.id === event.pointerId) finishCloudDrag(event);
    if (drag?.id !== event.pointerId) return;
    swipeCard(event);
    drag = null;
  });
  window.addEventListener('pointercancel', event => {
    if (cloudDrag?.id === event.pointerId) finishCloudDrag();
    if (drag?.id === event.pointerId) drag = null;
  });
  window.addEventListener('blur', () => {
    finishCloudDrag();
    targetX = targetY = 0;
  });
  interaction.addEventListener('click', event => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  interaction.addEventListener('pointermove', event => {
    if (event.pointerType !== 'mouse' || reduced.matches) return;
    const { left, top, width: w, height: h } = interaction.getBoundingClientRect();
    targetX = (1 - 2 * clamp((event.clientY - top) / h)) * settings.tilt;
    targetY = (2 * clamp((event.clientX - left) / w) - 1) * settings.tilt;
  });
  interaction.addEventListener('pointerleave', () => { targetX = targetY = 0; });
  window.addEventListener('hashchange', sync);
  reduced.addEventListener('change', () => {
    interaction.classList.toggle('is-grabbable', !reduced.matches);
    if (!reduced.matches) return;
    tiltX = tiltY = targetX = targetY = 0;
    entrance = Infinity;
    if (rotation) {
      setIndex(rotation.target);
      angle = index * step;
      rotation = null;
    }
    finishCloudDrag();
    sky?.freeze();
    if (page === 'orbit') paint();
  });
  interaction.classList.toggle('is-grabbable', !reduced.matches);
  routeBack(screen.querySelector('.orbit-back'), HOME, HOME, sync);
  routeBack(child.querySelector('.orbit-back'), ORBIT, ORBIT, sync);
  new ResizeObserver(fit).observe(interaction);
  setIndex(index);
  sync();
  return {
    get inNext() { return Boolean(page); },
    enter() {
      if (!page) push(ORBIT, HOME);
    },
    isClickable(x, y) {
      return Boolean(page && document.elementFromPoint(x, y)?.closest('.orbit-card, .orbit-arrow, .orbit-back'));
    },
    cursorMode(x, y) {
      if (page !== 'orbit' || reduced.matches) return '';
      if (cloudDrag) return 'grabbing';
      const target = document.elementFromPoint(x, y);
      return target && interaction.contains(target) && !isControl(target) ? 'grab' : '';
    },
    update(dt) {
      if (page !== 'orbit' || !dt) return;
      const rawDt = dt;
      dt = Math.min(dt, .05);
      if (reduced.matches && !rotation) return;
      entrance = Math.min(Math.max(enterEnd + settings.labelFade, settings.dustTime), entrance + dt);
      if (!reduced.matches) time += dt;
      const follow = Math.min(1, dt * 8);
      tiltX = mix(tiltX, targetX, follow);
      tiltY = mix(tiltY, targetY, follow);
      const before = angle;
      if (rotation) {
        rotation.age += dt;
        const t = clamp(rotation.age / rotation.duration);
        if (rotation.fade) {
          if (t >= .5 && index !== rotation.target) {
            setIndex(rotation.target);
            angle = index * step;
          }
        } else angle = rotation.from + ease(t) * rotation.travel;
        if (t === 1) {
          setIndex(rotation.target);
          angle = index * step;
          rotation = null;
        }
      }
      if (!reduced.matches) {
        sky?.update(dt, rawDt, -shortest(angle - before) / dt * settings.turnTime / step);
      }
      paint();
    },
  };
}
