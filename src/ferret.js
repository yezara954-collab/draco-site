import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { FERRET as F } from './motion-config.js';

const TAU = Math.PI * 2;
const unit = n => Math.max(0, Math.min(1, n));
const ease = n => {
  const t = unit(n);
  return t * t * (3 - 2 * t);
};
const lerp = (a, b, t) => a + (b - a) * t;
const between = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t)];

function makePose(sprite, count) {
  const { width, height } = sprite.texture.orig;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(sprite.texture.source.resource, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const samples = [];
  const step = 3;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (pixels[(y * width + x) * 4 + 3] < 148) continue;
      samples.push([x / width - .5, y / height - 1]);
    }
  }
  const points = Array.from({ length: count }, (_, i) =>
    samples[Math.floor((i + .15 + .7 * Math.random()) * samples.length / count)]);
  sprite.position.set(0, 0);
  sprite.anchor.set(.5, 1);
  sprite.eventMode = 'none';
  return { sprite, points, width: sprite.width, height: sprite.height,
    scaleX: sprite.scale.x, scaleY: sprite.scale.y, pixelWidth: width, pixelHeight: height };
}

function makeStarTexture(color, detailed) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 48;
  const ctx = canvas.getContext('2d');
  const glow = ctx.createRadialGradient(24, 24, 0, 24, 24, 23);
  glow.addColorStop(0, color);
  glow.addColorStop(.26, color + 'b0');
  glow.addColorStop(1, color + '00');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, 48, 48);
  if (detailed) {
    ctx.beginPath();
    ctx.moveTo(24, 3);
    ctx.quadraticCurveTo(26, 21, 42, 24);
    ctx.quadraticCurveTo(26, 26, 24, 45);
    ctx.quadraticCurveTo(22, 26, 6, 24);
    ctx.quadraticCurveTo(22, 21, 24, 3);
    ctx.fillStyle = color;
    ctx.fill();
  }
  return Texture.from(canvas);
}

function sourcePoint(pose, index, foot, scale, facing) {
  const [x, y] = pose.points[index];
  const nativeFacing = pose.sprite.label === 'ferret-low' ? -1 : 1;
  return [foot[0] + x * pose.width * scale * facing * nativeFacing,
    foot[1] + y * pose.height * scale];
}

// A shared route keeps the return trip on the same trunk. The first half
// follows the trunk, then the ribbon peels right onto the exposed branch.
function route(t, down) {
  const bend = [1280, 520];
  const start = down ? [F.ground[0], F.ground[1] - 23] : [F.root[0], F.root[1] - 23];
  const end = [F.branch[0], F.branch[1] - 15];
  const center = t < .62 ? between(start, bend, t / .62) : between(bend, end, (t - .62) / .38);
  const swirl = Math.sin(t * TAU * F.turns) * Math.sin(t * Math.PI) * F.spiralWidth;
  return [center[0] + swirl, center[1] + swirl * .13];
}

