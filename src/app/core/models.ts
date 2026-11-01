export type Method = 'cash' | 'gcash' | 'credit';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  creditLimit: number;
  /** When this customer was last edited on a phone (ms). Used to settle edits made on two phones. Missing on old records. */
  updatedAt?: number;
}

export interface Item {
  id: string;
  emoji: string;
  name: string;
  price: number;
  cost: number;
  stock: number;
  /** When this item was last edited on a phone (ms). Missing on old records. */
  updatedAt?: number;
}

export interface Line {
  name: string;
  qty: number;
  amount: number;
}

export type RecordKind = 'customer' | 'item' | 'entry';

/** A change waiting to be sent to the server. Written in the same transaction as the change itself. */
export interface OutboxRow {
  seq?: number;
  kind: RecordKind;
  id: string;
  updatedAt: number;
  deleted: boolean;
  data: unknown;
}

/** A change received from the server. */
export interface RemoteChange {
  kind: RecordKind;
  id: string;
  data: unknown;
  updatedAt: number;
  deleted: boolean;
  seq: number;
}

/** The backup file: everything on this device, as one JSON document. */
export interface Backup {
  app: 'aling-suki';
  version: 1;
  exportedAt: number;
  profile: { shopName: string; ownerName: string };
  customers: Customer[];
  items: Item[];
  entries: Entry[];
}

/** A ledger row. A customer's balance is always derived from these, never stored. */
export interface Entry {
  id: string;
  customerId?: string;
  type: 'sale' | 'charge' | 'payment';
  method: Method;
  amount: number;
  profit: number;
  note: string;
  date: number;
  lines: Line[];
}
