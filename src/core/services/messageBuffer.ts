import type { Message, MessageId } from '../models/message';
import type { IMessageStore } from '../ports/IMessageStore';

export class MessageBuffer implements IMessageStore {
  private readonly buffer: (Message | undefined)[];
  private head = 0;
  private count = 0;
  private readonly index = new Map<MessageId, number>();

  constructor(readonly capacity: number) {
    this.buffer = new Array(capacity);
  }

  add(message: Message): void {
    const slot = this.head % this.capacity;
    const evicted = this.buffer[slot];
    if (evicted) {
      this.index.delete(evicted.id);
    }
    this.buffer[slot] = message;
    this.index.set(message.id, slot);
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  remove(id: MessageId): void {
    const slot = this.index.get(id);
    if (slot === undefined) return;
    this.buffer[slot] = undefined;
    this.index.delete(id);
    this.count = Math.max(0, this.count - 1);
  }

  get(id: MessageId): Message | undefined {
    const slot = this.index.get(id);
    if (slot === undefined) return undefined;
    return this.buffer[slot];
  }

  getAll(): readonly Message[] {
    const result: Message[] = [];
    for (let i = 0; i < this.capacity; i++) {
      const msg = this.buffer[i];
      if (msg) result.push(msg);
    }
    result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return result;
  }

  clear(): void {
    this.buffer.fill(undefined);
    this.index.clear();
    this.head = 0;
    this.count = 0;
  }

  get size(): number {
    return this.count;
  }
}