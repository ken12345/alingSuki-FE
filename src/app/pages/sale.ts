import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { peso } from '../core/format';
import { Ledger } from '../core/ledger';
import { Item, Method } from '../core/models';
import { PriceBreakdown, breakdownText, optionSuffix, optionsOf, plural, priceFor, setSize } from '../core/units';
import { ItemThumb } from '../shared/item-thumb';
import { PageHeader } from '../shared/page-header';

@Component({
  selector: 'app-sale',
  imports: [CurrencyPipe, FormsModule, PageHeader, ItemThumb, RouterLink],
  template: `
    <div class="page">
      <app-page-header title="New sale" back="/" />
      <div class="page-body">
        @if (ledger.items().length === 0) {
          <div class="empty-state">
            <i class="bi bi-box-seam"></i>
            <h2>No items yet</h2>
            <p>Add what you sell, with its price, and then you can record sales here in one tap.</p>
            <a class="btn btn-primary" routerLink="/items"><i class="bi bi-plus-lg"></i> Add your first item</a>
          </div>
        } @else {
        <input class="form-control" type="search" placeholder="Search items..." [(ngModel)]="query" aria-label="Search items">
        <div class="prod-grid">
          @for (item of shown(); track item.id) {
            <div class="prod" [class.on]="cart()[item.id]" [class.out]="!available(item)">
              <button type="button" class="prod-add" [disabled]="!available(item)" (click)="add(item)">
                <app-item-thumb [item]="item" />{{ item.name }}
                <span class="price">{{ priceLine(item) }}</span>
                @if (available(item)) {
                  @for (deal of item.deals ?? []; track deal.qty) { <span class="price deal">{{ deal.qty }} for {{ peso(deal.price) }}</span> }
                }
              </button>
              @if (cart()[item.id]; as pieces) {
                <div class="stepper">
                  <button type="button" (click)="remove(item)" [attr.aria-label]="'One less ' + item.name"><i class="bi bi-dash-lg"></i></button>
                  <span aria-live="polite">{{ pieces }}</span>
                  <button type="button" [disabled]="!fits(item)" (click)="add(item)" [attr.aria-label]="'One more ' + item.name"><i class="bi bi-plus-lg"></i></button>
                </div>
                @if (pricing().get(item.id); as price) {
                  <div class="prod-sum">{{ peso(price.total) }}@if (price.parts.length > 1 || (price.parts[0]?.qty ?? 1) > 1 || (price.parts[0]?.count ?? 1) > 1) { <small>{{ working(price) }}</small> }</div>
                }
              }
            </div>
          }
        </div>
        @if (shown().length === 0) {
          <div class="text-secondary text-center py-4">No items match "{{ query() }}".</div>
        }
        }
      </div>

      @if (ledger.items().length > 0) {
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
        @if (method() === 'cash' && total() > 0) {
          <div class="change-box">
            <div class="chips" aria-label="How much the customer gave">
              <button type="button" class="chip" [class.on]="given() === total()" (click)="given.set(total())">Exact</button>
              @for (bill of bills(); track bill) {
                <button type="button" class="chip" [class.on]="given() === bill" (click)="given.set(bill)">{{ peso(bill) }}</button>
              }
            </div>
            <input class="form-control" type="number" inputmode="decimal" min="0" placeholder="Customer gave (₱)" aria-label="Amount the customer gave"
              [ngModel]="given()" (ngModelChange)="given.set($event === '' || $event === null ? null : +$event)">
            @if (given() !== null) {
              @if (change() >= 0) {
                <div class="change-line ok">Change to give back <strong>{{ peso(change()) }}</strong></div>
              } @else {
                <div class="change-line short">Still short by <strong>{{ peso(-change()) }}</strong></div>
              }
            }
          </div>
        }
        @if (error()) { <div class="text-danger small fw-semibold">{{ error() }}</div> }
        <div class="d-flex justify-content-between fw-bold fs-5"><span>{{ count() }} {{ count() === 1 ? 'item' : 'items' }}</span><span>{{ total() | currency: 'PHP' : 'symbol-narrow' : '1.0-2' }}</span></div>
        <button type="button" class="btn btn-primary" [disabled]="count() === 0 || (method() === 'cash' && given() !== null && change() < 0)" (click)="confirm()">Confirm</button>
      </div>
      }
    </div>
  `,
})
export class Sale {
  protected readonly ledger = inject(Ledger);
  private readonly router = inject(Router);

