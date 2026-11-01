import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Auth } from '../core/auth';
import { Ledger } from '../core/ledger';
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
        <b>Backup</b>
        <div class="small text-secondary my-2">
          Your records are saved on this phone. {{ ledger.persisted() ? 'The browser has promised not to clear them.' : 'The browser may clear them if the phone runs low on space, so keep a backup file.' }}
          Online backup is coming later.
        </div>
        <div class="d-flex flex-column gap-2">
          <button type="button" class="btn btn-outline-primary" (click)="download()"><i class="bi bi-download"></i> Save backup file</button>
          <label class="btn btn-outline-secondary mb-0"><i class="bi bi-upload"></i> Restore from backup file
            <input type="file" accept=".json,application/json" class="d-none" (change)="pick($event)"></label>
        </div>
      </div></div>

      <div class="d-flex flex-column gap-2">
        <a class="row-card" routerLink="/items"><div class="grow fw-bold">Items and prices<div class="sub fw-normal">Prices, profit and stock</div></div><i class="bi bi-chevron-right"></i></a>
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
        @if (ledger.customers().length === 0 && ledger.entries().length === 0) {
          <button type="button" class="row-card text-start" (click)="ledger.loadSample()"><div class="grow fw-bold">Load sample data<div class="sub fw-normal">Fill the app with an example store</div></div><i class="bi bi-magic"></i></button>
        }
        <button type="button" class="row-card text-start" (click)="confirmErase.set(true)"><div class="grow fw-bold text-danger">Erase all data on this phone<div class="sub fw-normal">Customers, items and records</div></div><i class="bi bi-trash text-danger"></i></button>
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
  `,
})
export class More {
  protected readonly ledger = inject(Ledger);
  protected readonly auth = inject(Auth);
  private readonly router = inject(Router);
  protected showProfit = signal(true);
  protected readonly confirmErase = signal(false);

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
}