export function createFerret(sprites, debug, onPick) {
  const count = Math.max(1, Math.min(160, Math.floor(F.particleCount)));
  const low = makePose(sprites['ferret-low'], count);
  const raised = makePose(sprites['ferret-raised'], count);
  const layer = new Container({ label: 'ferret-scene' });
  const animal = new Container({ label: 'ferret', eventMode: 'static', interactiveChildren: false });
  const marks = new Graphics({ eventMode: 'none' });
  const stars = new Container({ eventMode: 'none' });
  const textures = F.colors.map(color => [makeStarTexture(color, false), makeStarTexture(color, true)]);
  const particles = Array.from({ length: count }, (_, i) => {
    const color = i % 9 === 0 ? 2 : i % 4 === 0 ? 1 : 0;
    const star = new Sprite({ texture: textures[color][i % 5 === 0 ? 1 : 0], anchor: .5, visible: false });
    stars.addChild(star);
    return { star, phase: Math.random() * TAU, size: 3 + 8 * Math.random() ** 2,
      lag: .025 + .22 * (i / count), drift: 8 + 36 * Math.random(), opacity: .38 + .59 * Math.random() };
  });
  const flash = new Sprite({ texture: textures[0][1], anchor: .5, visible: false });
  stars.addChild(flash);
  animal.addChild(low.sprite, raised.sprite);
  layer.addChild(animal, stars, marks);

  let perched = false;
  let age = null;
  let reduced = false;
  let pose = low;
  let scale = 1;
  let face = 1;
  const runningRight = F.root[0] >= F.ground[0] ? 1 : -1;
  const footprint = () => [-pose.width * scale / 2 - F.hitPadding, -pose.height * scale - F.hitPadding,
    pose.width * scale + 2 * F.hitPadding, pose.height * scale + 2 * F.hitPadding];
  animal.hitArea = {
    contains(x, y) {
      const [left, top, width, height] = footprint();
      if (age !== null || x < left || x > left + width || y < top || y > top + height) return false;
      const flip = face * (pose === low ? -1 : 1);
      const contains = (dx, dy) => pose.sprite.hitArea.contains(
        (dx * flip / (pose.width * scale) + .5) * pose.pixelWidth,
        (dy / (pose.height * scale) + 1) * pose.pixelHeight, 100,
      );
      if (contains(x, y)) return true;
      for (let i = 0; i < 8; i++) {
        const angle = i * TAU / 8;
        if (contains(x + Math.cos(angle) * F.hitPadding, y + Math.sin(angle) * F.hitPadding)) return true;
      }
      return false;
    },
  };

  function show(next, foot, size, facing, opacity = 1) {
    pose = next;
    scale = size;
    face = facing;
    animal.position.set(...foot);
    animal.alpha = opacity;
    low.sprite.visible = next === low;
    raised.sprite.visible = next === raised;
    next.sprite.scale.set(next.scaleX * size * facing * (next === low ? -1 : 1), next.scaleY * size);
  }

  function drawDebug() {
    if (!debug) return;
    marks.clear();
    marks.circle(...F.root, 5).stroke({ color: 0xffdda2, width: 1.5 });
    marks.circle(...F.branch, 5).stroke({ color: 0xadead2, width: 1.5 });
    if (age === null) {
      const [x, y, width, height] = footprint();
      const cell = 3;
      for (let row = y; row < y + height; row += cell) {
        let run = null;
        for (let col = x; col < x + width + cell; col += cell) {
          if (col < x + width && animal.hitArea.contains(col, row)) {
            run ??= col;
          } else if (run !== null) {
            marks.rect(animal.x + run, animal.y + row, col - run, cell);
            run = null;
          }
        }
      }
      marks.fill({ color: 0x9de9fb, alpha: .22 });
    }
  }

  function rest() {
    show(perched ? raised : low, perched ? F.branch : F.ground, perched ? F.branchScale : 1, 1);
    for (const { star } of particles) star.visible = false;
    flash.visible = false;
    age = null;
    drawDebug();
  }
  rest();

  animal.on('pointertap', () => {
    if (age !== null) return;
    age = 0;
    onPick();
    drawDebug();
  });

  function paintStars(time, down, from, to) {
    const disperseEnd = F.scatterTime;
    const travelEnd = disperseEnd + F.travelTime;
    particles.forEach(({ star, phase, size, lag, drift, opacity }, i) => {
      const start = down ? sourcePoint(raised, i, from, F.branchScale, 1)
        : sourcePoint(low, i, from, 1, runningRight);
      const end = down ? sourcePoint(low, i, to, 1, 1)
        : sourcePoint(raised, i, to, F.branchScale, 1);
      const local = time - lag * .42;
      let x;
      let y;
      let stretch = 1;
      if (local < disperseEnd) {
        const p = ease(local / disperseEnd);
        const stream = route(down ? 1 : 0, down);
        const fly = Math.sin(p * Math.PI) * drift;
        x = lerp(start[0], stream[0], p) + Math.cos(phase) * fly;
        y = lerp(start[1], stream[1], p) + Math.sin(phase) * fly;
      } else if (local < travelEnd) {
        const p = unit((local - disperseEnd) / F.travelTime);
        const spread = Math.sin(p * Math.PI);
        const trail = unit(p - lag * spread);
        [x, y] = route(down ? 1 - trail : trail, down);
        x += Math.cos(phase + p * 10) * spread * drift * .19;
        y += Math.sin(phase + p * 10) * spread * drift * .31;
        const ahead = route(unit((down ? 1 - trail : trail) + .014), down);
        const behind = route(unit((down ? 1 - trail : trail) - .014), down);
        star.rotation = Math.atan2(ahead[1] - behind[1], ahead[0] - behind[0]);
        stretch += 1.35 * spread;
      } else {
        const p = ease((local - travelEnd) / (F.gatherTime - lag * .42));
        [x, y] = between(route(down ? 0 : 1, down), end, p);
      }
      if (local < disperseEnd || local >= travelEnd) star.rotation = phase;
      star.position.set(x, y);
      star.alpha = opacity * ease(local / .16) * (1 - ease((time - travelEnd) / F.gatherTime));
      star.width = size * stretch;
      star.height = size;
      star.visible = star.alpha > .001;
    });
    const flashAge = (time - travelEnd - F.gatherTime + F.flashTime) / F.flashTime;
    flash.visible = flashAge > 0 && flashAge < 1;
    if (flash.visible) {
      flash.position.set(to[0], to[1] - (down ? 22 : 15));
      flash.alpha = .74 * Math.sin(Math.PI * flashAge);
      flash.width = flash.height = 29 + 23 * flashAge;
    }
  }

  return {
    layer,
    update(dt) {
      if (age === null) return false;
      age += dt;
      const down = perched;
      const destination = down ? F.ground : F.branch;
      const targetPose = down ? low : raised;
      const targetScale = down ? 1 : F.branchScale;
      if (reduced) {
        if (age < F.fadeTime) {
          show(down ? raised : low, down ? F.branch : F.ground,
            down ? F.branchScale : 1, 1, 1 - ease(age / F.fadeTime));
        } else {
          show(targetPose, destination, targetScale, 1, ease((age - F.fadeTime) / F.fadeTime));
          if (age >= 2 * F.fadeTime) { perched = !perched; rest(); }
        }
        return true;
      }
      const departure = down ? 0 : F.alertTime + F.runTime;
      if (age < departure) {
        if (age < F.alertTime) show(raised, F.ground, 1, runningRight);
        else {
          const p = unit((age - F.alertTime) / F.runTime);
          const foot = between(F.ground, F.root, p);
          foot[1] -= F.runLift * Math.abs(Math.sin(p * Math.PI * F.runBobs));
          show(low, foot, 1, runningRight);
        }
        return true;
      }
      const t = age - departure;
      const arrival = F.scatterTime + F.travelTime;
      if (t >= arrival + F.gatherTime) {
        perched = !perched;
        rest();
      } else {
        const from = down ? F.branch : F.root;
        if (t < F.scatterTime) {
          show(down ? raised : low, from, down ? F.branchScale : 1,
            down ? 1 : runningRight, 1 - ease(t / F.scatterTime));
        } else {
          show(targetPose, destination, targetScale, 1, ease((t - arrival) / F.gatherTime));
        }
        paintStars(t, down, from, destination);
      }
      return true;
    },
    setReduced(value) {
      if (reduced === value) return;
      reduced = value;
      if (age !== null) { perched = !perched; rest(); }
    },
  };
}
