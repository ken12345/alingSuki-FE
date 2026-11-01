import { Component, OnInit, signal } from '@angular/core';

interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
}

const DISMISS_KEY = 'install-hint-dismissed';
const DISMISS_DAYS = 14;

/** Nudges people to put the app on their home screen, which is the only way to lose the browser's address bar. */
@Component({
  selector: 'app-install-hint',
  template: `
    @if (visible()) {
      <div class="install-hint" role="region" aria-label="Install the app">
        <img src="icons/icon-96.png" width="36" height="36" class="rounded" alt="">
        <div class="flex-grow-1 small lh-sm">
          <b>Install Aling Suki</b><br>
          @if (installEvent()) {
            Open it like an app, even offline.
          } @else {
            Tap <i class="bi bi-box-arrow-up"></i> Share, then <b>Add to Home Screen</b>.
          }
        </div>
        @if (installEvent()) {
          <button type="button" class="btn btn-sm btn-primary" (click)="install()">Install</button>
        }
        <button type="button" class="btn-close" aria-label="Dismiss" (click)="dismiss()"></button>
      </div>
    }
  `,
})
export class InstallHint implements OnInit {
  protected readonly installEvent = signal<InstallPromptEvent | null>(null);
  protected readonly visible = signal(false);

  ngOnInit(): void {
    if (this.isStandalone() || this.wasDismissed()) return;

    // Android and desktop Chrome offer a real install button.
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.installEvent.set(e as InstallPromptEvent);
      this.visible.set(true);
    });
    // iPhone and iPad have no install API, so show the Share-menu steps instead.
    if (this.isIos()) this.visible.set(true);
  }

  protected async install(): Promise<void> {
    await this.installEvent()?.prompt();
    this.visible.set(false);
  }

  protected dismiss(): void {
    this.visible.set(false);
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode: just hide it for now */ }
  }

  private isStandalone(): boolean {
    return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  }

  private isIos(): boolean {
    const ua = navigator.userAgent;
    return /iphone|ipad|ipod/i.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
  }

  private wasDismissed(): boolean {
    try {
      const at = Number(localStorage.getItem(DISMISS_KEY));
      return at > 0 && Date.now() - at < DISMISS_DAYS * 86_400_000;
    } catch {
      return false;
    }
  }
}
