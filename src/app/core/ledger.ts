import { Injectable, computed, signal } from '@angular/core';
import { AppDb } from './db';
import { DAY, HOUR, daysAgo, startOfDay } from './format';
import { Backup, Customer, Entry, Item, Line, Method } from './models';

const OVERDUE_AFTER_DAYS = 7;

function seedItems(): Item[] {
  return [
    { id: 'i1', emoji: '🚬', name: 'Cigarettes', price: 10, cost: 8, stock: 80 },
    { id: 'i2', emoji: '☕', name: 'Coffee sachet', price: 8, cost: 6, stock: 45 },
    { id: 'i3', emoji: '🍜', name: 'Lucky Me', price: 16, cost: 12, stock: 3 },
    { id: 'i4', emoji: '🥚', name: 'Egg', price: 9, cost: 7, stock: 4 },
    { id: 'i5', emoji: '🍬', name: 'Candy', price: 1, cost: 0.6, stock: 200 },
    { id: 'i6', emoji: '🧼', name: 'Soap', price: 22, cost: 18, stock: 12 },
    { id: 'i7', emoji: '🥤', name: 'Softdrink', price: 15, cost: 11, stock: 30 },
    { id: 'i8', emoji: '🍚', name: 'Rice /kg', price: 58, cost: 52, stock: 25 },
  ];
}

function seedCustomers(): Customer[] {
  return [
    { id: 'c1', name: 'Mang Rudy', phone: '+639171234567', creditLimit: 2000 },
    { id: 'c2', name: 'Ate Lita', phone: '+639181112233', creditLimit: 1500 },
    { id: 'c3', name: 'Jun dela Cruz', phone: '+639201234000', creditLimit: 1000 },
    { id: 'c4', name: 'Kuya Boy', phone: '+639175550101', creditLimit: 1000 },
    { id: 'c5', name: 'Aling Maring', phone: '+639189990202', creditLimit: 800 },
    { id: 'c6', name: 'Ate Joy', phone: '+639221110303', creditLimit: 500 },
    { id: 'c7', name: 'Kuya Ben', phone: '+639334440404', creditLimit: 500 },
  ];
}

function seedEntries(items: Item[]): Entry[] {
  const now = Date.now();
  const out: Entry[] = [];
  let n = 0;
  const id = () => `e${++n}`;

  // About three sale rows a day for the past week, so the summary has something to show.
  for (let d = 0; d < 7; d++) {
    for (let k = 0; k < 3; k++) {
      const lines: Line[] = [];
      let amount = 0;
      let profit = 0;
      for (let j = 0; j < 4; j++) {
        const item = items[(d + k * 2 + j * 3) % items.length];
        const qty = (((d * 7 + k * 3 + j) % 5) + 1) * 4;
        lines.push({ name: item.name, qty, amount: item.price * qty });
        amount += item.price * qty;
        profit += (item.price - item.cost) * qty;
      }
      out.push({
        id: id(), type: 'sale', method: k === 2 ? 'gcash' : 'cash',
        amount, profit, note: '', date: now - d * DAY - (k + 1) * HOUR, lines,
      });
    }
  }

  const credit = (customerId: string, amount: number, days: number, note: string) =>
    out.push({ id: id(), customerId, type: 'charge', method: 'credit', amount, profit: Math.round(amount * 0.2), note, date: now - days * DAY, lines: [] });
  const pay = (customerId: string, amount: number, days: number, method: Method = 'cash') =>
    out.push({ id: id(), customerId, type: 'payment', method, amount, profit: 0, note: '', date: now - days * DAY, lines: [] });

  credit('c1', 1235, 14, 'Rice, canned goods'); credit('c1', 120, 12, 'Rice 2 kg');
  pay('c1', 300, 10); credit('c1', 185, 3, 'Cigarettes, coffee');
  credit('c2', 680, 9, 'Groceries');
  credit('c3', 420, 0, 'Noodles, eggs');
  credit('c4', 400, 6, 'Soap, softdrinks'); pay('c4', 250, 2, 'gcash');
  credit('c5', 200, 4, 'Coffee'); pay('c5', 200, 3);
  return out;
}

@Injectable({ providedIn: 'root' })
export class Ledger {
  private readonly db = new AppDb();

  readonly shopName = signal("Aling Nena's Store");
  readonly ownerName = signal('Aling Nena');
  readonly loggedIn = signal(false);
  readonly online = signal(typeof navigator === 'undefined' ? true : navigator.onLine);
  readonly toast = signal<string | null>(null);
  /** False when the browser refused local storage (private mode, no space); data then lives only until the tab closes. */
  readonly storageOk = signal(true);
  /** True when the browser promised not to clear this app's data on its own. */
  readonly persisted = signal(false);

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

