import { Item, SellOption } from './models';

/** "stick" -> "sticks", "box" -> "boxes", "candy" -> "candies". One of anything keeps the word as it is. */
export function plural(word: string, n: number): string {
  if (n === 1) return word;
  if (/(s|x|z|ch|sh)$/i.test(word)) return word + 'es';
  if (/[^aeiou]y$/i.test(word)) return word.slice(0, -1) + 'ies';
  return word + 's';
}

/** True when the item is bought in a bigger unit than it is sold in (a pack of 20 sticks, a bottle of 10 cups). */
export const hasBuyUnit = (item: Pick<Item, 'buyUnit' | 'perBuyUnit'>): boolean => !!item.buyUnit && (item.perBuyUnit ?? 0) >= 1;

/** How many selling units one buying unit holds. 1 when the item is bought and sold in the same unit. */
export const perPack = (item: Pick<Item, 'buyUnit' | 'perBuyUnit'>): number => (hasBuyUnit(item) ? (item.perBuyUnit as number) : 1);

/** What one selling unit costs, worked out from the price of a whole pack. Kept to four decimals so a set of 3 is not off by a centavo. */
export const costFromPack = (packPrice: number, unitsInPack: number): number => Math.round((packPrice / unitsInPack) * 10_000) / 10_000;

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** How many selling units one selling price covers: 3 when candy is "5 pesos for every 3 pieces", otherwise 1. */
export const setSize = (item: Pick<Item, 'sellQty'>): number => (item.sellQty && item.sellQty > 1 ? item.sellQty : 1);

/** True when there is enough stock for one more sale (one whole set). */
export const canSell = (item: Pick<Item, 'stock' | 'sellQty'>): boolean => item.stock >= setSize(item);

/** What you earn on one sale of this item: its price minus the cost of the pieces in it. */
export const profitPerSet = (item: Pick<Item, 'price' | 'cost' | 'sellQty'>): number => round2(item.price - item.cost * setSize(item));

/** Every way the item can be sold, regular price first: [1 piece for 2 pesos, 3 pieces for 5 pesos]. */
export const optionsOf = (item: Pick<Item, 'price' | 'sellQty' | 'deals'>): SellOption[] => [{ qty: setSize(item), price: item.price }, ...(item.deals ?? [])];

/** What a sale of this option earns: its price minus the cost of the pieces in it. */
export const profitOf = (item: Pick<Item, 'cost'>, option: SellOption): number => round2(option.price - item.cost * option.qty);

/** How a number of pieces was priced: how many times each price was used. */
export interface PriceBreakdown {
  total: number;
  parts: { qty: number; price: number; count: number }[];
}

/**
 * What a customer pays for `pieces` of an item, using the cheapest mix of its prices. With 1 piece for 2 pesos and 3 pieces for 5:
 * 1 piece is 2, 2 are 4, 3 are 5, 4 are 7 (a set of 3 plus one more), 5 are 9, 6 are 10. If a bundle is not actually cheaper than
 * buying the pieces one by one, it is simply not used. Works in whole centavos so the total never drifts.
 */
export function priceFor(item: Pick<Item, 'price' | 'sellQty' | 'deals'>, pieces: number): PriceBreakdown {
  // Bigger bundles come first so that when two mixes cost the same, the one with fewer, bigger sets is shown.
  const options = optionsOf(item)
    .map((o) => ({ qty: o.qty, price: o.price, cents: Math.round(o.price * 100) }))
    .sort((x, y) => y.qty - x.qty);
  const cheapest: number[] = new Array(pieces + 1).fill(Infinity);
  const used: number[] = new Array(pieces + 1).fill(-1);
  cheapest[0] = 0;
  for (let n = 1; n <= pieces; n++) {
    options.forEach((o, i) => {
      if (o.qty <= n && cheapest[n - o.qty] + o.cents < cheapest[n]) {
        cheapest[n] = cheapest[n - o.qty] + o.cents;
        used[n] = i;
      }
    });
  }
  if (!Number.isFinite(cheapest[pieces])) {
    // Not reachable with the prices on offer (a count that is not a multiple of the smallest set): price it pro rata.
    const main = optionsOf(item)[0];
    return { total: round2((main.price * pieces) / main.qty), parts: [] };
  }
  const counts = new Map<number, number>();
  for (let n = pieces; n > 0; n -= options[used[n]].qty) counts.set(used[n], (counts.get(used[n]) ?? 0) + 1);
  return {
    total: cheapest[pieces] / 100,
    parts: [...counts].map(([i, count]) => ({ qty: options[i].qty, price: options[i].price, count })).sort((x, y) => y.qty - x.qty),
  };
}

/** "3 for ₱5 + ₱2" or "2 x 3 for ₱5": the working behind a total, so the owner can check it at a glance. */
export function breakdownText(parts: PriceBreakdown['parts']): string {
  const money = (n: number) => '₱' + n.toLocaleString('en-PH', { maximumFractionDigits: 2 });
  return parts
    .map((p) => {
      const each = p.qty > 1 ? `${p.qty} for ${money(p.price)}` : money(p.price);
      return p.count > 1 ? `${p.count} × ${each}` : each;
    })
    .join(' + ');
}

/** What follows one of an item's prices on screen: " / 3 pieces", " / piece", " / stick", or nothing. */
export function optionSuffix(item: Pick<Item, 'unit' | 'deals'>, option: SellOption): string {
  if (option.qty > 1) return ` / ${option.qty} ${plural(item.unit || 'piece', option.qty)}`;
  // With more than one price on offer, "1 piece" has to be said out loud so it is not mistaken for the bundle.
  if (item.unit || item.deals?.length) return ` / ${item.unit || 'piece'}`;
  return '';
}

/** " / 3 pieces", " / stick", or nothing: what follows the price on screen. */
export function priceSuffix(item: Pick<Item, 'sellQty' | 'unit'>): string {
  const n = setSize(item);
  if (n > 1) return ` / ${n} ${plural(item.unit || 'piece', n)}`;
  return item.unit ? ` / ${item.unit}` : '';
}

/** How much stock to show: "80 sticks", or "12 left" when the item has no selling unit, or "Out of stock". */
export function stockText(item: Pick<Item, 'stock' | 'unit'>): string {
  if (item.stock === 0) return 'Out of stock';
  return item.unit ? `${item.stock} ${plural(item.unit, item.stock)}` : `${item.stock} left`;
}
