import Dexie, { Table } from 'dexie';
import { Customer, Entry, Item } from './models';

export interface MetaRow {
  key: string;
  value: unknown;
}

/** The device-local database. Every ledger change is written here first, so the app works with no signal. */
export class AppDb extends Dexie {
  customers!: Table<Customer, string>;
  items!: Table<Item, string>;
  entries!: Table<Entry, string>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super('aling-suki');
    this.version(1).stores({
      customers: 'id',
      items: 'id',
      entries: 'id, customerId, date',
      meta: 'key',
    });
  }
}
