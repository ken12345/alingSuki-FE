import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ago, initials, normalizeMobile } from '../core/format';
import { Ledger } from '../core/ledger';
import { PageHeader } from '../shared/page-header';

type Filter = 'all' | 'credit' | 'overdue';

@Component({
  selector: 'app-customers',
  imports: [CurrencyPipe, FormsModule, RouterLink, PageHeader],
  template: `
    <app-page-header title="Customers">
      <button type="button" class="icon-btn primary" (click)="adding.set(true)" aria-label="Add customer"><i class="bi bi-plus-lg"></i></button>
    </app-page-header>

    <div class="page-body">
      <input class="form-control" type="search" placeholder="Search customers..." [(ngModel)]="query" aria-label="Search customers">
      <div class="chips">
        <button type="button" class="chip" [class.on]="filter() === 'all'" (click)="filter.set('all')">All {{ ledger.customers().length }}</button>
        <button type="button" class="chip" [class.on]="filter() === 'credit'" (click)="filter.set('credit')">With credit {{ withCredit() }}</button>
        <button type="button" class="chip" [class.on]="filter() === 'overdue'" (click)="filter.set('overdue')">Overdue {{ overdue() }}</button>
      </div>

      <div class="d-flex flex-column gap-2">
        @for (c of shown(); track c.id) {
          <a class="row-card" [routerLink]="['/customers', c.id]">
            <div class="avatar" [class.late]="ledger.isOverdue(c.id)">{{ initials(c.name) }}</div>
            <div class="grow">
              <div class="fw-bold">{{ c.name }}</div>
              <div class="sub">{{ lastSeen(c.id) }}</div>
            </div>
            <div class="text-end">
              <div class="fw-bold" [class.text-danger]="ledger.balanceOf(c.id) > 0" [class.text-success]="ledger.balanceOf(c.id) <= 0">
                {{ ledger.balanceOf(c.id) | currency: 'PHP' : 'symbol-narrow' : '1.0-0' }}
              </div>
              @if (ledger.isOverdue(c.id)) { <span class="badge text-bg-danger">Overdue</span> }
            </div>
          </a>
        } @empty {
          <div class="text-secondary text-center py-4">No customers match.</div>
        }
      </div>
    </div>

    @if (adding()) {
      <div class="sheet-dim" (click)="adding.set(false)"></div>
      <form class="sheet d-flex flex-column gap-2" (ngSubmit)="save()">
        <h2 class="h5 fw-bold mb-1">New customer</h2>
        <input class="form-control" name="name" placeholder="Name" [(ngModel)]="newName" autocomplete="off" required>
        <input class="form-control" name="phone" type="tel" inputmode="numeric" placeholder="Mobile number (optional)" [(ngModel)]="newPhone">
        @if (error()) { <div class="text-danger small fw-semibold">{{ error() }}</div> }
        <button class="btn btn-primary" type="submit">Save customer</button>
        <button class="btn btn-link text-secondary" type="button" (click)="adding.set(false)">Cancel</button>
      </form>
    }
  `,
})
export class Customers {
  protected readonly ledger = inject(Ledger);
  protected readonly initials = initials;

  protected query = signal('');
  protected readonly filter = signal<Filter>('all');
  protected readonly adding = signal(false);
  protected newName = signal('');
  protected newPhone = signal('');
  protected readonly error = signal('');

  protected readonly withCredit = computed(() => this.ledger.due().length);
  protected readonly overdue = computed(() => this.ledger.due().filter((c) => this.ledger.isOverdue(c.id)).length);

  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const f = this.filter();
    return this.ledger
      .customers()
      .filter((c) => c.name.toLowerCase().includes(q))
      .filter((c) => f === 'all' || (f === 'credit' ? this.ledger.balanceOf(c.id) > 0 : this.ledger.isOverdue(c.id)))
      .sort((a, b) => this.ledger.balanceOf(b.id) - this.ledger.balanceOf(a.id) || a.name.localeCompare(b.name));
  });

  protected lastSeen(id: string): string {
    const t = this.ledger.lastActivity(id);
    return t ? `Last activity: ${ago(t)}` : 'No activity yet';
  }

  protected save(): void {
    let phone = '';
    if (this.newPhone().trim()) {
      const normalized = normalizeMobile(this.newPhone());
      if (!normalized) return this.error.set('Use a mobile number like 09XX XXX XXXX.');
      phone = normalized;
    }
    const problem = this.ledger.addCustomer(this.newName(), phone);
    if (problem) return this.error.set(problem);
    this.ledger.showToast(`${this.newName().trim()} added`);
    this.newName.set('');
    this.newPhone.set('');
    this.error.set('');
    this.adding.set(false);
  }
}
