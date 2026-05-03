import nock from 'nock';
import { ManagementApiClient } from './managementApiClient';
import type { Connection } from '../../core/models/connection';

const conn: Connection = {
  id: 'test-conn',
  name: 'Test',
  host: 'localhost',
  port: 5672,
  managementPort: 15672,
  vhost: '/',
  username: 'guest',
  useTls: false,
};
const password = 'guest';
const BASE = 'http://localhost:15672';
const VHOST = encodeURIComponent('/');

function makeClient() {
  return new ManagementApiClient(conn, password);
}

afterEach(() => nock.cleanAll());

describe('ManagementApiClient', () => {
  describe('getOverview()', () => {
    it('maps rabbitmq_version and object_totals', async () => {
      nock(BASE).get('/api/overview').reply(200, {
        rabbitmq_version: '3.12.0',
        erlang_version: '26.0',
        cluster_name: 'rabbit@localhost',
        object_totals: { queues: 5, connections: 2 },
      });
      const overview = await makeClient().getOverview();
      expect(overview.rabbitmqVersion).toBe('3.12.0');
      expect(overview.totalQueues).toBe(5);
      expect(overview.totalConnections).toBe(2);
    });
  });

  describe('getQueues()', () => {
    it('maps all queue fields', async () => {
      nock(BASE).get(`/api/queues/${VHOST}`).reply(200, [
        {
          name: 'orders',
          vhost: '/',
          durable: true,
          auto_delete: false,
          exclusive: false,
          messages: 42,
          consumers: 1,
          state: 'running',
          arguments: {},
        },
      ]);
      const queues = await makeClient().getQueues('/');
      expect(queues).toHaveLength(1);
      expect(queues[0].name).toBe('orders');
      expect(queues[0].messages).toBe(42);
      expect(queues[0].durable).toBe(true);
      expect(queues[0].state).toBe('running');
    });

    it('returns empty array for empty response', async () => {
      nock(BASE).get(`/api/queues/${VHOST}`).reply(200, []);
      expect(await makeClient().getQueues('/')).toHaveLength(0);
    });
  });

  describe('getExchanges()', () => {
    it('maps all exchange fields', async () => {
      nock(BASE).get(`/api/exchanges/${VHOST}`).reply(200, [
        {
          name: 'events',
          vhost: '/',
          type: 'topic',
          durable: true,
          auto_delete: false,
          internal: false,
          arguments: {},
        },
      ]);
      const exchanges = await makeClient().getExchanges('/');
      expect(exchanges[0].name).toBe('events');
      expect(exchanges[0].type).toBe('topic');
      expect(exchanges[0].internal).toBe(false);
    });
  });

  describe('getBindings()', () => {
    it('maps all binding fields', async () => {
      nock(BASE).get(`/api/bindings/${VHOST}`).reply(200, [
        {
          source: 'events',
          destination: 'orders',
          destination_type: 'queue',
          routing_key: 'order.created',
          vhost: '/',
          arguments: {},
        },
      ]);
      const bindings = await makeClient().getBindings('/');
      expect(bindings[0].source).toBe('events');
      expect(bindings[0].destination).toBe('orders');
      expect(bindings[0].destinationType).toBe('queue');
      expect(bindings[0].routingKey).toBe('order.created');
    });
  });

  describe('getConsumers()', () => {
    it('maps all consumer fields', async () => {
      nock(BASE).get(`/api/consumers/${VHOST}`).reply(200, [
        {
          consumer_tag: 'ctag-abc',
          exclusive: false,
          ack_mode: 'auto',
          active: true,
          queue: { name: 'orders', vhost: '/' },
          channel_details: { user: 'guest' },
        },
      ]);
      const consumers = await makeClient().getConsumers('/');
      expect(consumers[0].consumerTag).toBe('ctag-abc');
      expect(consumers[0].queueName).toBe('orders');
      expect(consumers[0].ackMode).toBe('auto');
      expect(consumers[0].active).toBe(true);
      expect(consumers[0].channelUser).toBe('guest');
    });
  });

  describe('error handling', () => {
    it('rejects on non-2xx HTTP status', async () => {
      nock(BASE).get(`/api/queues/${VHOST}`).reply(401, 'Unauthorized');
      await expect(makeClient().getQueues('/')).rejects.toThrow('401');
    });

    it('rejects on invalid JSON response', async () => {
      nock(BASE).get(`/api/queues/${VHOST}`).reply(200, 'not-json');
      await expect(makeClient().getQueues('/')).rejects.toThrow(/invalid JSON/i);
    });
  });
});
