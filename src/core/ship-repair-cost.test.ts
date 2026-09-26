import { describe, expect, it } from 'vitest';
import { calculateShipRepairCost } from '@src/core/ship-repair-cost';

describe('calculateShipRepairCost', () => {
  it('scales the current repair bill to 80% condition and planned damage', () => {
    const cost = calculateShipRepairCost(0.9, 100, 0.01)!;

    expect(cost.repairAtCondition).toBeCloseTo(200);
    expect(cost.routeRepair).toBeCloseTo(10);
  });

  it('uses the 80% repair bill directly at the repair threshold', () => {
    const cost = calculateShipRepairCost(0.8, 200, 0.03)!;

    expect(cost.repairAtCondition).toBeCloseTo(200);
    expect(cost.routeRepair).toBeCloseTo(30);
  });

  it('requires a current repair bill to calculate an estimate', () => {
    expect(calculateShipRepairCost(1, 0, 0.01)).toBeUndefined();
  });
});
