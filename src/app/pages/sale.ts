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
            <button type="button" class="prod" [class.out]="item.stock === 0" [disabled]="item.stock === 0" (click)="add(item)" (contextmenu)="remove(item); $event.preventDefault()">
              @if (cart()[item.id]) { <span class="qty">{{ cart()[item.id] }}</span> }
              <span class="emoji">{{ item.emoji }}</span>{{ item.name }}
              <span class="price">{{ item.stock === 0 ? 'Out of stock' : (item.price | currency: 'PHP' : 'symbol-narrow' : '1.0-2') }}</span>
            </button>
          }
        </div>
        @if (count() > 0) {
          <button type="button" class="btn btn-link text-secondary p-0 align-self-start" (click)="undo()"><i class="bi bi-arrow-counterclockwise"></i> Undo last tap</button>
        }
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
  private readonly taps: string[] = [];

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
    this.taps.push(item.id);
    this.cart.update((c) => ({ ...c, [item.id]: (c[item.id] ?? 0) + 1 }));
  }

  protected remove(item: Item): void {
    if (!this.cart()[item.id]) return;
    this.taps.splice(this.taps.lastIndexOf(item.id), 1);
    this.cart.update((c) => ({ ...c, [item.id]: c[item.id] - 1 }));
  }

  protected undo(): void {
    const last = this.taps.pop();
    if (last) this.cart.update((c) => ({ ...c, [last]: c[last] - 1 }));
  }

  protected confirm(): void {
    const problem = this.ledger.addSale(this.cart(), this.method(), this.customerId() || undefined);
    if (problem) return this.error.set(problem);
    this.ledger.showToast('Sale recorded');
    this.router.navigate(['/']);
  }
}
