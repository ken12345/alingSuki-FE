export type Method = 'cash' | 'gcash' | 'credit';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  creditLimit: number;
}

export interface Item {
  id: string;
  emoji: string;
  name: string;
  price: number;
  cost: number;
  stock: number;
}

export interface Line {
  name: string;
  qty: number;
  amount: number;
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
