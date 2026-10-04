import ELEC from '@src/features/XIT/ELEC/ELEC.vue';
import { observeCogcVoteTiles } from '@src/features/XIT/ELEC/cogc-votes';

observeCogcVoteTiles();

xit.add({
  command: 'ELEC',
  name: 'COGC WATCH',
  description: 'CoGC votes and upkeep for selected planets.',
  component: () => ELEC,
});
