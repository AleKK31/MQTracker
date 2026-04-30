import type { WebviewToHost, HostToWebview } from '../../../src/ui/webview/protocol';

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

type MessageListener = (event: MessageEvent<HostToWebview>) => void;

class VsCodeBridge {
  private readonly api = acquireVsCodeApi();
  private readonly listeners: MessageListener[] = [];

  constructor() {
    window.addEventListener('message', (event: MessageEvent) => {
      this.listeners.forEach((l) => l(event as MessageEvent<HostToWebview>));
    });
  }

  send(message: WebviewToHost): void {
    this.api.postMessage(message);
  }

  onMessage(listener: MessageListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  getState<T>(): T | undefined {
    return this.api.getState() as T | undefined;
  }

  setState<T>(state: T): void {
    this.api.setState(state);
  }
}

let instance: VsCodeBridge | null = null;

export function getBridge(): VsCodeBridge {
  if (!instance) instance = new VsCodeBridge();
  return instance;
}