type Listener<T> = (event: T) => void;

export class TypedEmitter<TEvents extends Record<string, unknown>> {
  private readonly listeners = new Map<keyof TEvents, Set<Listener<unknown>>>();

  on<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<unknown>);
    return this;
  }

  off<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): this {
    this.listeners.get(event)?.delete(listener as Listener<unknown>);
    return this;
  }

  once<K extends keyof TEvents>(event: K, listener: Listener<TEvents[K]>): this {
    const wrapper: Listener<TEvents[K]> = (e) => {
      listener(e);
      this.off(event, wrapper);
    };
    return this.on(event, wrapper);
  }

  emit<K extends keyof TEvents>(event: K, payload: TEvents[K]): void {
    this.listeners.get(event)?.forEach((fn) => fn(payload));
  }

  removeAllListeners(event?: keyof TEvents): void {
    if (event === undefined) {
      this.listeners.clear();
    } else {
      this.listeners.delete(event);
    }
  }
}