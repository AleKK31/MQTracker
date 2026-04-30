import { Message, MessageId } from "../models/message";

export interface IMessageStore {
  add(message: Message): void;
  get(id: MessageId): Message | undefined;
  getAll(): readonly Message[];
  clear(): void;
  readonly size: number;
  readonly capacity: number;
}

