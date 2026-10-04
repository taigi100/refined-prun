<script setup lang="ts">
import Active from '@src/components/forms/Active.vue';
import RadioItem from '@src/components/forms/RadioItem.vue';
import SelectInput from '@src/components/forms/SelectInput.vue';
import {
  atSameLocation,
  deserializeStorage,
  serializeStorage,
  storageSort,
} from '@src/features/XIT/ACT/actions/utils';
import ExecuteActionPackage from '@src/features/XIT/ACT/ExecuteActionPackage.vue';
import { computeResupplyBill } from '@src/features/XIT/ACT/material-groups/resupply/bill';
import type { MaterialFilter } from '@src/features/XIT/ACT/material-groups/resupply/config';
import { ActionPackageConfig, configurableValue } from '@src/features/XIT/ACT/shared-types';
import { getEntityNameFromAddress } from '@src/infrastructure/prun-api/data/addresses';
import { exchangesStore } from '@src/infrastructure/prun-api/data/exchanges';
import { materialsStore } from '@src/infrastructure/prun-api/data/materials';
import { shipsStore } from '@src/infrastructure/prun-api/data/ships';
import { sitesStore } from '@src/infrastructure/prun-api/data/sites';
import { storagesStore } from '@src/infrastructure/prun-api/data/storage';
import { warehousesStore } from '@src/infrastructure/prun-api/data/warehouses';
import { useMinBufferHeight } from '@src/hooks/use-min-buffer-height';
import { useXitParameters } from '@src/hooks/use-xit-parameters';
import { fixed0, fixed02 } from '@src/utils/format';
import { sumBy } from '@src/utils/sum-by';
import { allocateShips, type ShipAllocation, type ShipCargoTarget } from './ship-allocation';

const naturalId = useXitParameters().join(' ');
useMinBufferHeight();

const site = computed(() => sitesStore.getByPlanetNaturalIdOrName(naturalId));
const planetName = computed(() =>
  site.value ? getEntityNameFromAddress(site.value.address) : undefined,
);
const generateReturnJson = ref(false);
const agent = ref(false);
const origin = ref('Hortus Station Warehouse');
const selectedShipIds = ref<string[]>([]);

const originOptions = computed(() =>
  [...(storagesStore.nonFuelStores.value ?? [])]
    .sort(storageSort)
    .map(store => ({ label: serializeStorage(store), value: serializeStorage(store) })),
);
const originStore = computed(() => deserializeStorage(origin.value));

watch(
  originOptions,
  options => {
    if (options.length > 0 && !options.some(x => x.value === origin.value)) {
      origin.value = options[0].value;
    }
  },
  { immediate: true },
);
watch(origin, () => {
  selectedShipIds.value = [];
});

const availableShips = computed(() => {
  const source = originStore.value;
  if (!source) {
    return [] as ShipCargoTarget[];
  }
  return (shipsStore.all.value ?? [])
    .filter(ship => !ship.flightId)
    .map(ship => ({ ship, store: storagesStore.getById(ship.idShipStore) }))
    .filter(
      (entry): entry is ShipCargoTarget =>
        entry.store?.type === 'SHIP_STORE' &&
        !entry.store.locked &&
        atSameLocation(source, entry.store),
    )
    .sort((a, b) =>
      (a.ship.name ?? a.ship.registration).localeCompare(b.ship.name ?? b.ship.registration),
    );
});
const fitShipStore = computed(() =>
  selectedShipIds.value.length === 1
    ? availableShips.value.find(x => x.ship.id === selectedShipIds.value[0])?.store
    : undefined,
);
function setShipSelected(id: string, selected: boolean) {
  if (selected && !selectedShipIds.value.includes(id)) {
    selectedShipIds.value.push(id);
  } else if (!selected) {
    selectedShipIds.value = selectedShipIds.value.filter(x => x !== id);
  }
}

const defaultConfig: ActionPackageConfig = {
  materialGroups: {},
  actions: { 'CX Buy': { exchange: 'IC1' } },
};

