import { photoAlbum as c } from './config.js';

export function mountPictureLightbox(scene, signal, motion, getBook) {
  if (!c.LIGHTBOX_ENABLED) return { visible: false, close() {} };
  const overlay = document.createElement('div');
  overlay.className = 'picture-lightbox';
  overlay.hidden = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-label', '相册照片放大查看，按 Esc 关闭');
  overlay.tabIndex = -1;
  overlay.style.setProperty('--picture-lightbox-dim', c.LIGHTBOX_DIM);
  const card = document.createElement('canvas');
  card.setAttribute('aria-label', '放大的相纸');
  overlay.append(card);
  scene.append(overlay);
  let visible = false, animation, previousFocus;

  function close() {
    if (!visible) return;
    animation?.cancel();
    overlay.hidden = true;
    card.width = card.height = 0;
    visible = false;
    getBook()?.pauseEmission(false);
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }

  function hit(event) {
    if (!(event.target instanceof Element) || !scene.contains(event.target) ||
        event.target.closest('button, a, input, label, .picture-controls, [role="button"]')) return null;
    return getBook()?.hitPhoto(event.clientX, event.clientY);
  }

  document.addEventListener('pointerup', event => {
    if (!event.isPrimary || event.button !== 0) return;
    if (visible) { close(); return; }
    const entry = hit(event);
    if (!entry) return;
    const source = entry.texture.image;
    card.width = source.width;
    card.height = source.height;
    card.getContext('2d').drawImage(source, 0, 0);
    previousFocus = document.activeElement;
    overlay.hidden = false;
    overlay.focus({ preventScroll: true });
    scene.classList.remove('picture-photo-hover');
    visible = true;
    getBook()?.pauseEmission(true);
    if (!motion.matches) animation = overlay.animate([{ opacity: 0 }, { opacity: 1 }],
      { duration: c.LIGHTBOX_FADE * 1000, easing: 'ease-out' });
  }, { signal });
  document.addEventListener('pointermove', event => {
    scene.classList.toggle('picture-photo-hover', !visible && event.pointerType !== 'touch' && Boolean(hit(event)));
  }, { signal, passive: true });
  document.addEventListener('keydown', event => {
    if (visible && event.key === 'Escape') { event.stopPropagation(); close(); }
  }, { signal, capture: true });
  return { get visible() { return visible; }, close };
}
