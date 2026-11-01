import { Injectable, computed, inject, signal } from '@angular/core';
import { AppDb } from './db';
import { daysAgo, startOfDay } from './format';
import { Backup, Customer, Entry, Item, ItemDetails, Line, ListItem, Method, OutboxRow, RecordKind, RemoteChange } from './models';
import { costFromPack, hasBuyUnit, perPack, plural, priceFor, round2, setSize } from './units';

const OVERDUE_AFTER_DAYS = 7;
/** An item with this many left or fewer counts as running low. */
const LOW_STOCK = 5;
/** How many of an item (not bought in packs) the list suggests buying when it is added from the item list. */
const DEFAULT_BUY_QTY = 10;

@Injectable({ providedIn: 'root' })
export class Ledger {
  private readonly db = inject(AppDb);

  readonly shopName = signal('My store');
  readonly ownerName = signal('there');
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly toast = signal<string | null>(null);
  /** False when the browser refused local storage (private mode, no space); data then lives only until the tab closes. */
  readonly storageOk = signal(true);
  /** True when the browser promised not to clear this app's data on its own. */
  readonly persisted = signal(false);
  /** True once this phone is linked to an online account: every change is then also queued for upload. Set by Sync. */
  readonly syncLinked = signal(false);
  /** Goes up by one each time a change is queued, so Sync knows there is something to send. */
  readonly revision = signal(0);

  readonly items = signal<Item[]>([]);
  readonly customers = signal<Customer[]>([]);
  readonly entries = signal<Entry[]>([]);

  /** customerId -> amount owed (charges minus payments). */
  readonly balances = computed(() => {
    const map = new Map<string, number>();
    for (const e of this.entries()) {
      if (!e.customerId) continue;
      const delta = e.type === 'charge' ? e.amount : e.type === 'payment' ? -e.amount : 0;
      map.set(e.customerId, (map.get(e.customerId) ?? 0) + delta);
    }
    return map;
  });

  readonly totalOwed = computed(() => [...this.balances().values()].reduce((a, b) => a + Math.max(0, b), 0));

  readonly due = computed(() =>
    this.customers()
      .filter((c) => this.balanceOf(c.id) > 0)
      .sort((a, b) => this.overdueDays(b.id) - this.overdueDays(a.id)),
  );

  readonly lowStock = computed(() => this.items().filter((i) => i.stock <= LOW_STOCK));

