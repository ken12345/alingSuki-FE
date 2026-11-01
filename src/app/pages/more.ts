import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../core/auth';
import { Ledger } from '../core/ledger';
import { Sync } from '../core/sync';
import { PageHeader } from '../shared/page-header';

@Component({
  selector: 'app-more',
  imports: [FormsModule, RouterLink, PageHeader],
  template: `
    <app-page-header title="More" />
    <div class="page-body">
      @if (!ledger.online()) {
        <div class="alert alert-warning py-2 mb-0 small fw-semibold"><i class="bi bi-wifi-off"></i> You're offline. Everything is still saved on this phone.</div>
      }
      @if (!ledger.storageOk()) {
        <div class="alert alert-danger py-2 mb-0 small fw-semibold"><i class="bi bi-exclamation-octagon"></i> This browser is not saving your data. Save a backup file now, and do not use private mode.</div>
      }

      <div class="card"><div class="card-body">
        <div class="d-flex justify-content-between align-items-center">
          <b>Backup</b>
          @if (sync.linked()) { <span class="badge" [class]="badgeClass()">{{ label() }}</span> }
        </div>

        @if (sync.linked()) {
          <div class="small text-secondary my-2">{{ detail() }}</div>
          @if (sync.state() === 'needs-login') {
            <input class="form-control mb-2" type="password" autocomplete="current-password" placeholder="Your password" [(ngModel)]="password" aria-label="Password">
            <button type="button" class="btn btn-primary w-100 mb-2" [disabled]="busy()" (click)="relogin()">Log in again</button>
          } @else {
            <button type="button" class="btn btn-outline-primary w-100 mb-2" [disabled]="sync.state() === 'syncing'" (click)="sync.syncNow()"><i class="bi bi-arrow-repeat"></i> Sync now</button>
          }
        } @else if (sync.enabled) {
          <div class="small text-secondary my-2">
            Your records are only on this phone. Back them up online so they survive a lost phone, and so you can use the same account on another phone.
            It needs the internet once; after that the app still works offline.
          </div>
          <input class="form-control mb-2" type="password" autocomplete="current-password" placeholder="Your password" [(ngModel)]="password" aria-label="Password">
          <button type="button" class="btn btn-primary w-100 mb-2" [disabled]="busy()" (click)="backUpOnline()">{{ busy() ? 'Backing up...' : 'Back up online' }}</button>
        } @else {
          <div class="small text-secondary my-2">
            Your records are saved on this phone. {{ ledger.persisted() ? 'The browser has promised not to clear them.' : 'The browser may clear them if the phone runs low on space, so keep a backup file.' }}
            Online backup is coming later.
          </div>
        }
        @if (message()) { <div class="small fw-semibold mb-2" [class.text-danger]="isError()" [class.text-success]="!isError()" role="status">{{ message() }}</div> }

        <div class="d-flex flex-column gap-2">
          <button type="button" class="btn btn-outline-secondary" (click)="download()"><i class="bi bi-download"></i> Save backup file</button>
          @if (!sync.linked()) {
            <label class="btn btn-outline-secondary mb-0"><i class="bi bi-upload"></i> Restore from backup file
              <input type="file" accept=".json,application/json" class="d-none" (change)="pick($event)"></label>
          }
        </div>
      </div></div>

      <div class="d-flex flex-column gap-2">
        <a class="row-card" routerLink="/items"><div class="grow fw-bold">Items and prices<div class="sub fw-normal">Prices, profit and stock</div></div><i class="bi bi-chevron-right"></i></a>
        <a class="row-card" routerLink="/shopping"><div class="grow fw-bold">Shopping list<div class="sub fw-normal">{{ ledger.shoppingCount() ? ledger.shoppingCount() + ' to buy at the market' : 'Things to buy at the market' }}</div></div><i class="bi bi-chevron-right"></i></a>
        <div class="row-card"><div class="grow fw-bold">Shop name<div class="sub fw-normal">{{ ledger.shopName() }}</div></div></div>
        <div class="row-card"><div class="grow fw-bold">Language<div class="sub fw-normal">English</div></div></div>
        <a class="row-card" routerLink="/set-pin"><div class="grow fw-bold">{{ auth.hasPin() ? 'Change PIN' : 'Set a PIN' }}<div class="sub fw-normal">Log in faster with 4 digits</div></div><i class="bi bi-chevron-right"></i></a>
        @if (auth.hasPin()) {
          <button type="button" class="row-card text-start" (click)="turnOffPin()"><div class="grow fw-bold">Turn off PIN login</div></button>
        }
        <label class="row-card">
          <div class="grow fw-bold">Show profit on items</div>
          <div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" role="switch" [(ngModel)]="showProfit" aria-label="Show profit on items"></div>
        </label>
        <label class="row-card">
          <div class="grow fw-bold">Automatic reminders<div class="sub fw-normal">Coming later</div></div>
          <div class="form-check form-switch m-0"><input class="form-check-input" type="checkbox" role="switch" disabled aria-label="Automatic reminders"></div>
        </label>
        @if (sync.linked()) {
          <button type="button" class="row-card text-start" (click)="leaving.set(true)"><div class="grow fw-bold text-danger">Remove this account from this phone<div class="sub fw-normal">Your records stay safe online</div></div><i class="bi bi-box-arrow-right text-danger"></i></button>
        } @else {
          <button type="button" class="row-card text-start" (click)="confirmErase.set(true)"><div class="grow fw-bold text-danger">Erase all data on this phone<div class="sub fw-normal">Customers, items and records</div></div><i class="bi bi-trash text-danger"></i></button>
        }
      </div>

      <button type="button" class="btn btn-outline-secondary mt-2" (click)="logout()"><i class="bi bi-lock"></i> Lock and log out</button>
    </div>

    @if (confirmErase()) {
      <div class="sheet-dim" (click)="confirmErase.set(false)"></div>
      <div class="sheet d-flex flex-column gap-2">
        <h2 class="h5 fw-bold mb-0">Erase everything?</h2>
        <p class="small text-secondary mb-1">This removes all customers, items and records from this phone. It cannot be undone. Save a backup file first if you may need them.</p>
        <button type="button" class="btn btn-danger" (click)="erase()">Yes, erase everything</button>
        <button type="button" class="btn btn-link text-secondary" (click)="confirmErase.set(false)">Cancel</button>
      </div>
    }

    @if (leaving()) {
      <div class="sheet-dim" (click)="leaving.set(false)"></div>
      <div class="sheet d-flex flex-column gap-2">
        <h2 class="h5 fw-bold mb-0">Remove this account from this phone?</h2>
        <p class="small text-secondary mb-1">
          Your customers, items and records stay safe online. You can log in again on this or another phone with your mobile number and password.
          There is no password reset yet, so make sure you remember it.
        </p>
        @if (leaveError()) { <div class="text-danger small fw-semibold" role="alert">{{ leaveError() }}</div> }
        <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="leave()">Yes, remove it from this phone</button>
        <button type="button" class="btn btn-link text-secondary" (click)="leaving.set(false)">Cancel</button>
      </div>
    }
  `,
})
export class More {
  protected readonly ledger = inject(Ledger);
  protected readonly auth = inject(Auth);
  protected readonly sync = inject(Sync);
  private readonly router = inject(Router);

