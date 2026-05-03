import { ReplayService } from './replayService';
import { MessageBuffer } from './messageBuffer';
import type { IBrokerClient } from '../ports/IBrokerClient';
import type { Message } from '../models/message';

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: 'msg-1',
    queueName: 'q',
    exchange: 'events',
    routingKey: 'order.created',
    contentType: 'application/json',
    body: '{"event":"order.created"}',
    headers: { 'x-source': 'test' },
    timestamp: new Date(),
    redelivered: false,
    ...overrides,
  };
}

function makeBroker(): jest.Mocked<IBrokerClient> {
  return {
    connect: jest.fn(),
    disconnect: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    ack: jest.fn(),
    nack: jest.fn(),
    publish: jest.fn().mockReturnValue(true),
    onError: jest.fn(),
    isConnected: true,
  };
}

describe('ReplayService', () => {
  describe('replay()', () => {
    it('throws when message id is not in the buffer', async () => {
      const buffer = new MessageBuffer(10);
      const broker = makeBroker();
      const svc = new ReplayService(buffer, broker);
      await expect(svc.replay('unknown-id', '')).rejects.toThrow('unknown-id');
    });

    it('publishes to the default exchange with original routing key when targetExchange is empty', async () => {
      const buffer = new MessageBuffer(10);
      const msg = makeMessage({ id: 'msg-1', exchange: 'events', routingKey: 'order.created' });
      buffer.add(msg);
      const broker = makeBroker();
      const svc = new ReplayService(buffer, broker);

      await svc.replay('msg-1', '');

      expect(broker.publish).toHaveBeenCalledWith(
        '',
        'order.created',
        Buffer.from(msg.body, 'utf-8'),
        expect.objectContaining({ contentType: msg.contentType }),
      );
    });

    it('publishes to the specified targetExchange', async () => {
      const buffer = new MessageBuffer(10);
      const msg = makeMessage({ id: 'msg-1' });
      buffer.add(msg);
      const broker = makeBroker();
      const svc = new ReplayService(buffer, broker);

      await svc.replay('msg-1', 'dead-letter');

      expect(broker.publish).toHaveBeenCalledWith(
        'dead-letter',
        expect.any(String),
        expect.any(Buffer),
        expect.anything(),
      );
    });

    it('uses targetRoutingKey when provided', async () => {
      const buffer = new MessageBuffer(10);
      const msg = makeMessage({ id: 'msg-1', routingKey: 'original' });
      buffer.add(msg);
      const broker = makeBroker();
      const svc = new ReplayService(buffer, broker);

      await svc.replay('msg-1', '', 'overridden');

      expect(broker.publish).toHaveBeenCalledWith(
        expect.any(String),
        'overridden',
        expect.any(Buffer),
        expect.anything(),
      );
    });

    it('uses original routingKey when targetRoutingKey is undefined', async () => {
      const buffer = new MessageBuffer(10);
      const msg = makeMessage({ id: 'msg-1', routingKey: 'original' });
      buffer.add(msg);
      const broker = makeBroker();
      const svc = new ReplayService(buffer, broker);

      await svc.replay('msg-1', 'some-exchange');

      expect(broker.publish).toHaveBeenCalledWith(
        expect.any(String),
        'original',
        expect.any(Buffer),
        expect.anything(),
      );
    });

    it('injects x-mqtracker-* replay headers', async () => {
      const buffer = new MessageBuffer(10);
      const msg = makeMessage({ id: 'msg-1', headers: { 'x-source': 'original' } });
      buffer.add(msg);
      const broker = makeBroker();
      const svc = new ReplayService(buffer, broker);

      await svc.replay('msg-1', '');

      const [, , , options] = (broker.publish as jest.Mock).mock.calls[0] as [string, string, Buffer, Record<string, unknown>];
      const headers = options['headers'] as Record<string, unknown>;
      expect(headers['x-mqtracker-replay']).toBe(true);
      expect(headers['x-mqtracker-original-id']).toBe('msg-1');
      expect(typeof headers['x-mqtracker-replayed-at']).toBe('string');
    });

    it('preserves original headers alongside replay headers', async () => {
      const buffer = new MessageBuffer(10);
      const msg = makeMessage({ id: 'msg-1', headers: { 'x-source': 'upstream' } });
      buffer.add(msg);
      const broker = makeBroker();
      const svc = new ReplayService(buffer, broker);

      await svc.replay('msg-1', '');

      const [, , , options] = (broker.publish as jest.Mock).mock.calls[0] as [string, string, Buffer, Record<string, unknown>];
      const headers = options['headers'] as Record<string, unknown>;
      expect(headers['x-source']).toBe('upstream');
    });
  });

  describe('replayAll()', () => {
    it('replays all provided ids', async () => {
      const buffer = new MessageBuffer(10);
      buffer.add(makeMessage({ id: 'a' }));
      buffer.add(makeMessage({ id: 'b' }));
      const broker = makeBroker();
      const svc = new ReplayService(buffer, broker);

      await svc.replayAll(['a', 'b'], '');

      expect(broker.publish).toHaveBeenCalledTimes(2);
    });

    it('rejects if any id is missing', async () => {
      const buffer = new MessageBuffer(10);
      buffer.add(makeMessage({ id: 'a' }));
      const broker = makeBroker();
      const svc = new ReplayService(buffer, broker);

      await expect(svc.replayAll(['a', 'missing'], '')).rejects.toThrow('missing');
    });
  });

  describe('getReplayableMessages()', () => {
    it('returns all messages currently in the buffer', () => {
      const buffer = new MessageBuffer(10);
      buffer.add(makeMessage({ id: 'a' }));
      buffer.add(makeMessage({ id: 'b' }));
      const svc = new ReplayService(buffer, {} as IBrokerClient);
      expect(svc.getReplayableMessages()).toHaveLength(2);
    });
  });
});
