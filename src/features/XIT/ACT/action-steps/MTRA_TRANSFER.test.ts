import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from '../act-registry';
import { MTRA_TRANSFER } from './MTRA_TRANSFER';
import type { ActionStepExecuteContext } from '../shared-types';

const mocks = vi.hoisted(() => ({
  getStorage: vi.fn(),
  changeInput: vi.fn(),
  selectAll: vi.fn(),
}));

vi.mock('@src/features/XIT/ACT/actions/utils', () => ({ serializeStorage: vi.fn() }));
vi.mock('@src/infrastructure/prun-api/data/storage', () => ({
  storagesStore: { getById: mocks.getStorage },
}));
vi.mock('@src/infrastructure/prun-api/data/materials', () => ({
  materialsStore: { getByTicker: () => ({ weight: 1, volume: 1 }) },
}));
vi.mock('@src/util', () => ({
  changeInputValue: mocks.changeInput,
  selectMaterialInMaterialSelector: vi.fn(async () => true),
  clickElement: vi.fn(),
}));
vi.mock('@src/utils/select-dom', () => ({
  $: vi.fn(async () => ({})),
  _$$: mocks.selectAll,
}));
vi.mock('@src/infrastructure/prun-ui/prun-css', () => ({
  C: { MaterialSelector: { container: 'material-selector' }, Button: { btn: 'button' } },
}));

beforeEach(() => vi.clearAllMocks());

describe('MTRA amount setup', () => {
  it.each([false, true])('fills the named amount input with loadAll=%s', async loadAll => {
    const source = { id: 'source', items: [{ quantity: { material: { ticker: 'RAT' } } }] };
    const destination = {
      id: 'destination',
      weightCapacity: 100,
      weightLoad: 0,
      volumeCapacity: 100,
      volumeLoad: 0,
    };
    mocks.getStorage.mockImplementation(id => (id === 'source' ? source : destination));
    const amount = { name: 'amount', value: '1' };
    const unrelated = { name: 'unrelated' };
    const search = { type: 'search' };
    mocks.selectAll.mockImplementation((_base, selector) =>
      selector === 'input'
        ? [amount, unrelated, search]
        : [{ textContent: '0' }, { textContent: '100' }],
    );
    const ready = new Error('Ready for player action');
    const ctx = {
      data: MTRA_TRANSFER({
        from: 'source',
        to: 'destination',
        ticker: 'RAT',
        amount: 25,
        loadAll,
      }),
      assert: (condition, message) => {
        if (!condition) {
          throw new Error(message);
        }
      },
      requestTile: vi.fn(async () => ({ anchor: {} })),
      setStatus: vi.fn(),
      waitAct: vi.fn(async () => {
        throw ready;
      }),
    } as unknown as ActionStepExecuteContext<unknown>;

    await expect(act.getActionStepInfo('MTRA_TRANSFER').execute(ctx)).rejects.toBe(ready);

    expect(mocks.changeInput).toHaveBeenCalledExactlyOnceWith(amount, loadAll ? '100' : '25');
  });
});
