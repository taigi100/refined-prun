<script setup lang="ts">
import PrunButton from '@src/components/PrunButton.vue';
import PrunLink from '@src/components/PrunLink.vue';
import TextInput from '@src/components/forms/TextInput.vue';
import {
  getEntityNameFromAddress,
  getEntityNaturalIdFromAddress,
} from '@src/infrastructure/prun-api/data/addresses';
import { alertsStore } from '@src/infrastructure/prun-api/data/alerts';
import { cogcsStore } from '@src/infrastructure/prun-api/data/cogcs';
import { planetsStore } from '@src/infrastructure/prun-api/data/planets';
import { sitesStore } from '@src/infrastructure/prun-api/data/sites';
import { userDataStore } from '@src/infrastructure/prun-api/data/user-data';
import { showBuffer } from '@src/infrastructure/prun-ui/buffers';
import { userData } from '@src/store/user-data';
import { timestampEachSecond } from '@src/utils/dayjs';
import dayjs from 'dayjs';
import { fioVotingWindow, hasObservedOwnVote, loadFioVotes, observedZeroVotes } from './cogc-votes';

interface PlanetRow {
  planetNaturalId: string;
  planet: string;
  electionStart?: number;
  electionEnd?: number;
}

const dayMs = dayjs.duration(1, 'day').asMilliseconds();
const planetInput = ref('');
const planetError = ref(false);

watch(
  () => userData.elec.planets.slice(),
  async planets => {
    for (const naturalId of planets) {
      await loadFioVotes(naturalId);
    }
  },
  { immediate: true },
);

function addPlanet() {
  const term = planetInput.value.trim();
  const planet = planetsStore.find(term);
  const site = sitesStore.getByPlanetNaturalIdOrName(term);
  const naturalId = planet?.naturalId ?? getEntityNaturalIdFromAddress(site?.address);
  if (!naturalId) {
    planetError.value = true;
    return;
  }
  planetError.value = false;
  if (!userData.elec.planets.some(x => x.toUpperCase() === naturalId.toUpperCase())) {
    userData.elec.planets.push(naturalId);
  }
  planetInput.value = '';
}

function removePlanet(naturalId: string) {
  userData.elec.planets = userData.elec.planets.filter(x => x !== naturalId);
}

function planetLabel(naturalId: string) {
  const name =
    planetsStore.find(naturalId)?.name ??
    getEntityNameFromAddress(sitesStore.getByPlanetNaturalId(naturalId)?.address);
  return name ? `${name} (${naturalId})` : naturalId;
}

function latestProgramChange(naturalId: string) {
  let latest: number | undefined;
  for (const alert of alertsStore.all.value ?? []) {
    if (alert.type !== 'COGC_PROGRAM_CHANGED') {
      continue;
    }
    const address = alert.data.find(x => x.key === 'planet' || x.key === 'address')?.value as
      | { address?: PrunApi.Address }
      | undefined;
    const id = getEntityNaturalIdFromAddress(address?.address) ?? alert.naturalId;
    if (id.toUpperCase() === naturalId.toUpperCase()) {
      latest = Math.max(latest ?? 0, alert.time.timestamp);
    }
  }
  return latest;
}

const rows = computed<PlanetRow[]>(() => {
  const now = timestampEachSecond.value;
  return userData.elec.planets.map(naturalId => {
    const fioWindow = fioVotingWindow(naturalId, now);
    const start = fioWindow?.StartEpochMs ?? latestProgramChange(naturalId);
    return {
      planetNaturalId: naturalId,
      planet: planetLabel(naturalId),
      electionStart: start,
      electionEnd: fioWindow?.EndEpochMs ?? (start === undefined ? undefined : start + dayMs * 7),
    };
  });
});

function isVotingOpen(row: PlanetRow) {
  const now = timestampEachSecond.value;
  return (
    row.electionStart !== undefined &&
    row.electionEnd !== undefined &&
    now >= row.electionStart &&
    now < row.electionEnd
  );
}

