import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Ledger } from '../core/ledger';
import { Item, ListItem } from '../core/models';
import { PageHeader } from '../shared/page-header';

@Component({
  selector: 'app-shopping',
  imports: [FormsModule, PageHeader],
  template: `
    <app-page-header title="Shopping list" back="/more" />
    <div class="page-body">
      <form class="d-flex gap-2" (ngSubmit)="addTyped()">
        <input class="form-control" name="what" placeholder="Add something to buy..." [ngModel]="query()" (ngModelChange)="typing($event)" autocomplete="off" aria-label="Something to buy">
        <button class="btn btn-primary" type="submit" aria-label="Add to the list"><i class="bi bi-plus-lg"></i></button>
      </form>
      @if (error()) { <div class="text-danger small fw-semibold" role="alert">{{ error() }}</div> }

      @if (suggestions().length) {
        <div class="chips" aria-label="Your items that match">
          @for (item of suggestions(); track item.id) {
            <button type="button" class="chip" (click)="addItem(item)"><i class="bi bi-plus"></i> {{ item.name }}</button>
          }
        </div>
      }
      @if (lowToAdd() > 0) {
        <button type="button" class="btn btn-outline-primary" (click)="addLow()">
          <i class="bi bi-exclamation-triangle"></i> Add {{ lowToAdd() }} low-stock {{ lowToAdd() === 1 ? 'item' : 'items' }}
        </button>
      }

      @if (ledger.listItems().length === 0) {
        <div class="empty-state">
          <i class="bi bi-cart3"></i>
          <h2>Your shopping list is empty</h2>
          <p>Write down what you need to buy at the market. Items that are running low can be added in one tap.</p>
        </div>
      }

      @if (toBuy().length) {
        <h2 class="h6 fw-bold mb-0 mt-1">To buy ({{ toBuy().length }})</h2>
        <div class="d-flex flex-column gap-2">
          @for (line of toBuy(); track line.id) {
            <div class="row-card">
              <button type="button" class="check" (click)="ledger.toggleListDone(line.id)" [attr.aria-label]="'Mark ' + line.name + ' as bought'"><i class="bi bi-circle"></i></button>
              <div class="grow">
                <div class="fw-bold">{{ line.name }}</div>
                @if (stockLeft(line) !== null) { <div class="sub">{{ stockLeft(line) }} left now</div> }
              </div>
              <div class="qty-step">
                <button type="button" [disabled]="line.qty <= 1" (click)="change(line, -1)" aria-label="One less"><i class="bi bi-dash-lg"></i></button>
                <span aria-live="polite">{{ line.qty }}</span>
                <button type="button" (click)="change(line, 1)" aria-label="One more"><i class="bi bi-plus-lg"></i></button>
              </div>
              <button type="button" class="icon-btn sm" (click)="ledger.removeListItem(line.id)" [attr.aria-label]="'Remove ' + line.name"><i class="bi bi-x-lg"></i></button>
            </div>
          }
        </div>
      }

      @if (bought().length) {
        <h2 class="h6 fw-bold mb-0 mt-2">In the basket ({{ bought().length }})</h2>
        <div class="d-flex flex-column gap-2">
          @for (line of bought(); track line.id) {
            <div class="row-card done">
              <button type="button" class="check" (click)="ledger.toggleListDone(line.id)" [attr.aria-label]="'Put ' + line.name + ' back on the list'"><i class="bi bi-check-circle-fill text-success"></i></button>
              <div class="grow"><div class="fw-bold">{{ line.name }}</div></div>
              <span class="text-secondary fw-semibold">× {{ line.qty }}</span>
              <button type="button" class="icon-btn sm" (click)="ledger.removeListItem(line.id)" [attr.aria-label]="'Remove ' + line.name"><i class="bi bi-x-lg"></i></button>
            </div>
          }
        </div>
        <div class="card"><div class="card-body d-flex flex-column gap-2">
          @if (linkedBought() > 0) {
            <button type="button" class="btn btn-success" (click)="receive()"><i class="bi bi-box-seam"></i> Add bought items to my stock</button>
            <div class="small text-secondary">Adds the quantities above to {{ linkedBought() }} {{ linkedBought() === 1 ? 'item' : 'items' }} in your stock and clears them from the list.</div>
          }
          <button type="button" class="btn btn-outline-secondary" (click)="ledger.clearBought()">Clear the basket</button>
        </div></div>
      }
    </div>
  `,
})
export class Shopping {
  protected readonly ledger = inject(Ledger);

  protected readonly query = signal('');
  protected readonly error = signal('');

  protected readonly toBuy = computed(() => this.ledger.listItems().filter((l) => !l.done));
  protected readonly bought = computed(() => this.ledger.listItems().filter((l) => l.done));
  /** Bought lines that point at one of the shop's items, so they can be added to its stock. */
  protected readonly linkedBought = computed(() => this.bought().filter((l) => l.itemId && this.ledger.items().some((i) => i.id === l.itemId)).length);

  /** Items of the shop that match what is being typed and have no line on the list yet. */
  protected readonly suggestions = computed(() => {
    const q = this.query().trim().toLowerCase();
    if (!q) return [];
    const onList = new Set(this.ledger.listItems().map((l) => l.itemId));
    return this.ledger.items().filter((i) => i.name.toLowerCase().includes(q) && !onList.has(i.id)).slice(0, 6);
  });

  protected readonly lowToAdd = computed(() => {
    const onList = new Set(this.ledger.listItems().map((l) => l.itemId));
    return this.ledger.lowStock().filter((i) => !onList.has(i.id)).length;
  });

  protected typing(text: string): void {
    this.query.set(text);
    this.error.set('');
  }

  protected addTyped(): void {
    const text = this.query().trim();
    // Typing the exact name of one of the shop's items links the line to it, so buying it can restock it.
    const match = this.ledger.items().find((i) => i.name.toLowerCase() === text.toLowerCase());
    const problem = match ? this.ledger.addToList(match.name, match.id) : this.ledger.addToList(text);
    this.error.set(problem ?? '');
    if (!problem) this.query.set('');
  }

  protected addItem(item: Item): void {
    this.error.set(this.ledger.addToList(item.name, item.id) ?? '');
    this.query.set('');
  }

  protected addLow(): void {
    this.error.set('');
    const added = this.ledger.addLowStockToList();
    this.ledger.showToast(added ? `Added ${added} to your list` : 'They are already on your list');
  }

  protected change(line: ListItem, by: number): void {
    this.error.set('');
    this.ledger.changeListQty(line.id, by);
  }

  protected stockLeft(line: ListItem): number | null {
    return this.ledger.items().find((i) => i.id === line.itemId)?.stock ?? null;
  }

  protected receive(): void {
    const restocked = this.ledger.receiveBought();
    this.ledger.showToast(`Stock updated for ${restocked} ${restocked === 1 ? 'item' : 'items'}`);
  }
}
