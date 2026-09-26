<script setup lang="ts">
import { activeStockAlerts } from '@src/core/stock-alerts';
import { getEntityNameFromAddress } from '@src/infrastructure/prun-api/data/addresses';
import { storagesStore } from '@src/infrastructure/prun-api/data/storage';
import { warehousesStore } from '@src/infrastructure/prun-api/data/warehouses';
import { showBuffer } from '@src/infrastructure/prun-ui/buffers';
import { fixed02 } from '@src/utils/format';

function storageLabel(storeId: string) {
  const storage = storagesStore.getById(storeId);
  if (!storage) {
    return storeId.substring(0, 8);
  }
  if (storage.type === 'WAREHOUSE_STORE') {
    const warehouse = warehousesStore.getById(storage.addressableId);
    const name = getEntityNameFromAddress(warehouse?.address);
    if (name) {
      return name;
    }
  }
  return storage.name ?? storeId.substring(0, 8);
}

function openAlerts() {
  void showBuffer('XIT STOCK');
}
</script>

<template>
  <aside v-if="activeStockAlerts.length > 0" :class="$style.notice" aria-live="polite">
    <button :class="$style.header" type="button" @click="openAlerts">
      LOW STOCK ({{ activeStockAlerts.length }})
    </button>
    <button
      v-for="alert in activeStockAlerts.slice(0, 5)"
      :key="`${alert.storeId}:${alert.ticker}`"
      :class="$style.alert"
      type="button"
      @click="openAlerts">
      {{ storageLabel(alert.storeId) }}: {{ alert.ticker }} {{ fixed02(alert.quantity) }} /
      {{ fixed02(alert.threshold) }}
    </button>
  </aside>
</template>

<style module>
.notice {
  position: fixed;
  z-index: 1000000;
  right: 14px;
  bottom: 14px;
  width: min(280px, calc(100vw - 28px));
  border: 1px solid rgb(217, 83, 79);
  background: rgb(29, 23, 23);
  box-shadow: 0 3px 12px rgb(0 0 0 / 45%);
  color: rgb(230, 230, 230);
  font: 12px monospace;
}

.header,
.alert {
  display: block;
  width: 100%;
  border: 0;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.header {
  padding: 7px 9px;
  background: rgb(217, 83, 79);
  color: white;
  font-weight: bold;
}

.alert {
  padding: 5px 9px;
}

.alert:hover,
.header:hover {
  background-color: rgba(255, 255, 255, 0.12);
}
</style>
