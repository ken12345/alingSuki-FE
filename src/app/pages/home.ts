import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DAY, initials, startOfDay } from '../core/format';
import { Ledger } from '../core/ledger';

@Component({
  selector: 'app-home',
  imports: [CurrencyPipe, RouterLink],
  template: `
    <div class="page-body">
      <div class="d-flex align-items-center gap-3">
        <img src="icons/icon-96.png" width="46" height="46" class="rounded-circle" alt="">
        <div>
          <div class="fw-bold">Hello, {{ ledger.ownerName() }}!</div>
          <div class="small text-secondary">{{ ledger.shopName() }}</div>
        </div>
      </div>

      @if (!ledger.online()) {
        <div class="alert alert-warning py-2 mb-0 small"><i class="bi bi-wifi-off"></i> You're offline. Everything is still saved.</div>
      }

      <div class="card"><div class="card-body">
        <div class="label">Sales today</div>
        <div class="amount-lg">{{ today().sales | currency: 'PHP' : 'symbol-narrow' : '1.0-0' }}</div>
        <span class="badge rounded-pill mt-1" [class]="delta() >= 0 ? 'text-bg-success' : 'text-bg-danger'">
          {{ delta() >= 0 ? '▲' : '▼' }} {{ absDelta() | currency: 'PHP' : 'symbol-narrow' : '1.0-0' }} vs yesterday
        </span>
      </div></div>

      <div class="row g-2">
        <div class="col-6"><div class="card h-100"><div class="card-body">
          <div class="label">Credit owed</div>
          <div class="fs-4 fw-bold text-danger">{{ ledger.totalOwed() | currency: 'PHP' : 'symbol-narrow' : '1.0-0' }}</div>
        </div></div></div>
        <div class="col-6"><div class="card h-100"><div class="card-body">
          <div class="label">Profit today</div>
          <div class="fs-4 fw-bold text-success">{{ today().profit | currency: 'PHP' : 'symbol-narrow' : '1.0-0' }}</div>
        </div></div></div>
      </div>

      <div class="row g-2">
        <div class="col-6"><a class="btn btn-primary w-100" routerLink="/sale"><i class="bi bi-plus-lg"></i> New sale</a></div>
        <div class="col-6"><a class="btn btn-outline-primary w-100" routerLink="/customers"><i class="bi bi-person-plus"></i> Add credit</a></div>
      </div>

      <div class="d-flex justify-content-between align-items-center mt-1">
        <h2 class="h6 fw-bold mb-0">To collect</h2>
        <a class="small fw-bold text-decoration-none" routerLink="/customers">All <i class="bi bi-chevron-right"></i></a>
      </div>
      <div class="d-flex flex-column gap-2">
        @for (c of topDue(); track c.id) {
          <a class="row-card" [routerLink]="['/customers', c.id]">
            <div class="avatar" [class.late]="ledger.isOverdue(c.id)">{{ initials(c.name) }}</div>
            <div class="grow">
              <div class="fw-bold">{{ c.name }}</div>
              <div class="sub">{{ ledger.isOverdue(c.id) ? ledger.overdueDays(c.id) + ' days overdue' : 'Owes money' }}</div>
            </div>
            <div class="fw-bold text-danger">{{ ledger.balanceOf(c.id) | currency: 'PHP' : 'symbol-narrow' : '1.0-0' }}</div>
          </a>
        } @empty {
          <div class="text-secondary small">Nobody owes you right now.</div>
        }
      </div>
    </div>
  `,
})
export class Home {
  protected readonly ledger = inject(Ledger);
  protected readonly initials = initials;

  protected readonly today = computed(() => this.ledger.totals(startOfDay()));
  private readonly yesterday = computed(() => this.ledger.totals(startOfDay() - DAY, startOfDay()));
  protected readonly delta = computed(() => this.today().sales - this.yesterday().sales);
  protected readonly absDelta = computed(() => Math.abs(this.delta()));
  protected readonly topDue = computed(() => this.ledger.due().slice(0, 3));
}
