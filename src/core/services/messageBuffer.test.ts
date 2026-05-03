import { MessageBuffer } from './messageBuffer';
import type { Message } from '../models/message';

function makeMessage(id: string, offsetMs = 0): Message {
  return {
    id,
    queueName: 'test-queue',
    exchange: '',
    routingKey: 'test',
    contentType: 'application/json',
    body: `{"id":"${id}"}`,
    headers: {},
    timestamp: new Date(1_000_000 + offsetMs),
    redelivered: false,
  };
}

describe('MessageBuffer', () => {
  describe('add / get', () => {
    it('stores and retrieves a message by id', () => {
      const buf = new MessageBuffer(10);
      const msg = makeMessage('a');
      buf.add(msg);
      expect(buf.get('a')).toBe(msg);
    });

    it('returns undefined for an unknown id', () => {
      const buf = new MessageBuffer(10);
      expect(buf.get('nope')).toBeUndefined();
    });

    it('increments size on add', () => {
      const buf = new MessageBuffer(10);
      buf.add(makeMessage('a'));
      buf.add(makeMessage('b'));
      expect(buf.size).toBe(2);
    });
  });

  describe('capacity / eviction', () => {
    it('does not exceed capacity', () => {
      const buf = new MessageBuffer(3);
      buf.add(makeMessage('a'));
      buf.add(makeMessage('b'));
      buf.add(makeMessage('c'));
      buf.add(makeMessage('d'));
      expect(buf.size).toBe(3);
    });

    it('evicts the oldest message (circular LRU)', () => {
      const buf = new MessageBuffer(3);
      buf.add(makeMessage('a'));
      buf.add(makeMessage('b'));
      buf.add(makeMessage('c'));
      buf.add(makeMessage('d')); // evicts 'a'
      expect(buf.get('a')).toBeUndefined();
      expect(buf.get('d')).toBeDefined();
    });

    it('handles repeated adds beyond capacity without throwing', () => {
      const buf = new MessageBuffer(2);
      for (let i = 0; i < 100; i++) {
        buf.add(makeMessage(String(i)));
      }
      expect(buf.size).toBe(2);
    });
  });

  describe('getAll', () => {
    it('returns messages sorted by timestamp', () => {
      const buf = new MessageBuffer(10);
      buf.add(makeMessage('c', 200));
      buf.add(makeMessage('a', 0));
      buf.add(makeMessage('b', 100));
      const all = buf.getAll();
      expect(all.map((m) => m.id)).toEqual(['a', 'b', 'c']);
    });

    it('returns empty array when buffer is empty', () => {
      const buf = new MessageBuffer(10);
      expect(buf.getAll()).toHaveLength(0);
    });
  });

  describe('clear', () => {
    it('removes all messages and resets size', () => {
      const buf = new MessageBuffer(10);
      buf.add(makeMessage('a'));
      buf.add(makeMessage('b'));
      buf.clear();
      expect(buf.size).toBe(0);
      expect(buf.getAll()).toHaveLength(0);
    });

    it('allows adding messages after clear', () => {
      const buf = new MessageBuffer(3);
      buf.add(makeMessage('a'));
      buf.clear();
      buf.add(makeMessage('b'));
      expect(buf.get('b')).toBeDefined();
      expect(buf.get('a')).toBeUndefined();
    });
  });
});
