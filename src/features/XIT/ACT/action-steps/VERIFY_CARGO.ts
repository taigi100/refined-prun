import { act } from '@src/features/XIT/ACT/act-registry';
import { shipsStore } from '@src/infrastructure/prun-api/data/ships';
import { storagesStore } from '@src/infrastructure/prun-api/data/storage';
import { fixed0 } from '@src/utils/format';
import { sumBy } from '@src/utils/sum-by';

interface Data {
  shipId: string;
  expected: Record<string, number>;
}

export const VERIFY_CARGO = act.addActionStep<Data>({
  type: 'VERIFY_CARGO',
  description: data => {
    const ship = shipsStore.getById(data.shipId);
    return `Check cargo loaded on ${ship?.name ?? ship?.registration ?? 'unknown ship'}`;
  },
  execute: async ctx => {
    const ship = shipsStore.getById(ctx.data.shipId);
    const store = storagesStore.getById(ship?.idShipStore);
    if (!store) {
      return ctx.fail('Ship cargo store not found');
    }
    for (const [ticker, expected] of Object.entries(ctx.data.expected)) {
      const actual = sumBy(store.items, item =>
        item.quantity?.material.ticker === ticker ? item.quantity.amount : 0,
      );
      if (actual + 1e-6 < expected) {
        ctx.fail(
          `${ticker} load is short on ${ship?.name ?? ship?.registration}: ${fixed0(actual)} of ${fixed0(expected)} expected`,
        );
      }
    }
    ctx.complete();
  },
});
