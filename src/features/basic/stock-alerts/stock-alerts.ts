import StockAlertToast from './StockAlertToast.vue';
import { activeStockAlerts, stockAlertKey } from '@src/core/stock-alerts';
import { storagesStore } from '@src/infrastructure/prun-api/data/storage';
import { playAudio } from '@src/infrastructure/prun-ui/audio-interceptor';

function init() {
  let initialized = false;
  let previous = new Set<string>();

  watch(
    () => [storagesStore.fetched.value, activeStockAlerts.value] as const,
    ([fetched, alerts]) => {
      if (!fetched) {
        initialized = false;
        previous = new Set();
        return;
      }

      const current = new Set(alerts.map(stockAlertKey));
      if (initialized && [...current].some(x => !previous.has(x))) {
        playAudio();
      }
      previous = current;
      initialized = true;
    },
    { immediate: true },
  );

  createFragmentApp(StockAlertToast).appendTo(document.body);
}

features.add(import.meta.url, init, 'Shows active low stock alerts for configured inventories.');