function voteState(row: PlanetRow) {
  const now = timestampEachSecond.value;
  if (hasObservedOwnVote(row.planetNaturalId, row.electionStart, now)) {
    return 'voted';
  }
  if (!isVotingOpen(row)) {
    return 'unknown';
  }
  if (!sitesStore.fetched.value || !userDataStore.subscriptionLevel) {
    return 'unknown';
  }
  if (
    !sitesStore.getByPlanetNaturalId(row.planetNaturalId) ||
    userDataStore.subscriptionLevel !== 'PRO'
  ) {
    return 'unavailable';
  }
  return observedZeroVotes(row.planetNaturalId, row.electionStart, now) ? 'ready' : 'unknown';
}

function upkeepState(naturalId: string) {
  const upkeep = cogcsStore.getByPlanetNaturalId(naturalId)?.upkeep;
  if (!upkeep || upkeep.dueDate.timestamp <= timestampEachSecond.value) {
    return 'unknown';
  }
  const bill = upkeep.billOfMaterial;
  if (bill.length === 0) {
    return 'unknown';
  }
  if (bill.every(x => x.currentAmount >= x.amount)) {
    return 'paid';
  }
  if (!sitesStore.fetched.value) {
    return 'unknown';
  }
  return sitesStore.getByPlanetNaturalId(naturalId) ? 'ready' : 'unavailable';
}

function timeLeft(timestamp: number) {
  const duration = dayjs.duration({
    milliseconds: Math.max(0, timestamp - timestampEachSecond.value),
  });
  const days = Math.floor(duration.asDays());
  const hours = Math.floor(duration.subtract(days, 'days').asHours());
  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${Math.floor(duration.asMinutes())}m`;
}

function checkVotes(naturalId: string) {
  void loadFioVotes(naturalId, true);
  void showBuffer(`COGCPEX ${naturalId}`);
}
</script>

<template>
  <form :class="$style.add" @submit.prevent="addPlanet">
    <span>Planet</span>
    <TextInput v-model="planetInput" />
    <PrunButton primary @click="addPlanet">ADD</PrunButton>
  </form>
  <p v-if="planetError" :class="$style.error">Planet not found.</p>
  <p v-if="rows.length === 0" :class="$style.empty">Add a planet to watch CoGC votes and upkeep.</p>
  <table v-else>
    <thead>
      <tr>
        <th>Planet</th>
        <th>CoGC vote</th>
        <th>Voting ends</th>
        <th>CoGC upkeep</th>
        <th />
      </tr>
    </thead>
    <tbody>
      <tr v-for="row in rows" :key="row.planetNaturalId">
        <td
          ><PrunLink inline :command="`PLI ${row.planetNaturalId}`">{{ row.planet }}</PrunLink></td
        >
        <td>
          <span v-if="voteState(row) === 'voted'">VOTED</span>
          <template v-else>
            <PrunButton
              :primary="voteState(row) === 'ready'"
              :dark="voteState(row) !== 'ready'"
              inline
              @click="checkVotes(row.planetNaturalId)">
              {{ voteState(row) === 'ready' ? 'VOTE' : 'CHECK' }}
            </PrunButton>
            <span v-if="voteState(row) !== 'ready'" :class="$style.status">
              {{ voteState(row) === 'unavailable' ? 'NO VOTE' : 'UNKNOWN' }}
            </span>
          </template>
        </td>
        <td>{{ row.electionEnd && isVotingOpen(row) ? timeLeft(row.electionEnd) : '--' }}</td>
        <td>
          <span v-if="upkeepState(row.planetNaturalId) === 'paid'">PAID</span>
          <template v-else>
            <PrunButton
              v-if="upkeepState(row.planetNaturalId) === 'ready'"
              primary
              inline
              @click="showBuffer(`COGCU ${row.planetNaturalId}`)">
              UPKEEP
            </PrunButton>
            <span v-else :class="$style.status">
              {{ upkeepState(row.planetNaturalId) === 'unavailable' ? 'NO BASE' : 'UNKNOWN' }}
            </span>
            <PrunButton dark inline @click="showBuffer(`COGC ${row.planetNaturalId}`)">
              CHECK
            </PrunButton>
          </template>
        </td>
        <td
          ><PrunButton danger inline @click="removePlanet(row.planetNaturalId)"
            >REMOVE</PrunButton
          ></td
        >
      </tr>
    </tbody>
  </table>
</template>

<style module>
.add {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 6px 8px;
}

.error,
.empty {
  margin: 6px 8px;
}

.error {
  color: rgb(217, 83, 79);
}

.status {
  margin-left: 5px;
  color: #aaa;
}
</style>