const pkg = computed<UserData.ActionPackageData>(() => ({
  global: { name: `Burn Resupply: ${planetName.value ?? naturalId}` },
  groups: [
    {
      type: 'Resupply',
      name: 'Resupply',
      planet: planetName.value,
      days: configurableValue,
      useBaseInv: true,
    },
  ],
  actions: [
    {
      type: 'CX Buy',
      name: 'CX Buy',
      group: 'Resupply',
      exchange: configurableValue,
      useCXInv: true,
      skippable: true,
    },
  ],
}));

function planFor(config: ActionPackageConfig): {
  error?: string;
  allocations?: ShipAllocation[];
} {
  const source = originStore.value;
  if (!source || source.locked) {
    return { error: 'Select an unlocked source inventory' };
  }
  if (selectedShipIds.value.length === 0) {
    return { error: 'Select at least one ship' };
  }
  const targets = selectedShipIds.value.map(id => availableShips.value.find(x => x.ship.id === id));
  if (targets.some(x => !x)) {
    return { error: 'All selected ships must be at the source location' };
  }
  const resupplyConfig = config.materialGroups.Resupply as
    | {
        days?: number;
        materialFilter?: MaterialFilter;
      }
    | undefined;
  const days = resupplyConfig?.days;
  if (days === undefined || !Number.isFinite(days) || days <= 0) {
    return { error: 'Enter a positive number of days' };
  }
  const bill = computeResupplyBill(
    pkg.value.groups[0],
    planetName.value,
    days,
    resupplyConfig?.materialFilter,
  );
  if (!bill) {
    return { error: 'Waiting for planet burn data' };
  }
  if (Object.keys(bill).length === 0) {
    return { error: 'The base already has the requested supplies' };
  }
  for (const ticker of Object.keys(bill)) {
    if (!materialsStore.getByTicker(ticker)) {
      return { error: `Material ${ticker} is not available` };
    }
  }
  const { allocations, remaining } = allocateShips(bill, targets as ShipCargoTarget[]);
  if (Object.keys(remaining).length > 0) {
    const missing = Object.entries(remaining)
      .map(([ticker, amount]) => `${ticker} ${fixed0(amount)}`)
      .join(', ');
    return {
      error: `Load plan does not fit. Try another ship order or add a ship. Remaining: ${missing}`,
    };
  }
  const buyConfig = config.actions['CX Buy'] as { exchange?: string; skip?: boolean } | undefined;
  for (const allocation of allocations) {
    if (
      allocation.weight > source.weightCapacity + 1e-6 ||
      allocation.volume > source.volumeCapacity + 1e-6
    ) {
      return { error: `${allocation.target.ship.registration} load exceeds source capacity` };
    }
  }
  if (!buyConfig?.skip) {
    const exchangeId = buyConfig?.exchange
      ? exchangesStore.getNaturalIdFromCode(buyConfig.exchange)
      : undefined;
    const warehouse = warehousesStore.getByEntityNaturalId(exchangeId);
    if (!buyConfig?.exchange || source.id !== warehouse?.storeId) {
      return { error: 'Select the exchange warehouse as the source when CX Buy is enabled' };
    }
  } else {
    for (const [ticker, entry] of Object.entries(bill)) {
      const available = sumBy(source.items, x =>
        x.quantity?.material.ticker === ticker ? x.quantity.amount : 0,
      );
      if (available + 1e-6 < entry.quantity) {
        return { error: `Source inventory is short of ${ticker}` };
      }
    }
  }
  for (const allocation of allocations) {
    const cargoName = serializeStorage(allocation.target.store);
    if (deserializeStorage(cargoName)?.id !== allocation.target.store.id) {
      return { error: `Cannot identify cargo store for ${allocation.target.ship.registration}` };
    }
  }
  return { allocations };
}

function isPlanValid(config: ActionPackageConfig) {
  return planFor(config).error === undefined;
}

