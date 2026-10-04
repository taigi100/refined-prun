import { companyStore } from '@src/infrastructure/prun-api/data/company';
import { onNodeDisconnected } from '@src/utils/on-node-disconnected';

interface FioVote {
  CompanyCode: string;
  VoteTimeEpochMs: number;
}

interface FioProgram {
  StartEpochMs: number;
  EndEpochMs: number;
}

interface FioPlanet {
  COGCVotes?: FioVote[];
  COGCPrograms?: FioProgram[];
}

interface Observation {
  zeroVotesAt?: number;
  ownVoteAt?: number;
}

const fioPlanets = shallowReactive<Record<string, FioPlanet | undefined>>({});
const pending = new Set<string>();
const observations = shallowReactive<Record<string, Observation | undefined>>({});
const zeroVoteFreshnessMs = 5 * 60 * 1000;

export async function loadFioVotes(naturalId: string, refresh = false) {
  const key = naturalId.toUpperCase();
  if (pending.has(key) || (!refresh && fioPlanets[key] !== undefined)) {
    return;
  }
  pending.add(key);
  try {
    const response = await fetch(`https://rest.fnar.net/planet/${encodeURIComponent(naturalId)}`);
    if (!response.ok) {
      return;
    }
    fioPlanets[key] = (await response.json()) as FioPlanet;
  } catch {
    // The game screen remains available when FIO is offline.
  } finally {
    pending.delete(key);
  }
}

export function fioVotingWindow(naturalId: string, now: number) {
  const programs = fioPlanets[naturalId.toUpperCase()]?.COGCPrograms;
  return programs?.find(x => x.StartEpochMs <= now && now < x.EndEpochMs);
}

export function hasObservedOwnVote(
  naturalId: string,
  windowStart: number | undefined,
  now: number,
) {
  const key = naturalId.toUpperCase();
  const companyCode = companyStore.value?.code;
  const period = fioVotingWindow(naturalId, now);
  if (windowStart === undefined && period === undefined) {
    return false;
  }
  const start = Math.max(windowStart ?? 0, period?.StartEpochMs ?? 0);
  const ownFioVote = fioPlanets[key]?.COGCVotes?.some(
    x =>
      x.CompanyCode.toUpperCase() === companyCode?.toUpperCase() &&
      x.VoteTimeEpochMs >= start &&
      (period === undefined || x.VoteTimeEpochMs < period.EndEpochMs),
  );
  const observed = observations[key];
  return ownFioVote === true || (observed?.ownVoteAt !== undefined && observed.ownVoteAt >= start);
}

export function observedZeroVotes(naturalId: string, windowStart: number | undefined, now: number) {
  const observed = observations[naturalId.toUpperCase()];
  return (
    observed?.zeroVotesAt !== undefined &&
    observed.zeroVotesAt >= (windowStart ?? 0) &&
    now - observed.zeroVotesAt <= zeroVoteFreshnessMs
  );
}

function observeTile(tile: PrunTile, read: (tile: PrunTile) => void) {
  const observer = new MutationObserver(() => read(tile));
  observer.observe(tile.anchor, { childList: true, subtree: true, characterData: true });
  read(tile);
  onNodeDisconnected(tile.frame, () => observer.disconnect());
}

function naturalIdFromTile(tile: PrunTile) {
  return tile.parameter?.split(' ')[0].replace(/^P-/i, '').toUpperCase();
}

function readZeroVotes(tile: PrunTile) {
  const naturalId = naturalIdFromTile(tile);
  const container = _$(tile.anchor, C.CoGCVoting.container);
  if (!naturalId || !container) {
    return;
  }
  const influenceLabel = L.CoGCVoting.table.influence();
  for (const table of Array.from(container.querySelectorAll('table'))) {
    const headers = Array.from(table.querySelectorAll('thead th'));
    const index = headers.findIndex(x => x.textContent?.trim() === influenceLabel);
    if (index < 0) {
      continue;
    }
    const rows = Array.from(table.querySelectorAll('tbody tr'));
    if (rows.length === 0) {
      continue;
    }
    const values = rows.map(x => Array.from(x.querySelectorAll('td'))[index]?.textContent?.trim());
    const zeroVotes = values.every(x => x !== undefined && /^0(?:[.,]0+)?$/.test(x));
    observations[naturalId] = {
      ...observations[naturalId],
      zeroVotesAt: zeroVotes ? Date.now() : undefined,
    };
    return;
  }
}

function readOwnVote(tile: PrunTile) {
  const naturalId = naturalIdFromTile(tile);
  const companyName = companyStore.value?.name;
  const container = _$(tile.anchor, C.CoGCVotingDetails.container);
  if (!naturalId || !companyName || !container) {
    return;
  }
  const nameLabel = L.CoGCVotingDetails.table.name();
  for (const table of Array.from(container.querySelectorAll('table'))) {
    const headers = Array.from(table.querySelectorAll('thead th'));
    const index = headers.findIndex(x => x.textContent?.trim() === nameLabel);
    if (index < 0) {
      continue;
    }
    const ownsVote = Array.from(table.querySelectorAll('tbody tr')).some(
      x => Array.from(x.querySelectorAll('td'))[index]?.textContent?.trim() === companyName,
    );
    if (ownsVote) {
      observations[naturalId] = { ...observations[naturalId], ownVoteAt: Date.now() };
    }
    return;
  }
}

export function observeCogcVoteTiles() {
  tiles.observe('COGCPEX', tile => observeTile(tile, readZeroVotes));
  tiles.observe('COGCPD', tile => observeTile(tile, readOwnVote));
}
