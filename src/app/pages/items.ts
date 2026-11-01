import { CurrencyPipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { Ledger } from '../core/ledger';
import { photoFromFile } from '../core/image';
import { Item, ItemDetails } from '../core/models';
import { peso } from '../core/format';
import { costFromPack, hasBuyUnit, optionSuffix, optionsOf, plural, priceFor, profitOf, round2, setSize, stockText } from '../core/units';
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
              <div class="sub">{{ subLine(i) }}</div>
              @if (packText(i)) { <div class="sub">{{ packText(i) }}</div> }
            </div>
            <div class="text-end">
              @for (o of optionsOf(i); track $index) {
                <div class="fw-bold">{{ o.price | currency: 'PHP' : 'symbol-narrow' : '1.0-2' }}{{ optionSuffix(i, o) }}</div>
              }
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
          <div class="col-4"><label class="label" for="price">Price</label><input id="price" class="form-control" name="price" type="number" inputmode="decimal" min="0" [(ngModel)]="price"></div>
          <div class="col-3"><label class="label" for="sellQty">For every</label><input id="sellQty" class="form-control" name="sellQty" type="number" inputmode="numeric" min="1" step="1" placeholder="1" [(ngModel)]="sellQty"></div>
          <div class="col-5"><label class="label" for="unit">Unit name</label><input id="unit" class="form-control" name="unit" placeholder="piece" maxlength="20" autocomplete="off" [(ngModel)]="unit"></div>
        </div>
        @if (setCount() > 1 && price()) { <div class="small text-secondary">Customers pay {{ peso(price() ?? 0) }} for every {{ setCount() }} {{ sellWord(setCount()) }}.</div> }
        @for (deal of deals(); track $index) {
          <div class="d-flex align-items-end gap-2">
            <div style="width: 30%"><label class="label" [attr.for]="'dealQty' + $index">Pieces</label><input class="form-control" type="number" inputmode="numeric" min="1" step="1" [id]="'dealQty' + $index" [name]="'dealQty' + $index" [ngModel]="deal.qty" (ngModelChange)="setDeal($index, 'qty', $event)"></div>
            <div class="flex-grow-1"><label class="label" [attr.for]="'dealPrice' + $index">Price for them</label><input class="form-control" type="number" inputmode="decimal" min="0" [id]="'dealPrice' + $index" [name]="'dealPrice' + $index" [ngModel]="deal.price" (ngModelChange)="setDeal($index, 'price', $event)"></div>
            <button type="button" class="icon-btn sm mb-1" (click)="removeDeal($index)" aria-label="Remove this price"><i class="bi bi-x-lg"></i></button>
          </div>
          @if (dealHint(deal); as hint) { <div class="small fw-semibold" [class.text-success]="!hint.bad" [class.text-danger]="hint.bad">{{ hint.text }}</div> }
        }
        <button type="button" class="btn btn-sm btn-outline-primary align-self-start" [disabled]="deals().length >= 3" (click)="addDeal()"><i class="bi bi-plus-lg"></i> Add a bundle price (like 3 pieces for ₱5)</button>
        @if (examples().length) { <div class="small text-secondary"><b>How it will be priced:</b> {{ examples().join(' · ') }}. The price is worked out from the number of pieces, using the cheapest mix.</div> }
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
  /** The price covers this many pieces at a time (5 pesos for every 3 pieces). Empty or 1 means one at a time. */
  protected sellQty = signal<number | null>(null);
  /** Other prices for the same item: 1 piece for 2 pesos as the regular price, and also 3 for 5 pesos. */
  protected readonly deals = signal<{ qty: number | null; price: number | null }[]>([]);
  /** Items bought in bigger packs: the pack's name, how many selling units are inside, and what one pack costs. */
  protected buyOn = signal(false);
  protected buyUnit = signal('');
  protected perBuy = signal<number | null>(null);
  protected buyCost = signal<number | null>(null);
  protected readonly error = signal('');
  protected readonly confirmDelete = signal(false);

  protected readonly stockText = stockText;
  protected readonly optionsOf = optionsOf;
  protected readonly optionSuffix = optionSuffix;
  protected readonly setSize = setSize;
  protected readonly peso = peso;
  /** Worked examples of the prices the customer will be charged, so the owner can check the bundle price before saving. */
  protected readonly examples = computed(() => {
    const price = this.price();
    const step = this.setCount();
    const deals = this.deals()
      .filter((d) => d.qty && d.qty >= 1 && d.price && d.price > 0 && Math.round(d.qty) !== step)
      .map((d) => ({ qty: Math.round(d.qty as number), price: d.price as number }));
    if (!price || !deals.length) return [];
    const item = { price, sellQty: step > 1 ? step : undefined, deals };
    return [1, 2, 3, 4, 5, 6].map((k) => k * step).map((pieces) => `${pieces} ${plural(this.sellName(), pieces)} ${peso(priceFor(item, pieces).total)}`);
  });
  /** Pieces in one sale as typed in the editor (1 when empty). */
  protected readonly setCount = computed(() => Math.max(1, Math.round(this.sellQty() ?? 1)));
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
    const per = this.setCount();
    const base = per > 1
      ? `Each ${plural(this.sellName(), 1)} costs you ${peso(cost)}, so ${per} cost ${peso(round2(cost * per))}`
      : `Each ${plural(this.sellName(), 1)} costs you ${peso(cost)}`;
    const price = this.price();
    if (!price) return `${base}.`;
    const earn = round2(price - cost * per);
    if (earn < 0) return `${base}, which is more than you sell them for.`;
    return per > 1 ? `${base}. You earn ${peso(earn)} each time you sell ${per}.` : `${base}, so you earn ${peso(earn)} on each.`;
  });
  protected readonly costWarning = computed(() => this.derivedCost() !== null && (this.price() ?? 0) > 0 && (this.price() ?? 0) < (this.derivedCost() ?? 0) * this.setCount());

  /** Quick restock buttons: whole packs when the item is bought in packs, otherwise plain amounts. */
  protected readonly quick = computed(() =>
    this.packSize() > 0
      ? [1, 5, 10].map((n) => ({ label: `+${n} ${plural(this.buyName(), n)}`, amount: n * this.packSize() }))
      : [10, 20, 50, 100].map((n) => ({ label: `+${n}`, amount: n })),
  );

  protected readonly addedStock = computed(() => Math.max(0, (this.stock() ?? 0) - (this.original()?.stock ?? 0)));

  protected openNew(): void {
    this.fill({ emoji: '', photo: '', name: '', price: null, cost: null, stock: null, unit: '', sellQty: null, deals: [], buyUnit: '', perBuyUnit: null, buyCost: null });
    this.editing.set('new');
  }

  protected openEdit(item: Item): void {
    this.fill({ ...item, photo: item.photo ?? '', unit: item.unit ?? '', sellQty: item.sellQty ?? null, deals: (item.deals ?? []).map((d) => ({ qty: d.qty, price: d.price })), buyUnit: item.buyUnit ?? '', perBuyUnit: item.perBuyUnit ?? null, buyCost: item.buyCost ?? null });
    this.editing.set(item.id);
  }

  /** Puts everything running low on the shopping list, then opens it. */
  protected listLow(): void {
    const added = this.ledger.addLowStockToList();
    if (!added) this.ledger.showToast('They are already on your shopping list');
    this.router.navigate(['/shopping']);
  }

  protected addDeal(): void {
    this.deals.update((all) => (all.length >= 3 ? all : [...all, { qty: null, price: null }]));
  }

  protected removeDeal(index: number): void {
    this.deals.update((all) => all.filter((_, i) => i !== index));
  }

  protected setDeal(index: number, field: 'qty' | 'price', value: number | null): void {
    this.deals.update((all) => all.map((d, i) => (i === index ? { ...d, [field]: value === null || value === ('' as unknown) ? null : Number(value) } : d)));
  }

  /** What one piece costs you now: from the pack price, or what was typed when the item is not bought in packs. */
  private unitCost(): number | null {
    return this.derivedCost() ?? (!this.buyOn() && (this.cost() ?? 0) > 0 ? this.cost() : null);
  }

  /** "You earn ₱3.95 each time" for an extra price, once its pieces and price are filled in and the cost is known. */
  protected dealHint(deal: { qty: number | null; price: number | null }): { text: string; bad: boolean } | null {
    const cost = this.unitCost();
    if (cost === null || !deal.qty || !deal.price) return null;
    const earn = round2(deal.price - cost * Math.round(deal.qty));
    return earn < 0 ? { text: 'That is less than these pieces cost you.', bad: true } : { text: `You earn ${peso(earn)} each time you sell ${Math.round(deal.qty)}.`, bad: false };
  }

  /** The second line of an item in the list: its cost and what a sale earns you. */
  protected subLine(item: Item): string {
    const options = optionsOf(item);
    if (options.length === 1 && setSize(item) === 1) return `Cost ${peso(item.cost)} · Profit ${peso(profitOf(item, options[0]))}`;
    const profits = options.map((o) => profitOf(item, o));
    const low = Math.min(...profits);
    const high = Math.max(...profits);
    return `Cost ${peso(item.cost)} each · Profit ${low === high ? peso(low) : `${peso(low)} to ${peso(high)}`} per sale`;
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
    const filled = this.deals().filter((d) => d.qty || d.price);
    if (filled.some((d) => !(d.qty && d.qty >= 1 && d.price && d.price > 0))) return this.error.set('Fill in both the pieces and the price for each extra price, or remove that row.');
    const sizes = filled.map((d) => Math.round(d.qty as number));
    if (sizes.includes(this.setCount()) || new Set(sizes).size !== sizes.length) return this.error.set('Each price needs a different number of pieces.');
    const details: ItemDetails = {
      emoji: this.emoji() || '🛍️',
      photo: this.photo() || undefined,
      name: this.name(),
      price: this.price() ?? 0,
      // With a pack price the cost of one unit is worked out for you; otherwise it is what you typed.
      cost: this.derivedCost() ?? this.cost() ?? 0,
      stock: this.stock() ?? 0,
      unit: this.unit().trim() || undefined,
      sellQty: this.setCount() > 1 ? this.setCount() : undefined,
      deals: filled.length ? filled.map((d) => ({ qty: Math.round(d.qty as number), price: d.price as number })) : undefined,
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

  private fill(v: { emoji: string; photo: string; name: string; price: number | null; cost: number | null; stock: number | null; unit: string; sellQty: number | null; deals: { qty: number | null; price: number | null }[]; buyUnit: string; perBuyUnit: number | null; buyCost: number | null }): void {
    this.photoError.set('');
    this.unit.set(v.unit);
    this.sellQty.set(v.sellQty);
    this.deals.set(v.deals);
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
