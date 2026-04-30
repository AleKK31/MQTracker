import { request } from 'undici';
import type { IManagementApi, BrokerOverview } from '../../core/ports/IManagementApi';
import type { Queue } from '../../core/models/queue';
import type { Exchange } from '../../core/models/exchange';
import type { Binding } from '../../core/models/binding';
import type { Connection } from '../../core/models/connection';

export class ManagementApiClient implements IManagementApi {
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(config: Connection, password: string) {
    const proto = config.useTls ? 'https' : 'http';
    this.baseUrl = `${proto}://${config.host}:${config.managementPort}/api`;
    const credentials = Buffer.from(`${config.username}:${password}`).toString('base64');
    this.authHeader = `Basic ${credentials}`;
  }

  async getOverview(): Promise<BrokerOverview> {
    const data = await this.get<Record<string, unknown>>('/overview');
    return {
      rabbitmqVersion: String(data['rabbitmq_version'] ?? ''),
      erlangVersion: String(data['erlang_version'] ?? ''),
      clusterName: String(data['cluster_name'] ?? ''),
      totalQueues: Number((data['object_totals'] as Record<string, unknown>)?.['queues'] ?? 0),
      totalConnections: Number((data['object_totals'] as Record<string, unknown>)?.['connections'] ?? 0),
    };
  }

  async getQueues(vhost = '%2F'): Promise<Queue[]> {
    const data = await this.get<unknown[]>(`/queues/${encodeURIComponent(vhost)}`);
    return data.map(mapQueue);
  }

  async getExchanges(vhost = '%2F'): Promise<Exchange[]> {
    const data = await this.get<unknown[]>(`/exchanges/${encodeURIComponent(vhost)}`);
    return data.map(mapExchange);
  }

  async getBindings(vhost = '%2F'): Promise<Binding[]> {
    const data = await this.get<unknown[]>(`/bindings/${encodeURIComponent(vhost)}`);
    return data.map(mapBinding);
  }

  private async get<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const { statusCode, body } = await request(url, {
      method: 'GET',
      headers: {
        Authorization: this.authHeader,
        Accept: 'application/json',
      },
    });

    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`ManagementApi GET ${path} returned ${statusCode}`);
    }

    const text = await body.text();
    return JSON.parse(text) as T;
  }
}

function mapQueue(raw: unknown): Queue {
  const r = raw as Record<string, unknown>;
  return {
    name: String(r['name'] ?? ''),
    vhost: String(r['vhost'] ?? '/'),
    durable: Boolean(r['durable']),
    autoDelete: Boolean(r['auto_delete']),
    exclusive: Boolean(r['exclusive']),
    messages: Number(r['messages'] ?? 0),
    consumers: Number(r['consumers'] ?? 0),
    state: (r['state'] as Queue['state']) ?? 'idle',
    arguments: (r['arguments'] as Record<string, unknown>) ?? {},
  };
}

function mapExchange(raw: unknown): Exchange {
  const r = raw as Record<string, unknown>;
  return {
    name: String(r['name'] ?? ''),
    vhost: String(r['vhost'] ?? '/'),
    type: (r['type'] as Exchange['type']) ?? 'direct',
    durable: Boolean(r['durable']),
    autoDelete: Boolean(r['auto_delete']),
    internal: Boolean(r['internal']),
    arguments: (r['arguments'] as Record<string, unknown>) ?? {},
  };
}

function mapBinding(raw: unknown): Binding {
  const r = raw as Record<string, unknown>;
  return {
    source: String(r['source'] ?? ''),
    destination: String(r['destination'] ?? ''),
    destinationType: (r['destination_type'] as Binding['destinationType']) ?? 'queue',
    routingKey: String(r['routing_key'] ?? ''),
    vhost: String(r['vhost'] ?? '/'),
    arguments: (r['arguments'] as Record<string, unknown>) ?? {},
    };
}