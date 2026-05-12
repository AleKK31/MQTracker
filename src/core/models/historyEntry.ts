export type HistoryAction = 'ack' | 'nack' | 'nack-requeue';

export interface HistoryEntry {
  id: string;
  connectionId: string;
  queueName: string;
  exchange: string;
  routingKey: string;
  body: string;
  contentType: string;
  deliveryMode: number;
  action: HistoryAction;
  actedAt: string; // ISO string
}
