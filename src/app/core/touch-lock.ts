/**
 * Stops pinch-zoom. CSS (touch-action) and the viewport tag cover most browsers; iOS Safari ignores both for
 * pinching, so its gesture events and multi-finger moves are cancelled here too.
 * Double-tap zoom is handled by touch-action in the stylesheet, not here, so fast repeat taps on the sale grid still count.
 */
export function lockPinchZoom(): void {
  const stop = (event: Event) => event.preventDefault();
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, stop, { passive: false });
  }
  document.addEventListener('touchmove', (event) => { if (event.touches.length > 1) event.preventDefault(); }, { passive: false });
  // Ctrl + scroll wheel (and trackpad pinch) zooms desktop browsers.
  document.addEventListener('wheel', (event) => { if (event.ctrlKey) event.preventDefault(); }, { passive: false });
}