  /** Loads everything from this device. The very first run starts with sample data so the screens are not empty. */
  async init(): Promise<void> {
    try {
      await this.db.open();
      const [customers, items, entries, profile, seeded] = await Promise.all([
        this.db.customers.toArray(), this.db.items.toArray(), this.db.entries.toArray(),
        this.db.meta.get('profile'), this.db.meta.get('seeded'),
      ]);
      if (!seeded) {
        this.useSample();
        this.loggedIn.set(true);
        await this.db.transaction('rw', [this.db.customers, this.db.items, this.db.entries, this.db.meta], async () => {
          await this.db.customers.bulkPut(this.customers());
          await this.db.items.bulkPut(this.items());
          await this.db.entries.bulkPut(this.entries());
          await this.db.meta.put({ key: 'seeded', value: true });
        });
        await this.saveProfile();
      } else {
        this.customers.set(customers);
        this.items.set(items);
        this.entries.set(entries);
        const p = profile?.value as { shopName: string; ownerName: string; loggedIn: boolean } | undefined;
        if (p) { this.shopName.set(p.shopName); this.ownerName.set(p.ownerName); this.loggedIn.set(p.loggedIn); }
      }
      this.persisted.set((await navigator.storage?.persist?.()) ?? false);
    } catch {
      this.storageOk.set(false);
      if (!this.customers().length) { this.useSample(); this.loggedIn.set(true); }
    }
  }

  signIn(): void {
    this.loggedIn.set(true);
    this.save(() => this.saveProfile());
  }

  signOut(): void {
    this.loggedIn.set(false);
    this.save(() => this.saveProfile());
  }

  /** A new account starts with an empty ledger. */
  register(shopName: string, ownerName: string): void {
    this.shopName.set(shopName);
    this.ownerName.set(ownerName);
    this.loggedIn.set(true);
    this.save(() => this.replaceAll([], [], []));
  }

  eraseAll(): void {
    this.save(() => this.replaceAll([], [], []));
  }

  loadSample(): void {
    this.useSample();
    this.save(() => this.replaceAll(this.customers(), this.items(), this.entries()));
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
    this.record({
      id: crypto.randomUUID(), customerId: method === 'credit' ? customerId : undefined,
      type: method === 'credit' ? 'charge' : 'sale', method, amount, profit, note: '', date: Date.now(), lines,
    });
    this.items.update((all) => all.map((i) => (cart[i.id] ? { ...i, stock: Math.max(0, i.stock - cart[i.id]) } : i)));
    this.save(() => this.db.items.bulkPut(this.items()));
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
    const customer: Customer = { id: crypto.randomUUID(), name: name.trim(), phone, creditLimit: 1000 };
    this.customers.update((all) => [...all, customer]);
    this.save(() => this.db.customers.put(customer));
    return null;
  }

  addItem(emoji: string, name: string, price: number, cost: number, stock: number): string | null {
    if (!name.trim() || !(price > 0)) return 'Enter a name and a price.';
    const item: Item = { id: crypto.randomUUID(), emoji: emoji || '🛍️', name: name.trim(), price, cost: cost || 0, stock: stock || 0 };
    this.items.update((all) => [...all, item]);
    this.save(() => this.db.items.put(item));
    return null;
  }

  /** Replaces an existing item's details (price, cost, stock, name). Returns an error message, or null on success. */
  updateItem(item: Item): string | null {
    if (!item.name.trim() || !(item.price > 0)) return 'Enter a name and a price.';
    if (item.stock < 0 || item.cost < 0) return 'Cost and stock cannot be negative.';
    const clean: Item = { ...item, name: item.name.trim() };
    this.items.update((all) => all.map((i) => (i.id === clean.id ? clean : i)));
    this.save(() => this.db.items.put(clean));
    return null;
  }

  showToast(message: string): void {
    this.toast.set(message);
    setTimeout(() => this.toast.set(null), 2600);
  }

  today = () => startOfDay();

  private useSample(): void {
    const items = seedItems();
    this.items.set(items);
    this.customers.set(seedCustomers());
    this.entries.set(seedEntries(items));
  }

  private record(entry: Entry): void {
    this.entries.update((all) => [...all, entry]);
    this.save(() => this.db.entries.add(entry));
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
      value: { shopName: this.shopName(), ownerName: this.ownerName(), loggedIn: this.loggedIn() },
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
      await this.db.meta.put({ key: 'seeded', value: true });
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
