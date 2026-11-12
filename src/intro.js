import { INTRO } from './motion-config.js';

const SVG = 'http://www.w3.org/2000/svg';

function shape(name, attributes) {
  const node = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  return node;
}

function progress(time, start, end) {
  return Math.max(0, Math.min(1, (time - start) / (end - start)));
}

function fade(time, start, end) {
  const t = progress(time, start, end);
  return t * t * (3 - 2 * t);
}

function mix([min, max], amount) {
  return min + (max - min) * amount;
}

function makeLeaves(overlay) {
  let seed = 1701;
  function random() {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  }
  return Array.from({ length: Math.max(0, Math.min(30, Math.floor(INTRO.leafCount))) }, () => {
    // Start inside the canopy silhouette, so each leaf appears to detach.
    const x = mix([1035, 1470], random());
    const y = mix([110, 196], random()) + (x > 1390 ? 48 : 0);
    const color = INTRO.leafColors[Math.floor(random() * INTRO.leafColors.length)];
    const leaf = shape('path', {
      d: 'M-6 0Q-1 -5 7 -1Q3 4-6 0Z M-5 0 4-1',
      fill: color, stroke: '#748162', 'stroke-width': '.46', opacity: 0,
    });
    overlay.append(leaf);
    return {
      leaf, x, y, speed: mix(INTRO.leafSpeed, random()), life: mix(INTRO.leafLife, random()),
      delay: INTRO.gustStart + x / INTRO.gustSpeed + INTRO.leafStagger * random(),
      size: mix([.64, 1.4], random()), spin: mix([-430, 460], random()), phase: random() * 6.28,
    };
  });
}

function makeWindLines(overlay) {
  return Array.from({ length: INTRO.windLines }, (_, i) => {
    const line = shape('path', {
      d: 'M-430 16C-308 39-214-55-110-12S-20 6 0 0',
      fill: 'none', stroke: 'url(#intro-line-color)', 'stroke-width': 1.4, 'stroke-linecap': 'round',
      opacity: 0,
    });
    overlay.append(line);
    return { line, delay: INTRO.gustStart - .12 + i * .12, y: 160 + i * 102 };
  });
}

function makeTitleReveal() {
  const words = [...document.querySelectorAll('.title-word')];
  const sources = words.map(word => word.textContent);
  const letters = words.flatMap((word, i) => Array.from(sources[i], letter => {
    const span = document.createElement('span');
    span.textContent = letter;
    return span;
  }));
  let offset = 0;
  for (const [i, word] of words.entries()) {
    const length = Array.from(sources[i]).length;
    word.replaceChildren(...letters.slice(offset, offset + length));
    offset += length;
  }
  const apple = document.querySelector('#green-apple');
  const glint = shape('g', { 'clip-path': 'url(#apple-photo-silhouette)', 'pointer-events': 'none' });
  const beam = shape('path', { d: 'M-17 83 26 0', stroke: '#fffde9', 'stroke-width': 8, opacity: 0 });
  glint.append(beam);
  apple.append(glint);
  const reversed = letters.reverse();
  return {
    update(time) {
      const [start, end] = INTRO.letters;
      reversed.forEach((letter, i) => {
        const delay = start + (end - start - .26) * i / Math.max(1, reversed.length - 1);
        letter.style.opacity = fade(time, delay, delay + .26);
      });
      apple.style.opacity = fade(time, ...INTRO.apple);
      const flash = progress(time, ...INTRO.glint);
      beam.setAttribute('opacity', .46 * Math.sin(Math.PI * flash) ** 2);
      beam.setAttribute('transform', `translate(${-20 + flash * 105} 0)`);
    },
    finish() {
      for (const [i, word] of words.entries()) word.textContent = sources[i];
      apple.style.removeProperty('opacity');
      glint.remove();
    },
  };
}

