import { storagesStore } from '@src/infrastructure/prun-api/data/storage';
import { userData } from '@src/store/user-data';

export interface StockAlert {
  storeId: string;
  ticker: string;
  quantity: number;
  threshold: number;
}

export function getStockQuantity(storage: PrunApi.Store, ticker: string) {
  let quantity = 0;
  for (const item of storage.items) {
    if (item.quantity?.material.ticker === ticker) {
      quantity += item.quantity.amount;
    }
  }
  return quantity;
}

export function getStockAlerts(
  storages: PrunApi.Store[] | undefined,
  settings: UserData.StockAlertSettings,
) {
  if (!storages) {
    return [];
  }

  const alerts: StockAlert[] = [];
  for (const [storeId, limits] of Object.entries(settings)) {
    const storage = storages.find(x => x.id === storeId);
    if (!storage) {
      continue;
    }
    for (const [ticker, threshold] of Object.entries(limits)) {
      if (!Number.isFinite(threshold) || threshold <= 0) {
        continue;
      }
      const quantity = getStockQuantity(storage, ticker);
      if (quantity < threshold) {
        alerts.push({ storeId, ticker, quantity, threshold });
      }
    }
  }

  return alerts.sort((a, b) => {
    const storeComparison = a.storeId.localeCompare(b.storeId);
    if (storeComparison !== 0) {
      return storeComparison;
    }
    return a.ticker.localeCompare(b.ticker);
  });
}

export function stockAlertKey(alert: Pick<StockAlert, 'storeId' | 'ticker'>) {
  return `${alert.storeId}:${alert.ticker}`;
}

export const activeStockAlerts = computed(() =>
  getStockAlerts(storagesStore.all.value, userData.settings.stockAlerts),
);
