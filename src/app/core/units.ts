import { Item } from './models';

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

/** What one selling unit costs, worked out from the price of a whole pack. */
export const costFromPack = (packPrice: number, unitsInPack: number): number => Math.round((packPrice / unitsInPack) * 100) / 100;

/** How much stock to show: "80 sticks", or "12 left" when the item has no selling unit, or "Out of stock". */
export function stockText(item: Pick<Item, 'stock' | 'unit'>): string {
  if (item.stock === 0) return 'Out of stock';
  return item.unit ? `${item.stock} ${plural(item.unit, item.stock)}` : `${item.stock} left`;
}
