import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Ledger } from '../core/ledger';
import { photoFromFile } from '../core/image';
import { Item, ItemDetails } from '../core/models';
import { peso } from '../core/format';
import { costFromPack, hasBuyUnit, plural, stockText } from '../core/units';
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
              @if (packText(i)) { <div class="sub">{{ packText(i) }}</div> }
            </div>
            <div class="text-end">
              <div class="fw-bold">{{ i.price | currency: 'PHP' : 'symbol-narrow' : '1.0-2' }}{{ i.unit ? ' / ' + i.unit : '' }}</div>
              <span class="badge" [class]="i.stock <= 5 ? 'text-bg-danger' : 'text-bg-success'">{{ stockText(i) }}</span>
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
          <div class="col-6"><label class="label" for="price">Selling price</label><input id="price" class="form-control" name="price" type="number" inputmode="decimal" min="0" [(ngModel)]="price"></div>
          <div class="col-6"><label class="label" for="unit">Sold per</label><input id="unit" class="form-control" name="unit" placeholder="piece" maxlength="20" autocomplete="off" [(ngModel)]="unit"></div>
        </div>
        <label class="form-check d-flex align-items-center gap-2 mb-0 fw-semibold">
          <input class="form-check-input mt-0" type="checkbox" name="buyOn" [(ngModel)]="buyOn">
          <span>I buy it in bigger packs (box, bottle, gallon...)</span>
        </label>
        @if (buyOn()) {
          <div class="card bg-body"><div class="card-body d-flex flex-column gap-2">
            <div class="row g-2">
              <div class="col-6"><label class="label" for="buyUnit">Bought by the</label><input id="buyUnit" class="form-control" name="buyUnit" placeholder="pack" maxlength="20" autocomplete="off" [(ngModel)]="buyUnit"></div>
              <div class="col-6"><label class="label" for="perBuy">{{ sellWord(2) }} in one {{ buyWord() }}</label><input id="perBuy" class="form-control" name="perBuy" type="number" inputmode="numeric" min="1" step="1" [(ngModel)]="perBuy"></div>
            </div>
            <div><label class="label" for="buyCost">Price of one {{ buyWord() }}</label><input id="buyCost" class="form-control" name="buyCost" type="number" inputmode="decimal" min="0" [(ngModel)]="buyCost"></div>
            @if (costHint()) { <div class="small fw-semibold" [class.text-success]="!costWarning()" [class.text-danger]="costWarning()">{{ costHint() }}</div> }
          </div></div>
        } @else {
          <div><label class="label" for="cost">Cost{{ unit().trim() ? ' per ' + unit().trim() : '' }}</label><input id="cost" class="form-control" name="cost" type="number" inputmode="decimal" min="0" [(ngModel)]="cost"></div>
        }
        <div>
          <label class="label" for="stock">{{ isNew() ? 'Stock' : 'Stock on the shelf' }} (in {{ sellWord(2) }})</label>
          <input id="stock" class="form-control" name="stock" type="number" inputmode="numeric" min="0" [(ngModel)]="stock">
          <div class="chips mt-2">
            @for (chip of quick(); track chip.label) { <button type="button" class="chip" (click)="addStock(chip.amount)">{{ chip.label }}</button> }
          </div>
          @if (!isNew() && addedStock() > 0) { <div class="small text-success fw-semibold mt-1">Adding {{ addedStock() }} {{ sellWord(addedStock()) }} to the {{ original()?.stock }} you have.</div> }
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
  /** What the shop sells it by: stick, cup, sachet... */
  protected unit = signal('');
  /** Items bought in bigger packs: the pack's name, how many selling units are inside, and what one pack costs. */
  protected buyOn = signal(false);
  protected buyUnit = signal('');
  protected perBuy = signal<number | null>(null);
  protected buyCost = signal<number | null>(null);
  protected readonly error = signal('');
  protected readonly confirmDelete = signal(false);

  protected readonly stockText = stockText;
  protected readonly sellName = computed(() => this.unit().trim() || 'piece');
  protected readonly buyName = computed(() => this.buyUnit().trim() || 'pack');
  /** How many selling units are in one pack, or 0 when it is not filled in properly. */
  protected readonly packSize = computed(() => {
    const n = Math.round(this.perBuy() ?? 0);
    return this.buyOn() && n >= 1 ? n : 0;
  });
  /** What one selling unit costs, from the pack price. */
  protected readonly derivedCost = computed(() => {
    const pack = this.buyCost();
    return this.packSize() > 0 && pack !== null && pack >= 0 ? costFromPack(pack, this.packSize()) : null;
  });
  /** "Each stick costs you ₱8, so you earn ₱2 on each." Shown as soon as the pack price and pack size are filled in. */
  protected readonly costHint = computed(() => {
    const cost = this.derivedCost();
    if (cost === null) return '';
    const base = `Each ${plural(this.sellName(), 1)} costs you ${peso(cost)}`;
    const price = this.price();
    if (!price) return `${base}.`;
    return price >= cost ? `${base}, so you earn ${peso(price - cost)} on each.` : `${base}, which is more than you sell it for.`;
  });
  protected readonly costWarning = computed(() => this.derivedCost() !== null && (this.price() ?? 0) > 0 && (this.price() ?? 0) < (this.derivedCost() ?? 0));

  /** Quick restock buttons: whole packs when the item is bought in packs, otherwise plain amounts. */
  protected readonly quick = computed(() =>
    this.packSize() > 0
      ? [1, 5, 10].map((n) => ({ label: `+${n} ${plural(this.buyName(), n)}`, amount: n * this.packSize() }))
      : [10, 20, 50, 100].map((n) => ({ label: `+${n}`, amount: n })),
  );

  protected readonly addedStock = computed(() => Math.max(0, (this.stock() ?? 0) - (this.original()?.stock ?? 0)));

  protected openNew(): void {
    this.fill({ emoji: '', photo: '', name: '', price: null, cost: null, stock: null, unit: '', buyUnit: '', perBuyUnit: null, buyCost: null });
    this.editing.set('new');
  }

  protected openEdit(item: Item): void {
    this.fill({ ...item, photo: item.photo ?? '', unit: item.unit ?? '', buyUnit: item.buyUnit ?? '', perBuyUnit: item.perBuyUnit ?? null, buyCost: item.buyCost ?? null });
    this.editing.set(item.id);
  }

  /** Puts everything running low on the shopping list, then opens it. */
  protected listLow(): void {
    const added = this.ledger.addLowStockToList();
    if (!added) this.ledger.showToast('They are already on your shopping list');
    this.router.navigate(['/shopping']);
  }

  protected sellWord(n: number): string {
    return plural(this.sellName(), n);
  }

  protected buyWord(): string {
    return this.buyName();
  }

  /** "1 pack = 20 sticks" for items bought in packs. */
  protected packText(item: Item): string {
    return hasBuyUnit(item) ? `1 ${item.buyUnit} = ${item.perBuyUnit} ${plural(item.unit || 'piece', item.perBuyUnit as number)}` : '';
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
    const details: ItemDetails = {
      emoji: this.emoji() || '🛍️',
      photo: this.photo() || undefined,
      name: this.name(),
      price: this.price() ?? 0,
      // With a pack price the cost of one unit is worked out for you; otherwise it is what you typed.
      cost: this.derivedCost() ?? this.cost() ?? 0,
      stock: this.stock() ?? 0,
      unit: this.unit().trim() || undefined,
      ...(this.buyOn() ? { buyUnit: this.buyUnit().trim() || undefined, perBuyUnit: this.packSize() || undefined, buyCost: this.buyCost() ?? undefined } : {}),
    };
    const problem = id === 'new' ? this.ledger.addItem(details) : this.ledger.updateItem({ ...details, id: id as string });
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

  private fill(v: { emoji: string; photo: string; name: string; price: number | null; cost: number | null; stock: number | null; unit: string; buyUnit: string; perBuyUnit: number | null; buyCost: number | null }): void {
    this.photoError.set('');
    this.unit.set(v.unit);
    this.buyOn.set(!!v.buyUnit);
    this.buyUnit.set(v.buyUnit);
    this.perBuy.set(v.perBuyUnit);
    this.buyCost.set(v.buyCost);
    this.photo.set(v.photo);
    this.emoji.set(v.emoji);
    this.name.set(v.name);
    this.price.set(v.price);
    this.cost.set(v.cost);
    this.stock.set(v.stock);
    this.error.set('');
  }
}
