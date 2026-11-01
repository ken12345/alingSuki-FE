import { Injectable } from '@angular/core';
import Dexie, { Table } from 'dexie';
import { Customer, Entry, Item, OutboxRow } from './models';

export interface MetaRow {
  key: string;
  value: unknown;
}

/** The device-local database. Every ledger change is written here first, so the app works with no signal. */
@Injectable({ providedIn: 'root' })
export class AppDb extends Dexie {
  customers!: Table<Customer, string>;
  items!: Table<Item, string>;
  entries!: Table<Entry, string>;
  meta!: Table<MetaRow, string>;
  /** Changes not yet sent to the server (only used once the phone is linked to an online account). */
  outbox!: Table<OutboxRow, number>;

  constructor() {
    super('aling-suki');
    this.version(1).stores({
      customers: 'id',
      items: 'id',
      entries: 'id, customerId, date',
      meta: 'key',
    });
    this.version(2).stores({
      outbox: '++seq, [kind+id]',
    });
  }
}
