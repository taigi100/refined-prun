import { materialsStore } from '@src/infrastructure/prun-api/data/materials';
import type { MaterialBill } from '@src/features/XIT/ACT/material-bill';
import { sumBy } from '@src/utils/sum-by';

export interface ShipCargoTarget {
  ship: PrunApi.Ship;
  store: PrunApi.Store;
}

export interface ShipAllocation {
  target: ShipCargoTarget;
  materials: Record<string, number>;
  weight: number;
  volume: number;
}

export function allocateShips(bill: MaterialBill, targets: ShipCargoTarget[]) {
  const allocations: ShipAllocation[] = targets.map(target => ({
    target,
    materials: {},
    weight: 0,
    volume: 0,
  }));
  const remaining = Object.fromEntries(
    Object.entries(bill).map(([ticker, entry]) => [ticker, entry.quantity]),
  );
  const totalWeight = sumBy(targets, x => Math.max(0, x.store.weightCapacity - x.store.weightLoad));
  const totalVolume = sumBy(targets, x => Math.max(0, x.store.volumeCapacity - x.store.volumeLoad));

  // Place the most capacity-limited materials first, then fill ships in selection order.
  const tickers = Object.keys(remaining).sort((a, b) => {
    const first = materialsStore.getByTicker(a)!;
    const second = materialsStore.getByTicker(b)!;
    const firstSize = Math.max(
      first.weight / Math.max(totalWeight, 1e-6),
      first.volume / Math.max(totalVolume, 1e-6),
    );
    const secondSize = Math.max(
      second.weight / Math.max(totalWeight, 1e-6),
      second.volume / Math.max(totalVolume, 1e-6),
    );
    const difference = secondSize - firstSize;
    return difference !== 0 ? difference : a.localeCompare(b);
  });

  for (const allocation of allocations) {
    let freeWeight = Math.max(
      0,
      allocation.target.store.weightCapacity - allocation.target.store.weightLoad,
    );
    let freeVolume = Math.max(
      0,
      allocation.target.store.volumeCapacity - allocation.target.store.volumeLoad,
    );
    for (const ticker of tickers) {
      const material = materialsStore.getByTicker(ticker)!;
      const byWeight =
        material.weight > 0 ? Math.floor((freeWeight + 1e-6) / material.weight) : Infinity;
      const byVolume =
        material.volume > 0 ? Math.floor((freeVolume + 1e-6) / material.volume) : Infinity;
      const amount = Math.min(remaining[ticker], byWeight, byVolume);
      if (amount <= 0) {
        continue;
      }
      allocation.materials[ticker] = amount;
      allocation.weight += amount * material.weight;
      allocation.volume += amount * material.volume;
      remaining[ticker] -= amount;
      freeWeight -= amount * material.weight;
      freeVolume -= amount * material.volume;
    }
  }

  return {
    allocations: allocations.filter(x => Object.keys(x.materials).length > 0),
    remaining: Object.fromEntries(Object.entries(remaining).filter(([, amount]) => amount > 0)),
  };
}
