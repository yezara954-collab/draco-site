// 全站复用一个 AudioContext。直接在用户手势内调用，跨子页保留解锁状态。
let context;
let fallbacksInstalled = false;

export function getSiteAudioContext() {
  return context;
}

export function unlockSiteAudio() {
  try {
    if (!context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      context = new Audio();
    }
    if (context.state !== 'running' && context.state !== 'closed') {
      void context.resume().catch(() => {});
    }
  } catch {
    // 浏览器阻止音频或设备暂不可用时，画面继续播放。
  }
}

export function installSiteAudioFallbacks() {
  if (fallbacksInstalled) return;
  fallbacksInstalled = true;
  for (const type of ['pointerdown', 'touchend', 'keydown']) {
    window.addEventListener(type, unlockSiteAudio, { capture: true, once: true, passive: true });
  }
}
