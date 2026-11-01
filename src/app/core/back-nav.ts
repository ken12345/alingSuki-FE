import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

/** The left quarter of the screen counts as the "edge" where a back swipe may start. */
const EDGE_FRACTION = 0.25;
const MIN_DISTANCE = 80;
/** How much the swipe may drift vertically, as a share of how far it went sideways. */
const MAX_DRIFT = 0.6;

type Target = string | readonly unknown[];

/**
 * Swipe from the left edge toward the right to go back on nested pages. Each nested page registers where "back"
 * leads (the page header does this for its back button), so the swipe does exactly what the button does.
 */
@Injectable({ providedIn: 'root' })
export class BackNav {
  private readonly router = inject(Router);
  private target: Target | null = null;
  private start: { x: number; y: number } | null = null;

  constructor() {
    document.addEventListener('touchstart', (e) => this.begin(e), { passive: true });
    document.addEventListener('touchmove', (e) => this.move(e), { passive: true });
    document.addEventListener('touchend', () => (this.start = null), { passive: true });
    document.addEventListener('touchcancel', () => (this.start = null), { passive: true });
  }

  /** Sets where a back swipe goes. Returns a function that removes it again. */
  register(target: Target): () => void {
    this.target = target;
    return () => {
      if (this.target === target) this.target = null;
    };
  }

  private begin(event: TouchEvent): void {
    const touch = event.touches[0];
    const sheetOpen = !!document.querySelector('.sheet');
    const canGoBack = this.target !== null && !sheetOpen && event.touches.length === 1;
    this.start = canGoBack && touch.clientX <= window.innerWidth * EDGE_FRACTION ? { x: touch.clientX, y: touch.clientY } : null;
  }

  // Decided while the finger is still moving: browsers cancel touch events once they start treating a drag as a scroll.
  private move(event: TouchEvent): void {
    if (!this.start || !this.target) return;
    if (event.touches.length !== 1) return void (this.start = null);
    const touch = event.touches[0];
    const dx = touch.clientX - this.start.x;
    const dy = Math.abs(touch.clientY - this.start.y);
    if (dx > MIN_DISTANCE && dy < dx * MAX_DRIFT) {
      const target = this.target;
      this.start = null;
      void this.router.navigate(typeof target === 'string' ? [target] : [...target]);
    }
  }
}
