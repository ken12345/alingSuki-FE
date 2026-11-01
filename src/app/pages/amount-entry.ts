import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { initials } from '../core/format';
import { Ledger } from '../core/ledger';
import { Method } from '../core/models';
import { Numpad } from '../shared/numpad';
import { PageHeader } from '../shared/page-header';

/** Shared screen for taking a payment or adding credit for one customer. */
@Component({
  selector: 'app-amount-entry',
  imports: [CurrencyPipe, FormsModule, Numpad, PageHeader],
  template: `
    <div class="page">
      <app-page-header [title]="mode() === 'payment' ? 'Take payment' : 'Add credit'" [back]="['/customers', id()]" />
      @if (customer(); as c) {
        <div class="page-body">
          <div class="card text-center"><div class="card-body">
            <div class="d-flex align-items-center justify-content-center gap-2">
              <div class="avatar">{{ initials(c.name) }}</div><b>{{ c.name }}</b>
            </div>
            <div class="label mt-3">{{ mode() === 'payment' ? 'Paying' : 'Credit amount' }}</div>
            <div class="amount-lg">{{ amountNumber() | currency: 'PHP' : 'symbol-narrow' : '1.0-0' }}</div>
            <div class="small text-secondary">
              {{ mode() === 'payment' ? 'Remaining' : 'New balance' }}:
              {{ after() | currency: 'PHP' : 'symbol-narrow' : '1.0-0' }}
            </div>
          </div></div>

          @if (mode() === 'payment') {
            <div class="chips">
              @for (q of quick(); track q) {
                <button type="button" class="chip" [class.on]="amount() === '' + q" (click)="amount.set('' + q)">
                  {{ q === balance() ? 'Full ' : '' }}{{ q | currency: 'PHP' : 'symbol-narrow' : '1.0-0' }}
                </button>
              }
            </div>
            <div class="chips">
              <button type="button" class="chip" [class.on]="method() === 'cash'" (click)="method.set('cash')">Cash</button>
              <button type="button" class="chip" [class.on]="method() === 'gcash'" (click)="method.set('gcash')">GCash</button>
            </div>
          } @else {
            <input class="form-control" placeholder="What did they take? (optional)" [(ngModel)]="note" aria-label="Note">
          }

          <app-numpad [(value)]="amount" />
          @if (error()) { <div class="text-danger small fw-semibold">{{ error() }}</div> }
          <button type="button" class="btn w-100" [class.btn-success]="mode() === 'payment'" [class.btn-primary]="mode() === 'charge'" (click)="save()">
            {{ mode() === 'payment' ? 'Record payment' : 'Add to balance' }}
          </button>
        </div>
      } @else {
        <div class="page-body text-secondary">Customer not found.</div>
      }
    </div>
  `,
})
export class AmountEntry {
  private readonly ledger = inject(Ledger);
  private readonly router = inject(Router);
  protected readonly initials = initials;

  /** Bound from the :id route parameter and the route's data. */
  readonly id = input.required<string>();
  readonly mode = input<'payment' | 'charge'>('payment');

  protected readonly amount = signal('');
  protected readonly method = signal<Method>('cash');
  protected note = signal('');
  protected readonly error = signal('');

  protected readonly customer = computed(() => this.ledger.customer(this.id()));
  protected readonly balance = computed(() => this.ledger.balanceOf(this.id()));
  protected readonly amountNumber = computed(() => Number(this.amount() || 0));
  protected readonly after = computed(() =>
    this.mode() === 'payment' ? this.balance() - this.amountNumber() : this.balance() + this.amountNumber(),
  );
  protected readonly quick = computed(() => [...new Set([200, 500, this.balance()].filter((n) => n > 0 && n <= this.balance()))]);

  protected save(): void {
    const id = this.id();
    const problem =
      this.mode() === 'payment'
        ? this.ledger.addPayment(id, this.amountNumber(), this.method())
        : this.ledger.addCharge(id, this.amountNumber(), this.note().trim());
    if (problem) return this.error.set(problem);
    this.ledger.showToast(this.mode() === 'payment' ? 'Payment recorded' : 'Credit added');
    this.router.navigate(['/customers', id]);
  }
}
