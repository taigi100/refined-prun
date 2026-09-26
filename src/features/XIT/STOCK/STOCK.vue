<script setup lang="ts">
import LoadingSpinner from '@src/components/LoadingSpinner.vue';
import PrunButton from '@src/components/PrunButton.vue';
import SectionHeader from '@src/components/SectionHeader.vue';
import Active from '@src/components/forms/Active.vue';
import Commands from '@src/components/forms/Commands.vue';
import NumberInput from '@src/components/forms/NumberInput.vue';
import TextInput from '@src/components/forms/TextInput.vue';
import { activeStockAlerts, getStockQuantity } from '@src/core/stock-alerts';
import { getInvStore } from '@src/core/store-id';
import { useXitParameters } from '@src/hooks/use-xit-parameters';
import { getEntityNameFromAddress } from '@src/infrastructure/prun-api/data/addresses';
import { materialsStore } from '@src/infrastructure/prun-api/data/materials';
import { storagesStore } from '@src/infrastructure/prun-api/data/storage';
import { warehousesStore } from '@src/infrastructure/prun-api/data/warehouses';
import { showBuffer } from '@src/infrastructure/prun-ui/buffers';
import { userData } from '@src/store/user-data';
import { fixed02 } from '@src/utils/format';

const parameters = useXitParameters();
const inventoryParameter = parameters[0];
const inputTicker = ref('');
const inputThreshold = ref<number>();
const inputError = ref(false);

const storage = computed(() => getInvStore(inventoryParameter));

const rules = computed(() => {
  const currentStorage = storage.value;
  if (!currentStorage) {
    return [];
  }

  return Object.entries(userData.settings.stockAlerts[currentStorage.id] ?? {})
    .map(([ticker]) => ({
      ticker,
      quantity: getStockQuantity(currentStorage, ticker),
      threshold: computed({
        get: () => userData.settings.stockAlerts[currentStorage.id]?.[ticker],
        set: value => setLimit(currentStorage.id, ticker, value),
      }),
    }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));
});

const configuredStores = computed(() =>
  Object.keys(userData.settings.stockAlerts)
    .map(id => storagesStore.getById(id))
    .filter((x): x is PrunApi.Store => x !== undefined)
    .sort((a, b) => storageLabel(a).localeCompare(storageLabel(b))),
);

function storageLabel(currentStorage: PrunApi.Store) {
  if (currentStorage.type === 'WAREHOUSE_STORE') {
    const warehouse = warehousesStore.getById(currentStorage.addressableId);
    const name = getEntityNameFromAddress(warehouse?.address);
    if (name) {
      return `${name} Warehouse`;
    }
  }
  return currentStorage.name ?? currentStorage.id.substring(0, 8);
}

function setLimit(storeId: string, ticker: string, value: number | undefined) {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    if (!Object.hasOwn(userData.settings.stockAlerts, storeId)) {
      return;
    }
    const limits = userData.settings.stockAlerts[storeId];
    delete limits[ticker];
    if (Object.keys(limits).length === 0) {
      delete userData.settings.stockAlerts[storeId];
    }
    return;
  }

  (userData.settings.stockAlerts[storeId] ??= {})[ticker] = value;
}

function addLimit() {
  const currentStorage = storage.value;
  const material = materialsStore.getByTicker(inputTicker.value.trim());
  const threshold = inputThreshold.value;
  if (!currentStorage || !material || threshold === undefined || threshold <= 0) {
    inputError.value = true;
    return;
  }

  setLimit(currentStorage.id, material.ticker, threshold);
  inputTicker.value = '';
  inputThreshold.value = undefined;
  inputError.value = false;
}

function openInventory(storeId: string) {
  void showBuffer(`INV ${storeId}`);
}

function editStore(storeId: string) {
  void showBuffer(`XIT STOCK ${storeId}`);
}
</script>