export function makeIntro(stage) {
  const overlay = shape('svg', {
    class: 'intro-effects', viewBox: '0 0 1600 1000', 'aria-hidden': 'true',
    'pointer-events': 'none',
  });
  const gradient = shape('linearGradient', { id: 'intro-line-color' });
  for (const [offset, opacity] of [[0, 0], [.38, .22], [.82, .86], [1, 0]]) {
    gradient.append(shape('stop', { offset, 'stop-color': INTRO.lineColor, 'stop-opacity': opacity }));
  }
  const defs = shape('defs', {});
  defs.append(gradient);
  overlay.append(defs);
  stage.append(overlay);

  const lines = makeWindLines(overlay);
  const leaves = makeLeaves(overlay);
  const cues = [[850, 337, 1], [1334, 701, .85], [1165, 843, .8]].map(([x, y, size]) => {
    const star = shape('path', {
      d: 'M0-14Q1-1 14 0Q1 1 0 14Q-1 1-14 0Q-1-1 0-14Z',
      fill: '#f5fff1', stroke: '#e4ffed', 'stroke-width': .55, opacity: 0,
      transform: `translate(${x} ${y}) scale(${size})`,
    });
    overlay.append(star);
    return star;
  });
  const title = makeTitleReveal();
  const artwork = stage.querySelectorAll('#night, #art, #ground-plane, #crane-trail, #corner-marks');
  const stars = stage.querySelectorAll('#night-stars, #cross-stars');
  const arches = [...stage.querySelectorAll('#cloister-arches > path')];
  let revealed = false;
  let finished = false;

  function reveal() {
    if (revealed) return;
    for (const layer of [...artwork, ...stars, ...arches]) layer.style.removeProperty('opacity');
    for (const { line } of lines) line.remove();
    for (const { leaf } of leaves) leaf.remove();
    title.finish();
    revealed = true;
  }

  function finish() {
    reveal();
    overlay.remove();
    finished = true;
  }

  return {
    update(time) {
      if (finished) return;
      if (time >= INTRO.duration) {
        reveal();
        const age = time - INTRO.duration;
        if (age >= INTRO.cueDuration) {
          finish();
          return;
        }
        cues.forEach((star, i) => {
          const pulse = progress(age, .1 + .26 * i, INTRO.cueDuration);
          star.setAttribute('opacity', .72 * Math.sin(Math.PI * pulse) ** 1.4);
        });
        return;
      }

      for (const layer of artwork) layer.style.opacity = fade(time, ...INTRO.artwork);
      for (const layer of stars) layer.style.opacity = fade(time, ...INTRO.stars);
      const [start, end] = INTRO.arches;
      arches.forEach((arch, i) => {
        const delay = start + (end - start - .33) * i / Math.max(1, arches.length - 1);
        arch.style.opacity = Number(arch.getAttribute('opacity') ?? 1) * fade(time, delay, delay + .33);
      });
      for (const { line, delay, y } of lines) {
        const age = time - delay;
        line.setAttribute('opacity', .68 * fade(age, 0, .23) * (1 - fade(age, 1.15, 1.73)));
        line.setAttribute('transform', `translate(${-35 + INTRO.lineSpeed * age} ${y - age * 32})`);
      }
      for (const { leaf, x, y, speed, life, delay, size, spin, phase } of leaves) {
        const age = time - delay;
        if (age <= 0 || age >= life) {
          leaf.setAttribute('opacity', 0);
          continue;
        }
        const height = y - age * 39 + Math.sin(phase + age * 5) * 15 * age + 35 * age ** 2;
        const flip = .28 + .72 * Math.abs(Math.cos(phase + age * 5));
        leaf.setAttribute('opacity', fade(age, 0, .1) * (1 - fade(age, life * .42, life)));
        leaf.setAttribute('transform', `translate(${x + speed * age} ${height}) rotate(${spin * age + phase * 25}) scale(${size} ${size * flip})`);
      }
      title.update(time);
    },
    finish,
  };
}
