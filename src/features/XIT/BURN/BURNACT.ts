import '@src/features/XIT/ACT/actions/cx-buy/cx-buy';
import '@src/features/XIT/ACT/actions/mtra/mtra';
import '@src/features/XIT/ACT/material-groups/resupply/resupply';
import '@src/features/XIT/ACT/material-groups/manual/manual';

import BurnActWindow from '@src/features/XIT/BURN/BurnActWindow.vue';
import PickupActWindow from '@src/features/XIT/BURN/PickupActWindow.vue';
import { sitesStore } from '@src/infrastructure/prun-api/data/sites';
import { getEntityNameFromAddress } from '@src/infrastructure/prun-api/data/addresses';

xit.add({
  command: 'BURNACT',
  name: parameters => {
    if (parameters[0]) {
      const site = sitesStore.getByPlanetNaturalIdOrName(parameters[0]);
      const name = site ? getEntityNameFromAddress(site.address) : parameters[0];
      return `BURN RESUPPLY - ${name}`;
    }
    return 'BURN RESUPPLY';
  },
  description: 'Executes a resupply action package for a planet from the burn screen.',
  mandatoryParameters: 'Planet Identifier',
  component: () => BurnActWindow,
});

xit.add({
  command: 'PICKUPACT',
  name: parameters => {
    if (parameters[0]) {
      const site = sitesStore.getByPlanetNaturalIdOrName(parameters[0]);
      const name = site ? getEntityNameFromAddress(site.address) : parameters[0];
      return `PRODUCTION PICKUP - ${name}`;
    }
    return 'PRODUCTION PICKUP';
  },
  description: 'Loads production inputs on the configured pickup ship and prepares its flight.',
  mandatoryParameters: 'Planet Identifier',
  component: () => PickupActWindow,
});
