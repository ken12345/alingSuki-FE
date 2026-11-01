import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Ledger } from '../core/ledger';
import { Item } from '../core/models';
import { PageHeader } from '../shared/page-header';

@Component({
  selector: 'app-items',
  imports: [CurrencyPipe, FormsModule, PageHeader],
  template: `
    <app-page-header title="Items" back="/more">
      <button type="button" class="icon-btn primary" (click)="openNew()" aria-label="Add item"><i class="bi bi-plus-lg"></i></button>
    </app-page-header>
    <div class="page-body">
      @if (ledger.lowStock().length) {
        <div class="alert alert-warning py-2 mb-0 small fw-semibold"><i class="bi bi-exclamation-triangle"></i> {{ ledger.lowStock().length }} {{ ledger.lowStock().length === 1 ? 'item is' : 'items are' }} running low or out. Tap an item to add stock.</div>
      }
      <div class="d-flex flex-column gap-2">
        @for (i of ledger.items(); track i.id) {
          <button type="button" class="row-card text-start w-100" (click)="openEdit(i)">
            <div class="avatar">{{ i.emoji }}</div>
            <div class="grow">
              <div class="fw-bold">{{ i.name }}</div>
              <div class="sub">Cost {{ i.cost | currency: 'PHP' : 'symbol-narrow' : '1.0-2' }} · Profit {{ i.price - i.cost | currency: 'PHP' : 'symbol-narrow' : '1.0-2' }}</div>
            </div>
            <div class="text-end">
              <div class="fw-bold">{{ i.price | currency: 'PHP' : 'symbol-narrow' : '1.0-2' }}</div>
              <span class="badge" [class]="i.stock <= 5 ? 'text-bg-danger' : 'text-bg-success'">{{ i.stock === 0 ? 'Out of stock' : i.stock + ' left' }}</span>
            </div>
          </button>
        }
      </div>
    </div>

    @if (editing()) {
      <div class="sheet-dim" (click)="close()"></div>
      <form class="sheet d-flex flex-column gap-2" (ngSubmit)="save()">
        <h2 class="h5 fw-bold mb-1">{{ isNew() ? 'New item' : 'Edit ' + original()?.name }}</h2>
        <div class="d-flex gap-2">
          <input class="form-control text-center" style="max-width: 72px" name="emoji" placeholder="🛍️" maxlength="2" [(ngModel)]="emoji" aria-label="Emoji">
          <input class="form-control" name="name" placeholder="Item name" [(ngModel)]="name" autocomplete="off" required aria-label="Item name">
        </div>
        <div class="row g-2">
          <div class="col-6"><label class="label" for="price">Price</label><input id="price" class="form-control" name="price" type="number" inputmode="decimal" min="0" [(ngModel)]="price"></div>
          <div class="col-6"><label class="label" for="cost">Cost</label><input id="cost" class="form-control" name="cost" type="number" inputmode="decimal" min="0" [(ngModel)]="cost"></div>
        </div>
        <div>
          <label class="label" for="stock">{{ isNew() ? 'Stock' : 'Stock on the shelf' }}</label>
          <input id="stock" class="form-control" name="stock" type="number" inputmode="numeric" min="0" [(ngModel)]="stock">
          <div class="chips mt-2">
            @for (n of quick; track n) { <button type="button" class="chip" (click)="addStock(n)">+{{ n }}</button> }
          </div>
          @if (!isNew() && addedStock() > 0) { <div class="small text-success fw-semibold mt-1">Adding {{ addedStock() }} to {{ original()?.stock }}.</div> }
        </div>
        @if (error()) { <div class="text-danger small fw-semibold">{{ error() }}</div> }
        <button class="btn btn-primary" type="submit">{{ isNew() ? 'Save item' : 'Save changes' }}</button>
        <button class="btn btn-link text-secondary" type="button" (click)="close()">Cancel</button>
      </form>
    }
  `,
})
export class Items {
  protected readonly ledger = inject(Ledger);
  protected readonly quick = [10, 20, 50, 100];

  /** null = closed, 'new' = adding, otherwise the id of the item being edited. */
  protected readonly editing = signal<string | null>(null);
  protected readonly isNew = computed(() => this.editing() === 'new');
  protected readonly original = computed(() => this.ledger.items().find((i) => i.id === this.editing()));

  protected emoji = signal('');
  protected name = signal('');
  protected price = signal<number | null>(null);
  protected cost = signal<number | null>(null);
  protected stock = signal<number | null>(null);
  protected readonly error = signal('');

  protected readonly addedStock = computed(() => Math.max(0, (this.stock() ?? 0) - (this.original()?.stock ?? 0)));

  protected openNew(): void {
    this.fill({ emoji: '', name: '', price: null, cost: null, stock: null });
    this.editing.set('new');
  }

  protected openEdit(item: Item): void {
    this.fill(item);
    this.editing.set(item.id);
  }

  protected addStock(n: number): void {
    this.stock.set((this.stock() ?? 0) + n);
  }

  protected close(): void {
    this.editing.set(null);
    this.error.set('');
  }

  protected save(): void {
    const id = this.editing();
    const problem =
      id === 'new'
        ? this.ledger.addItem(this.emoji(), this.name(), this.price() ?? 0, this.cost() ?? 0, this.stock() ?? 0)
        : this.ledger.updateItem({
            id: id!, emoji: this.emoji() || '🛍️', name: this.name(), price: this.price() ?? 0, cost: this.cost() ?? 0, stock: this.stock() ?? 0,
          });
    if (problem) return this.error.set(problem);
    this.ledger.showToast(id === 'new' ? `${this.name().trim()} added` : 'Item updated');
    this.close();
  }

  private fill(v: { emoji: string; name: string; price: number | null; cost: number | null; stock: number | null }): void {
    this.emoji.set(v.emoji);
    this.name.set(v.name);
    this.price.set(v.price);
    this.cost.set(v.cost);
    this.stock.set(v.stock);
    this.error.set('');
  }
}
