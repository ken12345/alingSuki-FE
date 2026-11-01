import { Component, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Ledger } from './core/ledger';
import { InstallHint } from './shared/install-hint';

@Component({
  imports: [RouterOutlet, InstallHint],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App {
  protected readonly ledger = inject(Ledger);
  protected readonly updateReady = signal(false);

  constructor() {
    inject(SwUpdate)
      .versionUpdates.pipe(filter((e) => e.type === 'VERSION_READY'))
      .subscribe(() => this.updateReady.set(true));
  }

  protected reload(): void {
    location.reload();
  }
}
