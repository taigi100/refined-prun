import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { selectMaterialInMaterialSelector } from './util';

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  selectAll: vi.fn(),
  wait: vi.fn(),
  getById: vi.fn(),
  observe: vi.fn(),
}));

vi.mock('@src/infrastructure/prun-api/data/materials', () => ({ materialsStore: {} }));
vi.mock('@src/infrastructure/prun-api/data/planets', () => ({ planetsStore: {} }));
vi.mock('@src/infrastructure/prun-api/data/stars', () => ({ starsStore: {} }));
vi.mock('@src/infrastructure/prun-api/data/stations', () => ({ stationsStore: {} }));
vi.mock('@src/infrastructure/prun-ui/i18n', () => ({ getMaterialName: vi.fn() }));
vi.mock('@src/utils/sleep', () => ({ sleep: vi.fn() }));
vi.mock('@src/utils/on-node-tree-mutation', () => ({ onNodeTreeMutation: mocks.observe }));
vi.mock('@src/utils/select-dom', () => ({
  $: mocks.wait,
  _$: mocks.select,
  _$$: mocks.selectAll,
}));
vi.mock('@src/infrastructure/prun-ui/prun-css', () => ({
  C: {
    MaterialSelector: { container: 'material-selector', suggestionEntry: 'material-entry' },
    suggestions: {
      suggestionsContainer: 'suggestions-container',
      suggestionsList: 'suggestions-list',
      suggestion: 'suggestion-option',
    },
    ColoredIcon: { label: 'ticker' },
  },
}));

class MaterialInput {
  text = '';
  events: string[] = [];
  ownerDocument = { getElementById: mocks.getById, documentElement: {} };

  getAttribute(name: string) {
    expect(name).toBe('aria-controls');
    return 'active-results';
  }

  get value() {
    return this.text;
  }

  set value(value: string) {
    this.text = value;
  }

  dispatchEvent(event: Event) {
    this.events.push(event.type);
    return true;
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('window', { HTMLInputElement: MaterialInput });
  for (const name of ['FocusEvent', 'InputEvent', 'PointerEvent', 'MouseEvent']) {
    vi.stubGlobal(name, Event);
  }
});

afterEach(() => vi.unstubAllGlobals());

describe('selectMaterialInMaterialSelector', () => {
  it.each([
    [true, false],
    [false, false],
    [true, true],
  ])(
    'selects the exact option in the linked list (container: %s, delayed portal: %s)',
    async (containerSupplied, delayed) => {
      const container = { classList: { contains: () => true } } as unknown as Element;
      const root = { classList: { contains: () => false } } as unknown as Element;
      const input = new MaterialInput();
      const suggestions = { style: { display: '' } };
      const list = {};
      const wrong = { dispatchEvent: vi.fn() };
      const match = { dispatchEvent: vi.fn() };
      let mounted = !delayed;

      mocks.getById.mockImplementation(id => {
        expect(id).toBe('active-results');
        expect(input.events).toEqual(['focusin', 'input', 'change']);
        expect(input.value).toBe('RAT');
        return mounted ? suggestions : null;
      });

      mocks.wait.mockImplementation(async (base, selector) => {
        if (base === root && selector === 'material-selector') {
          return container;
        }
        if (base === container && selector === 'input') {
          return input;
        }
        if (base === suggestions && selector === 'suggestions-list') {
          return list;
        }
        throw new Error(`Unexpected selector: ${selector}`);
      });
      mocks.selectAll.mockImplementation((base, selector) => {
        expect(base).toBe(list);
        expect(selector).toBe('suggestion-option');
        return [wrong, match];
      });
      mocks.select.mockImplementation(base => ({ textContent: base === match ? 'RAT' : 'RATX' }));

      const selection = selectMaterialInMaterialSelector(
        containerSupplied ? container : root,
        'RAT',
      );
      if (delayed) {
        await vi.waitFor(() => expect(mocks.observe).toHaveBeenCalledOnce());
        expect(mocks.observe.mock.calls[0][0]).toBe(input.ownerDocument.documentElement);
        mounted = true;
        expect(mocks.observe.mock.calls[0][1]()).toBe(true);
      }
      expect(await selection).toBe(true);

      expect(wrong.dispatchEvent).not.toHaveBeenCalled();
      expect(match.dispatchEvent.mock.calls.map(x => x[0].type)).toEqual([
        'pointerdown',
        'mousedown',
        'pointerup',
        'mouseup',
        'click',
      ]);
      expect(suggestions.style.display).toBe('');
    },
  );
});
