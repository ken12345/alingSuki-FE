import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Ledger } from '../core/ledger';
import { Item, Method } from '../core/models';
import { PageHeader } from '../shared/page-header';

@Component({
  selector: 'app-sale',
  imports: [CurrencyPipe, FormsModule, PageHeader],
  template: `
    <div class="page">
      <app-page-header title="New sale" back="/" />
      <div class="page-body">
        <input class="form-control" type="search" placeholder="Search items..." [(ngModel)]="query" aria-label="Search items">
        <div class="prod-grid">
          @for (item of shown(); track item.id) {
            <div class="prod" [class.on]="cart()[item.id]" [class.out]="item.stock === 0">
              <button type="button" class="prod-add" [disabled]="item.stock === 0" (click)="add(item)">
                <span class="emoji">{{ item.emoji }}</span>{{ item.name }}
                <span class="price">{{ item.stock === 0 ? 'Out of stock' : (item.price | currency: 'PHP' : 'symbol-narrow' : '1.0-2') }}</span>
              </button>
              @if (cart()[item.id]; as qty) {
                <div class="stepper">
                  <button type="button" (click)="remove(item)" [attr.aria-label]="'One less ' + item.name"><i class="bi bi-dash-lg"></i></button>
                  <span aria-live="polite">{{ qty }}</span>
                  <button type="button" [disabled]="qty >= item.stock" (click)="add(item)" [attr.aria-label]="'One more ' + item.name"><i class="bi bi-plus-lg"></i></button>
                </div>
              }
            </div>
          }
        </div>
      </div>

      <div class="bar-bottom">
        <div class="chips">
          <button type="button" class="chip" [class.on]="method() === 'cash'" (click)="method.set('cash')">Cash</button>
          <button type="button" class="chip" [class.on]="method() === 'credit'" (click)="method.set('credit')">Credit</button>
          <button type="button" class="chip" [class.on]="method() === 'gcash'" (click)="method.set('gcash')">GCash</button>
        </div>
        @if (method() === 'credit') {
          <select class="form-select" [(ngModel)]="customerId" aria-label="Customer taking credit">
            <option value="">Who is taking this on credit?</option>
            @for (c of ledger.customers(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }
          </select>
        }
        @if (error()) { <div class="text-danger small fw-semibold">{{ error() }}</div> }
        <div class="d-flex justify-content-between fw-bold fs-5"><span>{{ count() }} {{ count() === 1 ? 'item' : 'items' }}</span><span>{{ total() | currency: 'PHP' : 'symbol-narrow' : '1.0-2' }}</span></div>
        <button type="button" class="btn btn-primary" [disabled]="count() === 0" (click)="confirm()">Confirm</button>
      </div>
    </div>
  `,
})
export class Sale {
  protected readonly ledger = inject(Ledger);
  private readonly router = inject(Router);

  protected query = signal('');
  protected readonly cart = signal<Record<string, number>>({});
  protected readonly method = signal<Method>('cash');
  protected customerId = signal('');
  protected readonly error = signal('');

  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.ledger.items().filter((i) => i.name.toLowerCase().includes(q));
  });
  protected readonly count = computed(() => Object.values(this.cart()).reduce((a, b) => a + b, 0));
  protected readonly total = computed(() =>
    this.ledger.items().reduce((sum, i) => sum + i.price * (this.cart()[i.id] ?? 0), 0),
  );

  protected add(item: Item): void {
    if ((this.cart()[item.id] ?? 0) >= item.stock) return this.error.set(`Only ${item.stock} ${item.name} left.`);
    this.error.set('');
    this.cart.update((c) => ({ ...c, [item.id]: (c[item.id] ?? 0) + 1 }));
  }

  /** One less of this item. At zero it leaves the order. */
  protected remove(item: Item): void {
    const qty = this.cart()[item.id] ?? 0;
    if (!qty) return;
    this.error.set('');
    this.cart.update((c) => {
      const { [item.id]: _, ...rest } = c;
      return qty > 1 ? { ...rest, [item.id]: qty - 1 } : rest;
    });
  }

  protected confirm(): void {
    const problem = this.ledger.addSale(this.cart(), this.method(), this.customerId() || undefined);
    if (problem) return this.error.set(problem);
    this.ledger.showToast('Sale recorded');
    this.router.navigate(['/']);
  }
}