  readonly listItems = signal<ListItem[]>([]);
  /** How many things are still to be bought. */
  readonly shoppingCount = computed(() => this.listItems().filter((l) => !l.done).length);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.online.set(true));
      window.addEventListener('offline', () => this.online.set(false));
    }
  }

  /** Loads everything from this device. */
  async init(): Promise<void> {
    try {
      await this.db.open();
      const [customers, items, entries, listItems, profile] = await Promise.all([
        this.db.customers.toArray(), this.db.items.toArray(), this.db.entries.toArray(), this.db.listItems.toArray(), this.db.meta.get('profile'),
      ]);
      this.customers.set(customers);
      this.items.set(items);
      this.entries.set(entries);
      this.listItems.set(listItems);
      const p = profile?.value as { shopName: string; ownerName: string } | undefined;
      if (p) { this.shopName.set(p.shopName); this.ownerName.set(p.ownerName); }
      this.persisted.set((await navigator.storage?.persist?.()) ?? false);
    } catch {
      this.storageOk.set(false);
    }
  }

  /** The names shown in the app. Records already on this phone are kept. */
  setProfile(shopName: string, ownerName: string): void {
    this.shopName.set(shopName);
    this.ownerName.set(ownerName);
    this.save(() => this.saveProfile());
  }

  /** Removes everything from this phone, including the account. Used when the password is forgotten. */
  async wipeDevice(): Promise<void> {
    this.customers.set([]);
    this.items.set([]);
    this.entries.set([]);
    this.listItems.set([]);
    this.shopName.set('My store');
    this.ownerName.set('there');
    await this.db.transaction('rw', [this.db.customers, this.db.items, this.db.entries, this.db.listItems, this.db.meta, this.db.outbox], async () => {
      await Promise.all([this.db.customers.clear(), this.db.items.clear(), this.db.entries.clear(), this.db.listItems.clear(), this.db.meta.clear(), this.db.outbox.clear()]);
    });
  }

  // While the phone is backed up online, the server's copy is the truth, so wiping or replacing it from here is not offered.
  eraseAll(): void {
    if (this.syncLinked()) return;
    this.save(() => this.replaceAll([], [], []));
  }

  exportBackup(): Backup {
    return {
      app: 'aling-suki', version: 1, exportedAt: Date.now(),
      profile: { shopName: this.shopName(), ownerName: this.ownerName() },
      customers: this.customers(), items: this.items(), entries: this.entries(), shoppingList: this.listItems(),
    };
  }

  /** Replaces everything on this device with a backup file. Returns an error message, or null on success. */
  restore(text: string): string | null {
    if (this.syncLinked()) return 'Restoring from a file is not available while your data is backed up online.';
    let data: Partial<Backup>;
    try { data = JSON.parse(text); } catch { return 'That file is not a valid backup.'; }
    if (data.app !== 'aling-suki' || data.version !== 1 || !Array.isArray(data.customers) || !Array.isArray(data.items) || !Array.isArray(data.entries) || !data.profile) {
      return 'That file is not an Aling Suki backup.';
    }
    this.shopName.set(data.profile.shopName);
    this.ownerName.set(data.profile.ownerName);
    this.save(() => this.replaceAll(data.customers!, data.items!, data.entries!, Array.isArray(data.shoppingList) ? data.shoppingList : []));
    return null;
  }

  balanceOf(customerId: string): number {
    return this.balances().get(customerId) ?? 0;
  }

  /** Days since the last payment (or the first charge when they never paid). 0 when nothing is owed. */
  overdueDays(customerId: string): number {
    if (this.balanceOf(customerId) <= 0) return 0;
    const mine = this.entries().filter((e) => e.customerId === customerId);
    const payments = mine.filter((e) => e.type === 'payment').map((e) => e.date);
    const base = payments.length ? Math.max(...payments) : Math.min(...mine.map((e) => e.date));
    return daysAgo(base);
  }

  isOverdue(customerId: string): boolean {
    return this.overdueDays(customerId) > OVERDUE_AFTER_DAYS;
  }

  customer(id: string): Customer | undefined {
    return this.customers().find((c) => c.id === id);
  }

  historyOf(customerId: string): Entry[] {
    return this.entries().filter((e) => e.customerId === customerId).sort((a, b) => b.date - a.date);
  }

  lastActivity(customerId: string): number | undefined {
    return this.historyOf(customerId)[0]?.date;
  }

  /** Sales, profit and money collected for entries on or after `from`. */
  totals(from: number, to = Number.POSITIVE_INFINITY) {
    let sales = 0, profit = 0, collected = 0;
    for (const e of this.entries()) {
      if (e.date < from || e.date >= to) continue;
      if (e.type === 'payment') collected += e.amount;
      else { sales += e.amount; profit += e.profit; }
    }
    return { sales, profit, collected };
  }

  reminderText(customerId: string): string {
    const c = this.customer(customerId);
    if (!c) return '';
    return `Good day, ${c.name}! Just a friendly reminder about your balance at ${this.shopName()}: ₱${this.balanceOf(c.id).toLocaleString('en-PH')}. Thank you for your support!`;
  }

  /** Returns an error message, or null on success. */
  addSale(cart: Record<string, number>, method: Method, customerId?: string): string | null {
    const lines: Line[] = [];
    let amount = 0, profit = 0;
    // The cart counts pieces of each item. The price is worked out from how many pieces there are (see priceFor), and stock
    // and the records count the same single pieces.
    const pieces = new Map<string, number>();
    const itemsById = new Map(this.items().map((i) => [i.id, i]));
    for (const [itemId, count] of Object.entries(cart)) {
      const item = itemsById.get(itemId);
      if (!item || !count) continue;
      if (count > item.stock) return `There is not enough ${item.name} in stock.`;
      const total = priceFor(item, count).total;
      pieces.set(itemId, count);
      lines.push({ name: item.name, qty: count, amount: total });
      amount += total;
      profit += total - item.cost * count;
    }
    amount = round2(amount);
    profit = round2(profit);
    if (!lines.length) return 'Add at least one item.';
    if (method === 'credit') {
      const limitError = this.checkCredit(customerId, amount);
      if (limitError) return limitError;
    }
    const now = Date.now();
    const entry: Entry = {
      id: crypto.randomUUID(), customerId: method === 'credit' ? customerId : undefined,
      type: method === 'credit' ? 'charge' : 'sale', method, amount, profit, note: '', date: now, lines,
    };
    const soldItems = this.items().filter((i) => pieces.has(i.id)).map((i) => ({ ...i, stock: Math.max(0, i.stock - (pieces.get(i.id) as number)), updatedAt: now }));
    const byId = new Map(soldItems.map((i) => [i.id, i]));
    this.entries.update((all) => [...all, entry]);
    this.items.update((all) => all.map((i) => byId.get(i.id) ?? i));
    this.commit(
      (db) => Promise.all([db.entries.add(entry), db.items.bulkPut(soldItems)]),
      [this.outboxRow('entry', entry), ...soldItems.map((i) => this.outboxRow('item', i))],
    );
    return null;
  }

  addCharge(customerId: string, amount: number, note: string): string | null {
    if (!(amount > 0)) return 'Enter an amount.';
    const limitError = this.checkCredit(customerId, amount);
    if (limitError) return limitError;
    this.record({
      id: crypto.randomUUID(), customerId, type: 'charge', method: 'credit', amount, profit: 0, note, date: Date.now(), lines: [],
    });
    return null;
  }

  addPayment(customerId: string, amount: number, method: Method): string | null {
    if (!(amount > 0)) return 'Enter an amount.';
    if (amount > this.balanceOf(customerId)) return 'That is more than the balance owed.';
    this.record({
      id: crypto.randomUUID(), customerId, type: 'payment', method, amount, profit: 0, note: '', date: Date.now(), lines: [],
    });
    return null;
  }

  addCustomer(name: string, phone: string): string | null {
    if (!name.trim()) return 'Enter a name.';
    const customer: Customer = { id: crypto.randomUUID(), name: name.trim(), phone, creditLimit: 1000, updatedAt: Date.now() };
    this.customers.update((all) => [...all, customer]);
    this.commit((db) => db.customers.put(customer), [this.outboxRow('customer', customer)]);
    return null;
  }

  addItem(details: ItemDetails): string | null {
    const problem = this.itemProblem(details);
    if (problem) return problem;
    const item: Item = { ...this.cleanItem(details), id: crypto.randomUUID(), updatedAt: Date.now() };
    this.items.update((all) => [...all, item]);
    this.commit((db) => db.items.put(item), [this.outboxRow('item', item)]);
    return null;
  }

  /** Replaces an existing item's details (price, units, stock, name). Returns an error message, or null on success. */
  updateItem(item: Item): string | null {
    const problem = this.itemProblem(item);
    if (problem) return problem;
    const clean: Item = { ...this.cleanItem(item), id: item.id, updatedAt: Date.now() };
    this.items.update((all) => all.map((i) => (i.id === clean.id ? clean : i)));
    this.commit((db) => db.items.put(clean), [this.outboxRow('item', clean)]);
    return null;
  }

  /** Past sales keep the item's name in their own lines, so removing an item never changes the records. */
  removeItem(id: string): void {
    const item = this.items().find((i) => i.id === id);
    if (!item) return;
    this.items.update((all) => all.filter((i) => i.id !== id));
    // Other phones are told through a "deleted" record that carries the item's last details.
    this.commit((db) => db.items.delete(id), [this.outboxRow('item', item, true, Date.now())]);
  }

  /**
   * Applies changes that came from the server (made on another phone, or this phone's own earlier pushes coming back).
   * Entries are history and are only ever added. Customers and items keep whichever edit is newer, so an edit made here
   * that has not been sent yet is never overwritten by an older one from the server. Nothing here is queued for upload.
   */
  async applyRemote(changes: RemoteChange[]): Promise<void> {
    if (!changes.length) return;
    // Customers, items and shopping-list lines all follow "newest edit wins"; each has its own table.
    const tables = {
      customer: new Map<string, Customer>(this.customers().map((c) => [c.id, c])),
      item: new Map<string, Item>(this.items().map((i) => [i.id, i])),
      listitem: new Map<string, ListItem>(this.listItems().map((l) => [l.id, l])),
    };
    const puts = { customer: [] as Customer[], item: [] as Item[], listitem: [] as ListItem[] };
    const deletes = { customer: [] as string[], item: [] as string[], listitem: [] as string[] };
    const entryIds = new Set(this.entries().map((e) => e.id));
    const newEntries: Entry[] = [];

    for (const change of changes) {
      if (change.kind === 'entry') {
        if (!entryIds.has(change.id)) { entryIds.add(change.id); newEntries.push(change.data as Entry); }
        continue;
      }
      const table = tables[change.kind] as Map<string, { id: string; updatedAt?: number }>;
      const local = table.get(change.id);
      if (local && (local.updatedAt ?? 0) > change.updatedAt) continue;
      if (change.deleted) {
        table.delete(change.id);
        deletes[change.kind].push(change.id);
      } else {
        const record = { ...(change.data as { id: string }), updatedAt: change.updatedAt };
        table.set(record.id, record);
        (puts[change.kind] as { id: string }[]).push(record);
      }
    }

    await this.db.transaction('rw', [this.db.customers, this.db.items, this.db.entries, this.db.listItems], async () => {
      await this.db.customers.bulkDelete(deletes.customer);
      await this.db.items.bulkDelete(deletes.item);
      await this.db.listItems.bulkDelete(deletes.listitem);
      await this.db.customers.bulkPut(puts.customer);
      await this.db.items.bulkPut(puts.item);
      await this.db.listItems.bulkPut(puts.listitem);
      await this.db.entries.bulkPut(newEntries);
    });
    this.customers.set([...tables.customer.values()]);
    this.items.set([...tables.item.values()]);
    this.listItems.set([...tables.listitem.values()]);
    if (newEntries.length) this.entries.update((all) => [...all, ...newEntries]);
  }

  /** The first time a phone links to an online account, everything already on it is queued for upload. */
  async enqueueEverything(): Promise<void> {
    // Records from before edits were timestamped get the earliest possible time, so a newer copy on the server wins.
    const customers = this.customers().map((c) => ({ ...c, updatedAt: c.updatedAt ?? 1 }));
    const items = this.items().map((i) => ({ ...i, updatedAt: i.updatedAt ?? 1 }));
    const listItems = this.listItems().map((l) => ({ ...l, updatedAt: l.updatedAt ?? 1 }));
    await this.db.transaction('rw', [this.db.customers, this.db.items, this.db.entries, this.db.listItems, this.db.outbox], async () => {
      await this.db.customers.bulkPut(customers);
      await this.db.items.bulkPut(items);
      await this.db.listItems.bulkPut(listItems);
      await this.enqueue([
        ...customers.map((c) => this.outboxRow('customer', c)),
        ...items.map((i) => this.outboxRow('item', i)),
        ...listItems.map((l) => this.outboxRow('listitem', l)),
        ...this.entries().map((e) => this.outboxRow('entry', e)),
      ]);
    });
    this.customers.set(customers);
    this.items.set(items);
    this.listItems.set(listItems);
    this.revision.update((n) => n + 1);
  }

  // ---- shopping list ----------------------------------------------------------------------------------------------

  /** Adds something to buy. Pass itemId when it is one of the shop's items, so buying it can be added to its stock. */
  addToList(name: string, itemId?: string, qty?: number): string | null {
    const clean = name.trim().slice(0, 80);
    if (!clean) return 'Type what you need to buy.';
    const same = itemId
      ? this.listItems().find((l) => l.itemId === itemId)
      : this.listItems().find((l) => !l.itemId && l.name.toLowerCase() === clean.toLowerCase());
    if (same) {
      if (!same.done) return `${clean} is already on your list.`;
      this.saveListItem({ ...same, done: false, qty: qty ?? same.qty }); // bought before: it goes back on the list
      return null;
    }
    const linked = itemId ? this.items().find((i) => i.id === itemId) : undefined;
    const suggested = linked && hasBuyUnit(linked) ? 1 : itemId ? DEFAULT_BUY_QTY : 1; // one pack for pack items, else a handful
    this.saveListItem({ id: crypto.randomUUID(), name: clean, qty: qty ?? suggested, done: false, ...(itemId ? { itemId } : {}) });
    return null;
  }

  /** Adds every item that is running low and has no line on the list yet (ticked or not). Returns how many were added. */
  addLowStockToList(): number {
    const low = this.items().filter((i) => i.stock <= LOW_STOCK && !this.listItems().some((l) => l.itemId === i.id));
    for (const item of low) this.addToList(item.name, item.id);
    return low.length;
  }

  /** Changes how many to buy by +1 or -1. Reads the current value, so quick repeated taps never lose one. */
  changeListQty(id: string, by: number): void {
    const line = this.listItems().find((l) => l.id === id);
    if (line) this.saveListItem({ ...line, qty: Math.min(9999, Math.max(1, line.qty + by)) });
  }

  toggleListDone(id: string): void {
    const line = this.listItems().find((l) => l.id === id);
    if (line) this.saveListItem({ ...line, done: !line.done });
  }

  removeListItem(id: string): void {
    this.removeListItems([id]);
  }

  /** Empties the basket: removes everything ticked as bought, without touching stock. */
  clearBought(): void {
    this.removeListItems(this.listItems().filter((l) => l.done).map((l) => l.id));
  }

  /**
   * Done shopping: adds what was bought to each item's stock and clears those lines from the list. Lines that are not
   * linked to an item (for example "plastic bags") have no stock to change and stay until the basket is cleared.
   * Returns how many items were restocked.
   */
  receiveBought(): number {
    const bought = this.listItems().filter((l) => l.done && l.itemId);
    if (!bought.length) return 0;
    const now = Date.now();
    const items = new Map(this.items().map((i) => [i.id, i]));
    const restocked = new Map<string, Item>();
    for (const line of bought) {
      const item = items.get(line.itemId as string);
      // The list counts what is bought (3 packs); stock counts what is sold (60 sticks).
      if (item) restocked.set(item.id, { ...item, stock: item.stock + line.qty * perPack(item), updatedAt: now });
    }
    const ids = new Set(bought.map((l) => l.id));
    this.items.update((all) => all.map((i) => restocked.get(i.id) ?? i));
    this.listItems.update((all) => all.filter((l) => !ids.has(l.id)));
    this.commit(
      (db) => Promise.all([db.items.bulkPut([...restocked.values()]), db.listItems.bulkDelete([...ids])]),
      [...[...restocked.values()].map((i) => this.outboxRow('item', i)), ...bought.map((l) => this.outboxRow('listitem', l, true, now))],
    );
    return restocked.size;
  }

  private itemProblem(d: ItemDetails): string | null {
    if (!d.name.trim() || !(d.price > 0)) return 'Enter a name and a price.';
    if (d.stock < 0 || d.cost < 0) return 'Cost and stock cannot be negative.';
    if (d.buyUnit?.trim() || d.perBuyUnit) {
      if (!d.buyUnit?.trim() || !((d.perBuyUnit ?? 0) >= 1)) {
        return `Name the bigger unit and say how many ${plural(d.unit?.trim() || 'piece', 2)} are inside it.`;
      }
    }
    return null;
  }

  /** Drops empty optional fields (so they are not stored or synced) and works out the cost of one selling unit from the pack price. */
  private cleanItem<T extends ItemDetails>(d: T): T {
    const out: T = { ...d, name: d.name.trim(), emoji: d.emoji || '🛍️' };
    for (const key of ['photo', 'unit', 'buyUnit'] as const) {
      const value = out[key]?.trim();
      if (value) out[key] = value; else delete out[key];
    }
    if (out.sellQty !== undefined && out.sellQty >= 2) out.sellQty = Math.round(out.sellQty); else delete out.sellQty;
    // Extra prices: keep complete ones, no repeats of the regular price's size or of each other, at most three.
    const seen = new Set<number>([setSize(out)]);
    const deals = (out.deals ?? [])
      .filter((d) => d.qty >= 1 && d.price > 0)
      .map((d) => ({ qty: Math.round(d.qty), price: d.price }))
      .filter((d) => !seen.has(d.qty) && !!seen.add(d.qty))
      .slice(0, 3);
    if (deals.length) out.deals = deals; else delete out.deals;
    if (!hasBuyUnit(out)) {
      delete out.buyUnit; delete out.perBuyUnit; delete out.buyCost;
    } else {
      out.perBuyUnit = Math.round(out.perBuyUnit as number);
      if (out.buyCost !== undefined && out.buyCost >= 0) out.cost = costFromPack(out.buyCost, out.perBuyUnit);
      else delete out.buyCost;
    }
    out.cost = out.cost || 0;
    out.stock = out.stock || 0;
    return out;
  }

  private saveListItem(line: ListItem): void {
    const next = { ...line, updatedAt: Date.now() };
    this.listItems.update((all) => (all.some((l) => l.id === next.id) ? all.map((l) => (l.id === next.id ? next : l)) : [...all, next]));
    this.commit((db) => db.listItems.put(next), [this.outboxRow('listitem', next)]);
  }

  private removeListItems(ids: string[]): void {
    const gone = this.listItems().filter((l) => ids.includes(l.id));
    if (!gone.length) return;
    const now = Date.now();
    this.listItems.update((all) => all.filter((l) => !ids.includes(l.id)));
    this.commit((db) => db.listItems.bulkDelete(gone.map((l) => l.id)), gone.map((l) => this.outboxRow('listitem', l, true, now)));
  }

  showToast(message: string): void {
    this.toast.set(message);
    setTimeout(() => this.toast.set(null), 2600);
  }

  today = () => startOfDay();

  private record(entry: Entry): void {
    this.entries.update((all) => [...all, entry]);
    this.commit((db) => db.entries.add(entry), [this.outboxRow('entry', entry)]);
  }

  /**
   * Saves a change on this phone and, when the phone is linked to an online account, queues it for upload in the SAME
   * database transaction, so a change can never be saved without also being queued.
   */
  private commit(work: (db: AppDb) => Promise<unknown>, outbox: OutboxRow[]): void {
    const queued = this.syncLinked() ? outbox : [];
    this.save(() =>
      this.db
        .transaction('rw', [this.db.customers, this.db.items, this.db.entries, this.db.listItems, this.db.outbox], async () => {
          await work(this.db);
          if (queued.length) await this.enqueue(queued);
        })
        .then(() => { if (queued.length) this.revision.update((n) => n + 1); }),
    );
  }

  private outboxRow(kind: RecordKind, record: Customer | Item | Entry | ListItem, deleted = false, stamp?: number): OutboxRow {
    const { updatedAt, ...data } = record as unknown as Record<string, unknown>;
    const at = stamp ?? (kind === 'entry' ? (record as Entry).date : (updatedAt as number | undefined) ?? 1);
    return { kind, id: record.id, updatedAt: at, deleted, data };
  }

  private async enqueue(rows: OutboxRow[]): Promise<void> {
    // A newer edit to a customer or item replaces an older one still waiting, so the outbox never grows with every tap.
    for (const row of rows) {
      if (row.kind !== 'entry') await this.db.outbox.where('[kind+id]').equals([row.kind, row.id]).delete();
    }
    await this.db.outbox.bulkAdd(rows);
  }

  /** Runs a database write without blocking the screen; tells the user if the device could not save it. */
  private save(work: () => Promise<unknown>): void {
    work().catch(() => {
      this.storageOk.set(false);
      this.showToast("Couldn't save to this device");
    });
  }

  private saveProfile(): Promise<unknown> {
    return this.db.meta.put({
      key: 'profile',
      value: { shopName: this.shopName(), ownerName: this.ownerName() },
    });
  }

  private async replaceAll(customers: Customer[], items: Item[], entries: Entry[], listItems: ListItem[] = []): Promise<void> {
    this.customers.set(customers);
    this.items.set(items);
    this.entries.set(entries);
    this.listItems.set(listItems);
    await this.db.transaction('rw', [this.db.customers, this.db.items, this.db.entries, this.db.listItems, this.db.meta], async () => {
      await Promise.all([this.db.customers.clear(), this.db.items.clear(), this.db.entries.clear(), this.db.listItems.clear()]);
      await this.db.customers.bulkPut(customers);
      await this.db.items.bulkPut(items);
      await this.db.entries.bulkPut(entries);
      await this.db.listItems.bulkPut(listItems);
    });
    await this.saveProfile();
  }

  private checkCredit(customerId: string | undefined, amount: number): string | null {
    const c = customerId ? this.customer(customerId) : undefined;
    if (!c) return 'Choose who is taking this on credit.';
    if (this.balanceOf(c.id) + amount > c.creditLimit) return `That is over ${c.name}'s credit limit.`;
    return null;
  }
}
