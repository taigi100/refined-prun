import { describe, expect, it } from 'vitest';
import { getStockAlerts, getStockQuantity } from '@src/core/stock-alerts';

function storage(id: string, items: Array<[string, number]>) {
  return {
    id,
    items: items.map(([ticker, amount]) => ({
      quantity: { material: { ticker }, amount },
    })),
  } as PrunApi.Store;
}

describe('stock alerts', () => {
  it('adds quantities for the same ticker before comparing a limit', () => {
    const hrt = storage('hrt-store', [
      ['RAT', 30],
      ['RAT', 20],
    ]);

    expect(getStockQuantity(hrt, 'RAT')).toBe(50);
    expect(getStockAlerts([hrt], { 'hrt-store': { RAT: 51 } })).toEqual([
      { storeId: 'hrt-store', ticker: 'RAT', quantity: 50, threshold: 51 },
    ]);
  });

  it('reports a missing configured material as zero stock', () => {
    const hrt = storage('hrt-store', [['RAT', 100]]);

    expect(getStockAlerts([hrt], { 'hrt-store': { DW: 1 } })).toEqual([
      { storeId: 'hrt-store', ticker: 'DW', quantity: 0, threshold: 1 },
    ]);
  });

  it('does not alert when stock equals the minimum or a store is not loaded', () => {
    const hrt = storage('hrt-store', [['RAT', 50]]);

    expect(getStockAlerts([hrt], { 'hrt-store': { RAT: 50 } })).toEqual([]);
    expect(getStockAlerts([hrt], { missing: { RAT: 100 } })).toEqual([]);
  });
});
