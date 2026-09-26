import STOCK from '@src/features/XIT/STOCK/STOCK.vue';

xit.add({
  command: 'STOCK',
  name: 'STOCK ALERTS',
  description: 'Set minimum material quantities for an inventory and view active alerts.',
  optionalParameters: 'Inventory Identifier',
  component: () => STOCK,
  bufferSize: [620, 420],
});
