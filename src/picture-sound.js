import { picture, SOUND_ENABLED, SOUND_VOLUME, GLASS_GRAIN_COUNT, GLASS_FREQ_MIN, GLASS_FREQ_MAX, GLASS_DECAY } from './config.js';

export function makeImpactSound() {
  const settings = picture.sound;
  let enabled = SOUND_ENABLED;
  let context, master, noise;
  let voices = 0;
  let closed = false;

  function unlock() {
    if (closed || !enabled) return;
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return;
    try {
      if (!context) {
        context = new Audio();
        master = context.createGain();
        master.gain.value = document.hidden ? 0 : SOUND_VOLUME;
        master.connect(context.destination);
        noise = context.createBuffer(1, Math.ceil(context.sampleRate * settings.noiseTime[1]), context.sampleRate);
        const samples = noise.getChannelData(0);
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
      }
      if (context.state !== 'running') void context.resume().catch(() => {});
    } catch {
      // 浏览器拒绝音频时仍可正常播放画面。
    }
  }

  function sync() {
    if (master) master.gain.setValueAtTime(enabled && !document.hidden ? SOUND_VOLUME : 0, context.currentTime);
  }

  const random = ([a, b]) => a + (b - a) * Math.random();

  function envelope(gain, at, duration, peak, attack) {
    gain.setValueAtTime(.00001, at);
    gain.linearRampToValueAtTime(peak, at + attack);
    gain.exponentialRampToValueAtTime(.00001, at + duration);
  }

  function crack(bus, type, frequency, at, length, volume) {
    const burst = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    burst.buffer = noise;
    filter.type = type;
    filter.frequency.value = frequency;
    if (type === 'bandpass') filter.Q.value = 1.6;
    envelope(gain.gain, at, length, volume, .001);
    burst.connect(filter).connect(gain).connect(bus);
    burst.start(at, 0, length);
    burst.onended = () => { burst.disconnect(); filter.disconnect(); gain.disconnect(); };
  }

  function grain(bus, frequency, at, duration, volume, type) {
    const tone = context.createOscillator();
    const gain = context.createGain();
    tone.type = type;
    tone.frequency.value = Math.min(frequency, context.sampleRate * .46);
    envelope(gain.gain, at, duration, volume, settings.attack);
    tone.connect(gain).connect(bus);
    tone.start(at);
    tone.stop(at + duration);
    tone.onended = () => { tone.disconnect(); gain.disconnect(); };
  }

  function play() {
    if (!enabled || document.hidden || context?.state !== 'running' || voices >= settings.voices) return;
    voices++;
    const now = context.currentTime;
    const volume = random([.68, 1]);
    const pitch = random(settings.pitchShift);
    const duration = random(settings.scatter);
    const bus = context.createGain();
    bus.connect(master);
    crack(bus, 'bandpass', random(settings.impactBand) * pitch, now, random(settings.impactTime), volume * .88);

    const count = Math.floor(random([GLASS_GRAIN_COUNT[0], GLASS_GRAIN_COUNT[1] + 1]));
    for (let i = 0; i < count; i++) {
      // 幂曲线把碎片集中在撞击后的开头，随后逐渐稀疏。
      const progress = ((i + Math.random()) / count) ** 2.05;
      const at = now + .008 + duration * progress;
      const decay = random(GLASS_DECAY);
      const frequency = random([GLASS_FREQ_MIN, GLASS_FREQ_MAX]) * pitch;
      const peak = volume * random([.13, .29]) * Math.exp(-3.4 * progress);
      grain(bus, frequency, at, decay, peak, Math.random() < .30 ? 'triangle' : 'sine');
      grain(bus, frequency * random(settings.overtone), at, decay * .75, peak * .29, 'sine');
    }

    const noiseCount = Math.floor(random([settings.noiseGrains[0], settings.noiseGrains[1] + 1]));
    for (let i = 0; i < noiseCount; i++) {
      const f = ((i + Math.random()) / noiseCount) ** 2;
      crack(bus, 'highpass', settings.highpass * pitch, now + .01 + duration * f,
        random(settings.noiseTime), volume * .19 * (1 - f * .75));
    }

    // 用音频时钟释放撞击声道，切到后台也不会遗留计数。
    const end = context.createBufferSource();
    end.buffer = context.createBuffer(1, 1, context.sampleRate);
    end.connect(bus);
    end.start(now + duration + GLASS_DECAY[1] + .02);
    end.onended = () => { end.disconnect(); bus.disconnect(); voices--; };
  }

  return {
    unlock, play, sync,
    get enabled() { return enabled; },
    toggle() { enabled = !enabled; sync(); if (enabled) unlock(); },
    destroy() { closed = true; if (context) void context.close().catch(() => {}); },
  };
}
