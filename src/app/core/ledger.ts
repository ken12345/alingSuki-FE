import { Injectable, computed, inject, signal } from '@angular/core';
import { AppDb } from './db';
import { daysAgo, startOfDay } from './format';
import { Backup, Customer, Entry, Item, Line, Method, OutboxRow, RecordKind, RemoteChange } from './models';

const OVERDUE_AFTER_DAYS = 7;

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

  readonly lowStock = computed(() => this.items().filter((i) => i.stock <= 5));

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
      const [customers, items, entries, profile] = await Promise.all([
        this.db.customers.toArray(), this.db.items.toArray(), this.db.entries.toArray(), this.db.meta.get('profile'),
      ]);
      this.customers.set(customers);
      this.items.set(items);
      this.entries.set(entries);
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
    this.shopName.set('My store');
    this.ownerName.set('there');
    await this.db.transaction('rw', [this.db.customers, this.db.items, this.db.entries, this.db.meta, this.db.outbox], async () => {
      await Promise.all([this.db.customers.clear(), this.db.items.clear(), this.db.entries.clear(), this.db.meta.clear(), this.db.outbox.clear()]);
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
      customers: this.customers(), items: this.items(), entries: this.entries(),
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
    this.save(() => this.replaceAll(data.customers!, data.items!, data.entries!));
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
    for (const item of this.items()) {
      const qty = cart[item.id];
      if (!qty) continue;
      lines.push({ name: item.name, qty, amount: item.price * qty });
      amount += item.price * qty;
      profit += (item.price - item.cost) * qty;
    }
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
    const soldItems = this.items().filter((i) => cart[i.id]).map((i) => ({ ...i, stock: Math.max(0, i.stock - cart[i.id]), updatedAt: now }));
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

  addItem(emoji: string, name: string, price: number, cost: number, stock: number): string | null {
    if (!name.trim() || !(price > 0)) return 'Enter a name and a price.';
    const item: Item = { id: crypto.randomUUID(), emoji: emoji || '🛍️', name: name.trim(), price, cost: cost || 0, stock: stock || 0, updatedAt: Date.now() };
    this.items.update((all) => [...all, item]);
    this.commit((db) => db.items.put(item), [this.outboxRow('item', item)]);
    return null;
  }

  /** Replaces an existing item's details (price, cost, stock, name). Returns an error message, or null on success. */
  updateItem(item: Item): string | null {
    if (!item.name.trim() || !(item.price > 0)) return 'Enter a name and a price.';
    if (item.stock < 0 || item.cost < 0) return 'Cost and stock cannot be negative.';
    const clean: Item = { ...item, name: item.name.trim(), updatedAt: Date.now() };
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
    const customers = new Map(this.customers().map((c) => [c.id, c]));
    const items = new Map(this.items().map((i) => [i.id, i]));
    const entryIds = new Set(this.entries().map((e) => e.id));
    const newEntries: Entry[] = [];
    const putCustomers: Customer[] = [], putItems: Item[] = [];
    const deleteCustomers: string[] = [], deleteItems: string[] = [];

    for (const change of changes) {
      if (change.kind === 'entry') {
        if (!entryIds.has(change.id)) { entryIds.add(change.id); newEntries.push(change.data as Entry); }
        continue;
      }
      const table = change.kind === 'customer' ? customers : items;
      const local = table.get(change.id);
      if (local && (local.updatedAt ?? 0) > change.updatedAt) continue;
      if (change.deleted) {
        table.delete(change.id);
        (change.kind === 'customer' ? deleteCustomers : deleteItems).push(change.id);
      } else if (change.kind === 'customer') {
        const record = { ...(change.data as Customer), updatedAt: change.updatedAt };
        customers.set(record.id, record);
        putCustomers.push(record);
      } else {
        const record = { ...(change.data as Item), updatedAt: change.updatedAt };
        items.set(record.id, record);
        putItems.push(record);
      }
    }

    await this.db.transaction('rw', [this.db.customers, this.db.items, this.db.entries], async () => {
      await this.db.customers.bulkDelete(deleteCustomers);
      await this.db.items.bulkDelete(deleteItems);
      await this.db.customers.bulkPut(putCustomers);
      await this.db.items.bulkPut(putItems);
      await this.db.entries.bulkPut(newEntries);
    });
    this.customers.set([...customers.values()]);
    this.items.set([...items.values()]);
    if (newEntries.length) this.entries.update((all) => [...all, ...newEntries]);
  }

  /** The first time a phone links to an online account, everything already on it is queued for upload. */
  async enqueueEverything(): Promise<void> {
    // Records from before edits were timestamped get the earliest possible time, so a newer copy on the server wins.
    const customers = this.customers().map((c) => ({ ...c, updatedAt: c.updatedAt ?? 1 }));
    const items = this.items().map((i) => ({ ...i, updatedAt: i.updatedAt ?? 1 }));
    await this.db.transaction('rw', [this.db.customers, this.db.items, this.db.entries, this.db.outbox], async () => {
      await this.db.customers.bulkPut(customers);
      await this.db.items.bulkPut(items);
      await this.enqueue([
        ...customers.map((c) => this.outboxRow('customer', c)),
        ...items.map((i) => this.outboxRow('item', i)),
        ...this.entries().map((e) => this.outboxRow('entry', e)),
      ]);
    });
    this.customers.set(customers);
    this.items.set(items);
    this.revision.update((n) => n + 1);
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
        .transaction('rw', [this.db.customers, this.db.items, this.db.entries, this.db.outbox], async () => {
          await work(this.db);
          if (queued.length) await this.enqueue(queued);
        })
        .then(() => { if (queued.length) this.revision.update((n) => n + 1); }),
    );
  }

  private outboxRow(kind: RecordKind, record: Customer | Item | Entry, deleted = false, stamp?: number): OutboxRow {
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

  private async replaceAll(customers: Customer[], items: Item[], entries: Entry[]): Promise<void> {
    this.customers.set(customers);
    this.items.set(items);
    this.entries.set(entries);
    await this.db.transaction('rw', [this.db.customers, this.db.items, this.db.entries, this.db.meta], async () => {
      await Promise.all([this.db.customers.clear(), this.db.items.clear(), this.db.entries.clear()]);
      await this.db.customers.bulkPut(customers);
      await this.db.items.bulkPut(items);
      await this.db.entries.bulkPut(entries);
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
