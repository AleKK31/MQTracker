export interface Queue {
  name: string;
  vhost: string;
  durable: boolean;
  autoDelete: boolean;
  exclusive: boolean;
  messages: number;
  consumers: number;
  state: 'running' | 'idle' | 'stopped';
  arguments: Record<string, unknown>;
}