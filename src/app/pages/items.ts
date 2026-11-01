import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Ledger } from '../core/ledger';
import { photoFromFile } from '../core/image';
import { Item } from '../core/models';
import { ItemThumb } from '../shared/item-thumb';
import { PageHeader } from '../shared/page-header';

@Component({
  selector: 'app-items',
  imports: [CurrencyPipe, FormsModule, PageHeader, ItemThumb, RouterLink],
  template: `
    <app-page-header title="Items" back="/more">
      <a class="icon-btn" routerLink="/shopping" aria-label="Shopping list"><i class="bi bi-cart3"></i></a>
      <button type="button" class="icon-btn primary" (click)="openNew()" aria-label="Add item"><i class="bi bi-plus-lg"></i></button>
    </app-page-header>
    <div class="page-body">
      @if (ledger.lowStock().length) {
        <div class="alert alert-warning py-2 mb-0 small d-flex align-items-center gap-2">
          <div class="flex-grow-1 fw-semibold"><i class="bi bi-exclamation-triangle"></i> {{ ledger.lowStock().length }} {{ ledger.lowStock().length === 1 ? 'item is' : 'items are' }} running low or out.</div>
          <button type="button" class="btn btn-sm btn-warning flex-none" (click)="listLow()"><i class="bi bi-cart3"></i> Add to list</button>
        </div>
      }
      @if (ledger.items().length === 0) {
        <div class="empty-state">
          <i class="bi bi-box-seam"></i>
          <h2>No items yet</h2>
          <p>Add the things you sell, with their price, so you can ring up a sale in one tap.</p>
          <button type="button" class="btn btn-primary" (click)="openNew()"><i class="bi bi-plus-lg"></i> Add your first item</button>
        </div>
      }
      <div class="d-flex flex-column gap-2">
        @for (i of ledger.items(); track i.id) {
          <button type="button" class="row-card text-start w-100" (click)="openEdit(i)">
            <div class="avatar"><app-item-thumb [item]="i" /></div>
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
        <div class="d-flex gap-2 align-items-start">
          <label class="photo-pick" [class.has]="photo()" [attr.aria-label]="photo() ? 'Change photo' : 'Add a photo'">
            @if (photo()) { <img [src]="photo()" alt="Item photo"> } @else { <i class="bi bi-camera"></i><span>Photo</span> }
            <input type="file" accept="image/*" class="d-none" (change)="pickPhoto($event)">
          </label>
          <div class="flex-grow-1 d-flex flex-column gap-2">
            <input class="form-control" name="name" placeholder="Item name" [(ngModel)]="name" autocomplete="off" required aria-label="Item name">
            @if (photo()) {
              <button type="button" class="btn btn-sm btn-outline-secondary align-self-start" (click)="photo.set('')"><i class="bi bi-x-lg"></i> Remove photo</button>
            } @else {
              <input class="form-control" style="max-width: 150px" name="emoji" placeholder="or an emoji 🛍️" maxlength="2" [(ngModel)]="emoji" aria-label="Emoji">
            }
          </div>
        </div>
        @if (photoError()) { <div class="text-danger small fw-semibold" role="alert">{{ photoError() }}</div> }
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
        @if (!isNew()) {
          <button class="btn btn-outline-danger" type="button" (click)="confirmDelete.set(true)"><i class="bi bi-trash"></i> Delete this item</button>
        }
        <button class="btn btn-link text-secondary" type="button" (click)="close()">Cancel</button>
      </form>
      @if (confirmDelete()) {
        <div class="sheet-dim" style="z-index: 22" (click)="confirmDelete.set(false)"></div>
        <div class="sheet d-flex flex-column gap-2" style="z-index: 23">
          <h2 class="h5 fw-bold mb-0">Delete {{ original()?.name }}?</h2>
          <p class="small text-secondary mb-1">It disappears from the sale screen and the item list. Past sales stay in your records exactly as they were.</p>
          <button type="button" class="btn btn-danger" (click)="remove()">Yes, delete it</button>
          <button type="button" class="btn btn-link text-secondary" (click)="confirmDelete.set(false)">Keep it</button>
        </div>
      }
    }
  `,
})
export class Items {
  protected readonly ledger = inject(Ledger);
  private readonly router = inject(Router);
  protected readonly quick = [10, 20, 50, 100];

  /** null = closed, 'new' = adding, otherwise the id of the item being edited. */
  protected readonly editing = signal<string | null>(null);
  protected readonly isNew = computed(() => this.editing() === 'new');
  protected readonly original = computed(() => this.ledger.items().find((i) => i.id === this.editing()));

  protected emoji = signal('');
  /** The item's photo as a small JPEG data URL, or '' for none. */
  protected photo = signal('');
  protected readonly photoError = signal('');
  protected name = signal('');
  protected price = signal<number | null>(null);
  protected cost = signal<number | null>(null);
  protected stock = signal<number | null>(null);
  protected readonly error = signal('');
  protected readonly confirmDelete = signal(false);

  protected readonly addedStock = computed(() => Math.max(0, (this.stock() ?? 0) - (this.original()?.stock ?? 0)));

  protected openNew(): void {
    this.fill({ emoji: '', photo: '', name: '', price: null, cost: null, stock: null });
    this.editing.set('new');
  }

  protected openEdit(item: Item): void {
    this.fill({ ...item, photo: item.photo ?? '' });
    this.editing.set(item.id);
  }

  /** Puts everything running low on the shopping list, then opens it. */
  protected listLow(): void {
    const added = this.ledger.addLowStockToList();
    if (!added) this.ledger.showToast('They are already on your shopping list');
    this.router.navigate(['/shopping']);
  }

  protected addStock(n: number): void {
    this.stock.set((this.stock() ?? 0) + n);
  }

  protected close(): void {
    this.editing.set(null);
    this.confirmDelete.set(false);
    this.error.set('');
  }

  protected remove(): void {
    const item = this.original();
    if (!item) return;
    this.ledger.removeItem(item.id);
    this.ledger.showToast(`${item.name} deleted`);
    this.close();
  }

  protected save(): void {
    const id = this.editing();
    const problem =
      id === 'new'
        ? this.ledger.addItem(this.emoji(), this.name(), this.price() ?? 0, this.cost() ?? 0, this.stock() ?? 0, this.photo() || undefined)
        : this.ledger.updateItem({
            id: id!, emoji: this.emoji() || '🛍️', photo: this.photo() || undefined, name: this.name(), price: this.price() ?? 0, cost: this.cost() ?? 0, stock: this.stock() ?? 0,
          });
    if (problem) return this.error.set(problem);
    this.ledger.showToast(id === 'new' ? `${this.name().trim()} added` : 'Item updated');
    this.close();
  }

  protected async pickPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.photoError.set('');
    try {
      this.photo.set(await photoFromFile(file));
    } catch (error) {
      this.photoError.set(error instanceof Error ? error.message : 'That photo could not be used.');
    }
  }

  private fill(v: { emoji: string; photo: string; name: string; price: number | null; cost: number | null; stock: number | null }): void {
    this.photoError.set('');
    this.photo.set(v.photo);
    this.emoji.set(v.emoji);
    this.name.set(v.name);
    this.price.set(v.price);
    this.cost.set(v.cost);
    this.stock.set(v.stock);
    this.error.set('');
  }
}
