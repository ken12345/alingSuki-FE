import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { initials } from '../core/format';
import { Ledger } from '../core/ledger';
import { PageHeader } from '../shared/page-header';

@Component({
  selector: 'app-customer-detail',
  imports: [CurrencyPipe, DatePipe, RouterLink, PageHeader],
  template: `
    @if (customer(); as c) {
      <app-page-header [title]="c.name" back="/customers" />
      <div class="page-body">
        <div class="card text-center"><div class="card-body">
          <div class="avatar mx-auto mb-2" [class.late]="overdue()">{{ initials(c.name) }}</div>
          <div class="label">Balance owed</div>
          <div class="amount-lg" [class.text-danger]="balance() > 0" [class.text-success]="balance() <= 0">
            {{ balance() | currency: 'PHP' : 'symbol-narrow' : '1.0-0' }}
          </div>
          @if (overdue()) { <span class="badge text-bg-danger">{{ days() }} days overdue</span> }
          <div class="small text-secondary mt-2">
            @if (c.phone) { {{ c.phone }} · }Limit {{ c.creditLimit | currency: 'PHP' : 'symbol-narrow' : '1.0-0' }}
          </div>
          <div class="progress mt-2" role="progressbar" aria-label="Credit used" style="height: 8px">
            <div class="progress-bar" [class.bg-danger]="used() > 80" [style.width.%]="used()"></div>
          </div>
        </div></div>

        <div class="row g-2">
          <div class="col-6"><a class="btn btn-success w-100" [routerLink]="['/customers', c.id, 'payment']">Take payment</a></div>
          <div class="col-6"><a class="btn btn-outline-primary w-100" [routerLink]="['/customers', c.id, 'charge']">+ Add credit</a></div>
        </div>
        <button type="button" class="btn btn-yellow" [disabled]="balance() <= 0" (click)="reminder.set(true)">
          <i class="bi bi-chat-dots"></i> Send reminder
        </button>

        <h2 class="h6 fw-bold mt-2 mb-0">History</h2>
        <div class="d-flex flex-column gap-2">
          @for (e of history(); track e.id) {
            <div class="row-card">
              <div class="grow">
                <div class="fw-bold">{{ title(e.type, e.method) }}</div>
                <div class="sub">{{ e.note || lineSummary(e) }}{{ e.note || e.lines.length ? ' · ' : '' }}{{ e.date | date: 'MMM d, h:mm a' }}</div>
              </div>
              <div class="fw-bold" [class.text-danger]="e.type === 'charge'" [class.text-success]="e.type === 'payment'">
                {{ e.type === 'payment' ? '−' : '+' }}{{ e.amount | currency: 'PHP' : 'symbol-narrow' : '1.0-0' }}
              </div>
            </div>
          } @empty {
            <div class="text-secondary small">Nothing recorded yet.</div>
          }
        </div>
      </div>

      @if (reminder()) {
        <div class="sheet-dim" (click)="reminder.set(false)"></div>
        <div class="sheet d-flex flex-column gap-2">
          <h2 class="h5 fw-bold mb-0">Send reminder</h2>
          <div class="card bg-body"><div class="card-body small">{{ message() }}</div></div>
          <div class="row g-2">
            <div class="col-6"><a class="btn btn-primary w-100" [href]="smsLink()">SMS</a></div>
            <div class="col-6"><a class="btn btn-viber w-100" [href]="viberLink()">Viber</a></div>
          </div>
          <button type="button" class="btn btn-outline-primary" (click)="copy()">Copy message</button>
          <p class="small text-secondary mb-0">You choose the app and tap send. Aling Suki never messages anyone for you.</p>
        </div>
      }
    } @else {
      <app-page-header title="Customer" back="/customers" />
      <div class="page-body text-secondary">Customer not found.</div>
    }
  `,
})
export class CustomerDetail {
  protected readonly ledger = inject(Ledger);
  protected readonly initials = initials;

  /** Bound from the :id route parameter. */
  readonly id = input.required<string>();
  protected readonly reminder = signal(false);

  protected readonly customer = computed(() => this.ledger.customer(this.id()));
  protected readonly balance = computed(() => this.ledger.balanceOf(this.id()));
  protected readonly days = computed(() => this.ledger.overdueDays(this.id()));
  protected readonly overdue = computed(() => this.ledger.isOverdue(this.id()));
  protected readonly history = computed(() => this.ledger.historyOf(this.id()));
  protected readonly used = computed(() => {
    const limit = this.customer()?.creditLimit ?? 1;
    return Math.min(100, Math.round((Math.max(0, this.balance()) / limit) * 100));
  });
  protected readonly message = computed(() => this.ledger.reminderText(this.id()));
  protected readonly smsLink = computed(() => `sms:${this.customer()?.phone ?? ''}?body=${encodeURIComponent(this.message())}`);
  protected readonly viberLink = computed(() => `viber://forward?text=${encodeURIComponent(this.message())}`);

  protected title(type: string, method: string): string {
    return type === 'payment' ? `Payment (${method})` : type === 'charge' ? 'Credit' : 'Sale';
  }

  protected lineSummary(e: { lines: { name: string; qty: number }[] }): string {
    return e.lines.map((l) => `${l.name} ×${l.qty}`).join(', ');
  }

  protected async copy(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.message());
      this.ledger.showToast('Message copied');
    } catch {
      this.ledger.showToast('Could not copy. Select the text instead.');
    }
    this.reminder.set(false);
  }
}