function preparePackage(config: ActionPackageConfig) {
  const plan = planFor(config);
  if (plan.error || !plan.allocations) {
    return { error: plan.error ?? 'Could not create a load plan' };
  }
  const groups: UserData.MaterialGroupData[] = [];
  const actions: UserData.ActionData[] = [];
  const finishes: UserData.ActionData[] = [];
  const buyConfig = config.actions['CX Buy'] as { exchange?: string; skip?: boolean };
  for (const allocation of plan.allocations) {
    const { ship, store } = allocation.target;
    const group = `Load ${ship.registration}`;
    const destination = serializeStorage(store);
    groups.push({
      type: 'Manual',
      name: group,
      planet: naturalId,
      materials: allocation.materials,
    });
    if (!buyConfig.skip) {
      actions.push({
        type: 'CX Buy',
        name: `Buy ${ship.registration}`,
        group,
        exchange: buyConfig.exchange,
        useCXInv: true,
      });
    }
    actions.push({
      type: 'MTRA',
      name: group,
      group,
      origin: origin.value,
      dest: destination,
      noSfc: true,
      requireFull: true,
    });
    const expectedCargo: Record<string, number> = {};
    for (const [ticker, amount] of Object.entries(allocation.materials)) {
      const existing = sumBy(store.items, x =>
        x.quantity?.material.ticker === ticker ? x.quantity.amount : 0,
      );
      expectedCargo[ticker] = existing + amount;
    }
    finishes.push({
      type: 'MTRA',
      name: `Finish ${ship.registration}`,
      group,
      origin: origin.value,
      dest: destination,
      finishOnly: true,
      expectedCargo,
      postToAgent: agent.value,
      printOffloadJson: generateReturnJson.value,
      sfcDestination: naturalId,
    });
  }
  return {
    pkg: {
      global: pkg.value.global,
      groups,
      actions: [...actions, ...finishes],
    } as UserData.ActionPackageData,
  };
}

function allocationText(allocation: ShipAllocation) {
  const parts = Object.entries(allocation.materials)
    .map(([ticker, amount]) => `${ticker} ${fixed0(amount)}`)
    .join(', ');
  return `${parts} (${fixed02(allocation.weight)}t, ${fixed02(allocation.volume)}m³)`;
}
</script>

<template>
  <div v-if="!planetName">Planet "{{ naturalId }}" not found.</div>
  <ExecuteActionPackage
    v-else
    :pkg="pkg"
    :default-config="defaultConfig"
    :extra-config-valid="isPlanValid"
    :fit-ship-store="fitShipStore"
    :prepare-package="preparePackage">
    <template #extra="{ config }">
      <Active label="From">
        <SelectInput v-model="origin" :options="originOptions" />
      </Active>
      <div :class="$style.ships">
        <div>Ships at source (select in load order)</div>
        <div v-if="availableShips.length === 0">No ships available at this location.</div>
        <div v-for="target in availableShips" :key="target.ship.id" :class="$style.shipRow">
          <RadioItem
            :model-value="selectedShipIds.includes(target.ship.id)"
            horizontal
            @update:model-value="selected => setShipSelected(target.ship.id, selected)">
            {{ target.ship.name ?? target.ship.registration }}
          </RadioItem>
          <span>
            {{ fixed02(target.store.weightCapacity - target.store.weightLoad) }}t,
            {{ fixed02(target.store.volumeCapacity - target.store.volumeLoad) }}m³ free
          </span>
          <span v-if="selectedShipIds.includes(target.ship.id)">
            #{{ selectedShipIds.indexOf(target.ship.id) + 1 }}
          </span>
        </div>
      </div>
      <div :class="$style.plan">
        <div v-if="planFor(config).error">{{ planFor(config).error }}</div>
        <div
          v-for="allocation in planFor(config).allocations ?? []"
          :key="allocation.target.ship.id">
          {{ allocation.target.ship.name ?? allocation.target.ship.registration }}:
          {{ allocationText(allocation) }}
        </div>
      </div>
      <Active label="Generate Return JSON">
        <RadioItem v-model="generateReturnJson">generate return json for each ship</RadioItem>
      </Active>
      <Active label="Agent">
        <RadioItem v-model="agent">post offload package for each ship</RadioItem>
      </Active>
    </template>
  </ExecuteActionPackage>
</template>

<style module>
.ships,
.plan {
  margin: 6px 8px;
}

.shipRow {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 3px;
}

.shipRow > span {
  white-space: nowrap;
}

.plan {
  color: #f7a600;
}
</style>
