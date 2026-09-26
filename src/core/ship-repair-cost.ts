export const shipRepairCondition = 0.8;

export interface ShipRepairCost {
  repairAtCondition: number;
  routeRepair: number;
}

export function calculateShipRepairCost(
  condition: number,
  currentRepairCost: number,
  routeDamage: number,
): ShipRepairCost | undefined {
  const currentDamage = 1 - condition;
  const repairDamage = 1 - shipRepairCondition;
  if (
    !Number.isFinite(currentDamage) ||
    !Number.isFinite(currentRepairCost) ||
    !Number.isFinite(routeDamage) ||
    currentDamage <= 0 ||
    routeDamage < 0
  ) {
    return undefined;
  }

  const repairAtCondition = currentRepairCost * (repairDamage / currentDamage);
  return {
    repairAtCondition,
    routeRepair: repairAtCondition * (routeDamage / repairDamage),
  };
}
