export type Method = 'cash' | 'gcash' | 'credit';

export interface Customer {
  id: string;
  name: string;
  phone: string;
  creditLimit: number;
  /** When this customer was last edited on a phone (ms). Used to settle edits made on two phones. Missing on old records. */
  updatedAt?: number;
}

/** One way of selling an item: this many pieces for this price (3 pieces for 5 pesos). */
export interface SellOption {
  qty: number;
  price: number;
}

export interface Item {
  id: string;
  emoji: string;
  name: string;
  price: number;
  cost: number;
  stock: number;
  /** A small square JPEG thumbnail as a data URL (see image.ts). When missing, the emoji is shown instead. */
  photo?: string;
  /**
   * Stock is counted in the unit the shop SELLS: "stick", "cup", "sachet". When missing it is plain pieces.
   */
  unit?: string;
  /**
   * The price is for this many selling units at a time: 5 pesos for every 3 pieces is price 5 with sellQty 3. Missing means 1.
   * Stock and the sales records always count single units (pieces), never sets.
   */
  sellQty?: number;
  /** Other prices for the same item next to its regular one: 1 piece for 2 pesos (price) and also 3 for 5 pesos (a deal). Up to 3. */
  deals?: SellOption[];
  /** The bigger unit the item is BOUGHT in ("pack", "bottle", "gallon"), and how many selling units are inside it. */
  buyUnit?: string;
  perBuyUnit?: number;
  /** The price of one buying unit. The cost of one selling unit (cost) is worked out from it. */
  buyCost?: number;
  /** When this item was last edited on a phone (ms). Missing on old records. */
  updatedAt?: number;
}

/** Everything about an item except the id and the time it was last edited. */
export type ItemDetails = Omit<Item, 'id' | 'updatedAt'>;

/** One line on the shopping list: something to buy at the market. */
export interface ListItem {
  id: string;
  name: string;
  /** How many to buy. */
  qty: number;
  /** Ticked as bought (it moves to "In the basket"). */
  done: boolean;
  /** The item in the shop this line is for. Buying it can then be added to that item's stock. */
  itemId?: string;
  updatedAt?: number;
}

export interface Line {
  name: string;
  qty: number;
  amount: number;
}

export type RecordKind = 'customer' | 'item' | 'entry' | 'listitem';

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
  /** Older backup files do not have it. */
  shoppingList?: ListItem[];
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