  protected showProfit = signal(true);
  protected readonly confirmErase = signal(false);
  protected readonly leaving = signal(false);
  protected readonly leaveError = signal('');
  protected readonly busy = signal(false);
  protected password = signal('');
  protected readonly message = signal('');
  protected readonly isError = signal(false);

  protected readonly label = computed(() => {
    switch (this.sync.state()) {
      case 'syncing': return 'Syncing...';
      case 'offline': return 'Offline';
      case 'error': return 'Problem';
      case 'needs-login': return 'Log in again';
      default: return this.sync.pending() > 0 ? 'Waiting to sync' : 'Backed up';
    }
  });

  protected readonly badgeClass = computed(() => {
    switch (this.sync.state()) {
      case 'syncing': return 'text-bg-secondary';
      case 'offline': return 'text-bg-warning';
      case 'error': case 'needs-login': return 'text-bg-danger';
      default: return this.sync.pending() > 0 ? 'text-bg-warning' : 'text-bg-success';
    }
  });

  protected readonly detail = computed(() => {
    const waiting = this.sync.pending();
    const waitingText = waiting ? `${waiting} ${waiting === 1 ? 'change is' : 'changes are'} waiting to be sent. ` : '';
    switch (this.sync.state()) {
      case 'offline': return `${waitingText}No connection. Everything is saved on this phone and will upload when you are back online.`;
      case 'error': return `${waitingText}${this.sync.lastError() || 'Something went wrong. It will try again.'}`;
      case 'needs-login': return 'Your online login expired. Enter your password to keep backing up. Nothing on this phone is lost.';
      case 'syncing': return 'Sending and receiving changes...';
      default: {
        const at = this.sync.lastSyncAt();
        return `${waitingText}${at ? 'Last synced ' + since(at) + '.' : 'Not synced yet.'} ${this.sync.lastError()}`.trim();
      }
    }
  });

  protected logout(): void {
    this.auth.signOut();
    this.router.navigate(['/login']);
  }

  protected async turnOffPin(): Promise<void> {
    await this.auth.removePin();
    this.ledger.showToast('PIN turned off');
  }

  protected erase(): void {
    this.ledger.eraseAll();
    this.confirmErase.set(false);
    this.ledger.showToast('All data erased');
  }

  protected async backUpOnline(): Promise<void> {
    if (!this.password()) return this.say('Enter your password.', true);
    this.busy.set(true);
    const problem = await this.auth.linkOnline(this.password());
    this.busy.set(false);
    this.password.set('');
    this.say(problem ?? 'Backed up online.', !!problem);
  }

  protected async relogin(): Promise<void> {
    if (!this.password()) return this.say('Enter your password.', true);
    this.busy.set(true);
    const problem = await this.sync.relogin(this.password());
    this.busy.set(false);
    this.password.set('');
    this.say(problem ?? 'Logged in again. Syncing...', !!problem);
  }

  protected async leave(): Promise<void> {
    this.busy.set(true);
    const problem = await this.auth.signOutAndRemoveData();
    this.busy.set(false);
    if (problem) return this.leaveError.set(problem);
    this.leaving.set(false);
    this.ledger.showToast('Removed from this phone');
    this.router.navigate(['/login']);
  }

  protected download(): void {
    const blob = new Blob([JSON.stringify(this.ledger.exportBackup(), null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `aling-suki-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    this.ledger.showToast('Backup file saved');
  }

  protected async pick(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const problem = this.ledger.restore(await file.text());
    this.ledger.showToast(problem ?? 'Backup restored');
  }

  private say(text: string, error: boolean): void {
    this.message.set(text);
    this.isError.set(error);
  }
}

function since(time: number): string {
  const minutes = Math.floor((Date.now() - time) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} hour${hours === 1 ? '' : 's'} ago` : new Date(time).toLocaleDateString();
}
