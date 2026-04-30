import type { WebviewMessage } from '../../../src/ui/webview/protocol';

export interface StoreState {
  messages: WebviewMessage[];
  filter: string;
  selectedId: string | null;
}

type StoreListener = (state: StoreState) => void;

export function applyFilter(messages: WebviewMessage[], filter: string): WebviewMessage[] {
  if (!filter) return messages;
  const lower = filter.toLowerCase();
  return messages.filter(
    (m) =>
      m.routingKey.toLowerCase().includes(lower) ||
      m.exchange.toLowerCase().includes(lower) ||
      m.body.toLowerCase().includes(lower) ||
      m.queueName.toLowerCase().includes(lower),
  );
}

export class Store {
  private state: StoreState = {
    messages: [],
    filter: '',
    selectedId: null,
  };
  private readonly listeners: StoreListener[] = [];

  getState(): Readonly<StoreState> {
    return this.state;
  }

  getFiltered(): WebviewMessage[] {
    return applyFilter(this.state.messages, this.state.filter);
  }

  getSelected(): WebviewMessage | undefined {
    if (!this.state.selectedId) return undefined;
    return this.state.messages.find((m) => m.id === this.state.selectedId);
  }

  setMessages(messages: WebviewMessage[]): void {
    this.state = { ...this.state, messages };
    this.notify();
  }

  addMessage(message: WebviewMessage): void {
    this.state = { ...this.state, messages: [...this.state.messages, message] };
    this.notify();
  }

  addBatch(messages: WebviewMessage[]): void {
    this.state = { ...this.state, messages: [...this.state.messages, ...messages] };
    this.notify();
  }

  setFilter(filter: string): void {
    this.state = { ...this.state, filter };
    this.notify();
  }

  setSelected(id: string | null): void {
    this.state = { ...this.state, selectedId: id };
    this.notify();
  }

  clear(): void {
    this.state = { ...this.state, messages: [], selectedId: null };
    this.notify();
  }

  subscribe(listener: StoreListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  private notify(): void {
    this.listeners.forEach((l) => l(this.state));
  }
}