export interface Binding {
  source: string;
  destination: string;
  destinationType: 'queue' | 'exchange';
  routingKey: string;
  vhost: string;
  arguments: Record<string, unknown>;
}