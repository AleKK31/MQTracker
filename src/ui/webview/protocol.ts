import type { Message } from "../../core/models/message";
import type { HistoryEntry } from "../../core/models/historyEntry";
export type { HistoryEntry };

// Host → Webview

export interface MessagesLoadedEvent {
  type: "messagesLoaded";
  messages: WebviewMessage[];
}

export interface MessageAddedEvent {
  type: "messageAdded";
  message: WebviewMessage;
}

export interface MessagesBatchEvent {
  type: "messagesBatch";
  messages: WebviewMessage[];
}

export interface ClearEvent {
  type: "clear";
}

export interface HistoryLoadedEvent {
  type: "historyLoaded";
  entries: HistoryEntry[];
}

export type HostToWebview =
  | MessagesLoadedEvent
  | MessageAddedEvent
  | MessagesBatchEvent
  | ClearEvent
  | HistoryLoadedEvent;

// Webview → Host

export interface ReadyEvent {
  type: "ready";
}

export interface AckEvent {
  type: "ack";
  /** Opaque message ID — host resolves to deliveryTag internally */
  id: string;
}

export interface NackEvent {
  type: "nack";
  id: string;
  requeue: boolean;
}

export interface ReplayEvent {
  type: "replay";
  id: string;
}

export interface PublishEvent {
  type: "publish";
  exchange: string;
  routingKey: string;
  body: string;
  contentType: string;
  deliveryMode: 1 | 2;
  headers: Record<string, string>;
  properties: Record<string, string>;
}

export type WebviewToHost =
  | ReadyEvent
  | AckEvent
  | NackEvent
  | ReplayEvent
  | PublishEvent;

// Shared types (safe to send to webview — no deliveryTag)

export interface WebviewMessage {
  id: string;
  queueName: string;
  exchange: string;
  routingKey: string;
  contentType: string;
  body: string;
  headers: Record<string, unknown>;
  timestamp: string; // ISO string
  redelivered: boolean;
}

export function toWebviewMessage(msg: Message): WebviewMessage {
  return {
    id: msg.id,
    queueName: msg.queueName,
    exchange: msg.exchange,
    routingKey: msg.routingKey,
    contentType: msg.contentType,
    body: msg.body,
    headers: msg.headers,
    timestamp: msg.timestamp.toISOString(),
    redelivered: msg.redelivered,
  };
}
