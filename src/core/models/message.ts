export interface Message {
  id: string;
  queueName: string;
  exchange: string;
  routingKey: string;
  contentType: string;
  body: string;
  headers: Record<string, unknown>;
  timestamp: Date;
  redelivered: boolean;
}

export type MessageId = string;