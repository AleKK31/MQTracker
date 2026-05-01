import type { Message } from "../models/message";

export type MessageHandler = (message: Message) => void;
export type ErrorHandler = (error: Error) => void;

export interface IBrokerClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  subscribe(queueName: string, handler: MessageHandler): Promise<string>;
  unsubscribe(consumerTag: string): Promise<void>;
  ack(deliveryTag: bigint): void;
  nack(deliveryTag: bigint, requeue?: boolean): void;
  publish(
    exchange: string,
    routingKey: string,
    content: Buffer,
    options?: Record<string, unknown>
  ): boolean;
  onError(handler: ErrorHandler): void;
  readonly isConnected: boolean;
}