  protected readonly peso = peso;

  protected query = signal('');
  /** How many pieces of each item are in the order. The price is worked out from the count each time (see priceFor). */
  protected readonly cart = signal<Record<string, number>>({});
  protected readonly method = signal<Method>('cash');
  protected customerId = signal('');
  protected readonly error = signal('');

  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.ledger.items().filter((i) => i.name.toLowerCase().includes(q));
  });

  /** For every item in the order: what its pieces cost and how that was made up. */
  protected readonly pricing = computed(() => {
    const result = new Map<string, PriceBreakdown>();
    for (const item of this.ledger.items()) {
      const pieces = this.cart()[item.id];
      if (pieces) result.set(item.id, priceFor(item, pieces));
    }
    return result;
  });

  /** What the customer handed over for a cash sale (empty until the owner enters it). */
  protected readonly given = signal<number | null>(null);
  /** Money back to the customer; negative while what was handed over is less than the total. */
  protected readonly change = computed(() => Math.round(((this.given() ?? 0) - this.total()) * 100) / 100);
  /** Common notes that cover the total, offered as one-tap choices: the next few bills up from it. */
  protected readonly bills = computed(() => [20, 50, 100, 200, 500, 1000].filter((b) => b > this.total()).slice(0, 3));

  protected readonly count = computed(() => Object.values(this.cart()).reduce((a, b) => a + b, 0));
  protected readonly total = computed(() => [...this.pricing().values()].reduce((sum, p) => sum + p.total, 0));

  /** Items that are sold in sets (a price "for every 3") go up and down a whole set at a time; others one piece at a time. */
  private step(item: Item): number {
    return setSize(item);
  }

  protected available(item: Item): boolean {
    return item.stock >= this.step(item);
  }

  protected fits(item: Item): boolean {
    return (this.cart()[item.id] ?? 0) + this.step(item) <= item.stock;
  }

  protected priceLine(item: Item): string {
    if (!this.available(item)) return item.stock === 0 ? 'Out of stock' : `Only ${item.stock} left`;
    const main = optionsOf(item)[0];
    return `${peso(main.price)}${optionSuffix(item, main)}`;
  }

  protected working(price: PriceBreakdown): string {
    return breakdownText(price.parts);
  }

  protected add(item: Item): void {
    if (!this.fits(item)) {
      const left = item.stock - (this.cart()[item.id] ?? 0);
      const step = this.step(item);
      return this.error.set(
        left <= 0
          ? `No more ${item.name} left.`
          : `Only ${left} ${plural(item.unit || 'piece', left)} of ${item.name} left${step > 1 ? `, and it is sold ${step} at a time` : ''}.`,
      );
    }
    this.error.set('');
    this.cart.update((c) => ({ ...c, [item.id]: (c[item.id] ?? 0) + this.step(item) }));
  }

  /** One piece less (or one set less). At zero it leaves the order. */
  protected remove(item: Item): void {
    const pieces = this.cart()[item.id] ?? 0;
    if (!pieces) return;
    this.error.set('');
    const left = pieces - this.step(item);
    this.cart.update((c) => {
      const { [item.id]: _, ...rest } = c;
      return left > 0 ? { ...rest, [item.id]: left } : rest;
    });
  }

  protected confirm(): void {
    const problem = this.ledger.addSale(this.cart(), this.method(), this.customerId() || undefined);
    if (problem) return this.error.set(problem);
    this.ledger.showToast(this.method() === 'cash' && this.given() !== null ? `Sale recorded. Change ${peso(this.change())}` : 'Sale recorded');
    this.router.navigate(['/']);
  }
}