<template>
  <LoadingSpinner v-if="!storagesStore.fetched.value" />
  <template v-else-if="inventoryParameter && !storage">
    <div :class="$style.empty">
      Inventory "{{ inventoryParameter }}" is not loaded. Open INV {{ inventoryParameter }} first,
      then reopen this panel.
    </div>
  </template>
  <template v-else-if="storage">
    <SectionHeader>{{ storageLabel(storage) }}</SectionHeader>
    <div :class="$style.note">
      An alert starts when a material is below its minimum. Clearing a minimum removes that alert
      rule.
    </div>
    <table v-if="rules.length > 0" :class="$style.table">
      <thead>
        <tr>
          <th>Material</th>
          <th>Current</th>
          <th>Minimum</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="rule in rules" :key="rule.ticker">
          <td>{{ rule.ticker }}</td>
          <td :class="{ [$style.low]: rule.quantity < (rule.threshold.value ?? 0) }">
            {{ fixed02(rule.quantity) }}
          </td>
          <td :class="$style.input">
            <div :class="C.forms.input">
              <NumberInput v-model="rule.threshold.value" optional float />
            </div>
          </td>
          <td>
            <PrunButton danger @click="setLimit(storage!.id, rule.ticker, undefined)"
              >REMOVE</PrunButton
            >
          </td>
        </tr>
      </tbody>
    </table>
    <div v-else :class="$style.empty">No material minimums set.</div>
    <SectionHeader>Add Material Minimum</SectionHeader>
    <form @submit.prevent="addLimit">
      <Active
        label="Material Ticker"
        tooltip="A material ticker, for example RAT."
        :error="inputError && !materialsStore.getByTicker(inputTicker.trim())">
        <TextInput v-model="inputTicker" />
      </Active>
      <Active
        label="Minimum Quantity"
        tooltip="An alert starts when the inventory quantity is lower than this number."
        :error="inputError && (inputThreshold === undefined || inputThreshold <= 0)">
        <NumberInput v-model="inputThreshold" optional float />
      </Active>
      <Commands>
        <PrunButton primary @click="addLimit">ADD MINIMUM</PrunButton>
      </Commands>
    </form>
  </template>
  <template v-else>
    <SectionHeader>Active Alerts</SectionHeader>
    <div v-if="activeStockAlerts.length === 0" :class="$style.empty">No low stock alerts.</div>
    <table v-else :class="$style.table">
      <thead>
        <tr>
          <th>Inventory</th>
          <th>Material</th>
          <th>Current</th>
          <th>Minimum</th>
          <th />
        </tr>
      </thead>
      <tbody>
        <tr v-for="alert in activeStockAlerts" :key="`${alert.storeId}:${alert.ticker}`">
          <td>{{ storageLabel(storagesStore.getById(alert.storeId)!) }}</td>
          <td>{{ alert.ticker }}</td>
          <td :class="$style.low">{{ fixed02(alert.quantity) }}</td>
          <td>{{ fixed02(alert.threshold) }}</td>
          <td>
            <PrunButton dark @click="openInventory(alert.storeId)">INV</PrunButton>
          </td>
        </tr>
      </tbody>
    </table>
    <SectionHeader>Configured Inventories</SectionHeader>
    <div v-if="configuredStores.length === 0" :class="$style.empty">
      Open XIT STOCK HRT after opening INV HRT to set its first minimum.
    </div>
    <table v-else :class="$style.table">
      <tbody>
        <tr v-for="configuredStorage in configuredStores" :key="configuredStorage.id">
          <td>{{ storageLabel(configuredStorage) }}</td>
          <td
            >{{
              Object.keys(userData.settings.stockAlerts[configuredStorage.id] ?? {}).length
            }}
            rules</td
          >
          <td>
            <PrunButton dark @click="editStore(configuredStorage.id)">EDIT</PrunButton>
          </td>
        </tr>
      </tbody>
    </table>
  </template>
</template>

<style module>
.table {
  width: 100%;
}

.table th,
.table td {
  padding: 5px 8px;
  text-align: left;
}

.table td:last-child {
  text-align: right;
}

.input {
  width: 100px;
}

.input > div {
  display: inline-block;
  width: 100%;
}

.input input {
  width: 100%;
}

.low {
  color: rgb(217, 83, 79);
  font-weight: bold;
}

.empty {
  padding: 10px 8px;
  font-style: italic;
  opacity: 0.75;
}

.note {
  margin: 0 0 8px;
  padding: 6px 8px;
  border-left: 3px solid rgb(240, 173, 78);
  background: rgba(240, 173, 78, 0.08);
  font-size: 12px;
}
</style>
