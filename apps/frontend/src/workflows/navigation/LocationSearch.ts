import type { AdminNode } from './AdminNode.js';
import { rankLocationOptions } from './locationSearchRanking.js';

export interface LocationSearchOption {
  readonly node: AdminNode;
  readonly path: string;
  readonly label: string;
}

export interface LocationSearchOptions {
  readonly options: readonly LocationSearchOption[];
  readonly onPreviewStart: (node: AdminNode) => void;
  readonly onPreviewEnd: () => void;
  readonly onPreviewCommit: (node: AdminNode) => void;
  readonly onSelect: (node: AdminNode) => void;
}

export default class LocationSearch {
  readonly element: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly results: HTMLUListElement;
  private readonly options: readonly LocationSearchOption[];
  private readonly onPreviewStart: (node: AdminNode) => void;
  private readonly onPreviewEnd: () => void;
  private readonly onPreviewCommit: (node: AdminNode) => void;
  private readonly onSelect: (node: AdminNode) => void;
  private visibleOptions: readonly LocationSearchOption[] = [];
  private highlightedIndex = -1;
  private previewTimer: number | null = null;
  private previewingNode: AdminNode | null = null;

  constructor(options: LocationSearchOptions) {
    this.options = options.options;
    this.onPreviewStart = options.onPreviewStart;
    this.onPreviewEnd = options.onPreviewEnd;
    this.onPreviewCommit = options.onPreviewCommit;
    this.onSelect = options.onSelect;

    this.element = document.createElement('div');
    this.element.className = 'location-search';

    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'location-search-toggle';
    toggle.textContent = 'Search location';
    toggle.setAttribute('aria-label', 'Search administrative location');
    toggle.addEventListener('click', () => this.setExpanded(true));

    const panel = document.createElement('div');
    panel.className = 'location-search-panel hidden';

    const inputRow = document.createElement('div');
    inputRow.className = 'location-search-input-row';
    this.input = document.createElement('input');
    this.input.type = 'search';
    this.input.placeholder = 'Search regions...';
    this.input.setAttribute('aria-label', 'Search administrative locations');
    this.input.setAttribute('autocomplete', 'off');
    this.input.addEventListener('input', () => this.renderResults());
    this.input.addEventListener('keydown', (event) => this.handleKeyDown(event));

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'location-search-close';
    close.textContent = '×';
    close.setAttribute('aria-label', 'Close location search');
    close.addEventListener('click', () => this.setExpanded(false));

    inputRow.append(this.input, close);
    this.results = document.createElement('ul');
    this.results.className = 'location-search-results';
    this.results.setAttribute('role', 'listbox');
    this.results.addEventListener('mouseleave', () => this.endPreview());
    panel.append(inputRow, this.results);
    this.element.append(toggle, panel);
  }

  private setExpanded(expanded: boolean): void {
    const panel = this.element.querySelector('.location-search-panel');
    if (!(panel instanceof HTMLElement)) return;
    panel.classList.toggle('hidden', !expanded);
    if (expanded) {
      this.input.focus();
      this.renderResults();
    } else {
      this.input.value = '';
      this.endPreview();
      this.clearResults();
    }
  }

  private renderResults(): void {
    this.visibleOptions = rankLocationOptions(this.options, this.input.value);
    this.highlightedIndex = this.visibleOptions.length ? 0 : -1;
    this.results.replaceChildren(...this.visibleOptions.map((option, index) => this.createResult(option, index)));
  }

  private createResult(option: LocationSearchOption, index: number): HTMLLIElement {
    const item = document.createElement('li');
    item.setAttribute('role', 'option');
    item.id = `location-search-option-${index}`;
    item.className = index === this.highlightedIndex ? 'highlighted' : '';
    item.textContent = option.path;
    item.title = option.path;
    item.addEventListener('mouseenter', () => this.startPreview(option));
    item.addEventListener('pointermove', () => this.startPreview(option));
    item.addEventListener('click', () => this.select(option));
    return item;
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      this.setExpanded(false);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!this.visibleOptions.length) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      this.highlightedIndex = (this.highlightedIndex + direction + this.visibleOptions.length)
        % this.visibleOptions.length;
      this.results.replaceChildren(...this.visibleOptions.map((option, index) => this.createResult(option, index)));
      this.startPreview(this.visibleOptions[this.highlightedIndex]);
      return;
    }
    if (event.key === 'Enter' && this.highlightedIndex >= 0) {
      event.preventDefault();
      this.select(this.visibleOptions[this.highlightedIndex]);
    }
  }

  private startPreview(option: LocationSearchOption): void {
    this.clearPreviewTimer();
    if (this.previewingNode === option.node) return;
    this.previewTimer = window.setTimeout(() => {
      this.previewingNode = option.node;
      this.onPreviewStart(option.node);
    }, 350);
  }

  private endPreview(): void {
    this.clearPreviewTimer();
    if (!this.previewingNode) return;
    this.previewingNode = null;
    this.onPreviewEnd();
  }

  private clearPreviewTimer(): void {
    if (this.previewTimer === null) return;
    window.clearTimeout(this.previewTimer);
    this.previewTimer = null;
  }

  private select(option: LocationSearchOption): void {
    if (this.previewingNode === option.node) {
      this.onPreviewCommit(option.node);
      this.previewingNode = null;
      this.setExpanded(false);
      return;
    }
    this.endPreview();
    this.onSelect(option.node);
    this.setExpanded(false);
  }

  private clearResults(): void {
    this.visibleOptions = [];
    this.highlightedIndex = -1;
    this.results.replaceChildren();
  }
}
