export type ExchangeType = 'direct' | 'fanout' | 'topic' | 'headers';

export interface Exchange {
  name: string;
  vhost: string;
  type: ExchangeType;
  durable: boolean;
  autoDelete: boolean;
  internal: boolean;
  arguments: Record<string, unknown>;
}