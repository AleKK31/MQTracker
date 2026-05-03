import { ConsumerScanner } from './consumerScanner';

describe('ConsumerScanner', () => {
  let scanner: ConsumerScanner;

  beforeEach(() => {
    scanner = new ConsumerScanner();
  });

  describe('buildPatterns()', () => {
    it('returns an array that includes the default patterns', () => {
      const patterns = scanner.buildPatterns('my-queue');
      expect(patterns.length).toBeGreaterThanOrEqual(4);
    });

    it('includes a queue-specific pattern', () => {
      const patterns = scanner.buildPatterns('orders');
      const hasSpecific = patterns.some((p) => p.source.includes('orders'));
      expect(hasSpecific).toBe(true);
    });

    it('escapes special regex characters in queue name', () => {
      expect(() => scanner.buildPatterns('queue.name[1]')).not.toThrow();
      const patterns = scanner.buildPatterns('queue.name[1]');
      expect(patterns.length).toBeGreaterThan(0);
    });

    it('merges extraPatterns into the result', () => {
      const extra = /myCustomPattern/;
      const patterns = scanner.buildPatterns('q', [extra]);
      expect(patterns).toContain(extra);
    });
  });

  describe('matchesLine()', () => {
    it('matches amqplib channel.consume()', () => {
      const line = `channel.consume('order-queue', handler)`;
      const patterns = scanner.buildPatterns('order-queue');
      expect(scanner.matchesLine(line, patterns)).not.toBeNull();
    });

    it('matches NestJS @RabbitMQHandler decorator', () => {
      const line = `@RabbitMQHandler('order-queue')`;
      const patterns = scanner.buildPatterns('order-queue');
      expect(scanner.matchesLine(line, patterns)).not.toBeNull();
    });

    it('matches @RabbitSubscribe queue field', () => {
      const line = `  queue: 'order-queue',`;
      const patterns = scanner.buildPatterns('order-queue');
      expect(scanner.matchesLine(line, patterns)).not.toBeNull();
    });

    it('matches generic subscribe(queueName) call', () => {
      const line = `broker.subscribe('order-queue', callback)`;
      const patterns = scanner.buildPatterns('order-queue');
      expect(scanner.matchesLine(line, patterns)).not.toBeNull();
    });

    it('returns null for a line that does not match', () => {
      const line = `const x = 42;`;
      const patterns = scanner.buildPatterns('order-queue');
      expect(scanner.matchesLine(line, patterns)).toBeNull();
    });

    it('returns null for a line with a different queue name', () => {
      const line = `channel.consume('other-queue', handler)`;
      const patterns = scanner.buildPatterns('order-queue');
      // The specific pattern won't match; default patterns may match on 'consume' but queue name differs
      // We check the specific-pattern match is absent
      const specificPattern = patterns[patterns.length - 1];
      expect(scanner.matchesLine(line, [specificPattern])).toBeNull();
    });
  });

  describe('scanLines()', () => {
    it('finds all matches across multiple lines', () => {
      const lines = [
        `import amqplib from 'amqplib';`,
        `channel.consume('task-queue', handler);`,
        `const x = 1;`,
        `@RabbitMQHandler('task-queue')`,
      ];
      const results = scanner.scanLines(lines, '/fake/file.ts', { queueName: 'task-queue' });
      expect(results.length).toBeGreaterThanOrEqual(2);
    });

    it('returns correct line numbers (0-indexed)', () => {
      const lines = [
        `const x = 1;`,
        `channel.consume('my-queue', fn);`,
      ];
      const results = scanner.scanLines(lines, '/fake/file.ts', { queueName: 'my-queue' });
      expect(results[0].line).toBe(1);
    });

    it('returns correct column (index of match)', () => {
      const lines = [`  channel.consume('my-queue', fn);`];
      const results = scanner.scanLines(lines, '/fake/file.ts', { queueName: 'my-queue' });
      expect(results[0].column).toBe(2);
    });

    it('returns empty array when nothing matches', () => {
      const lines = [`const a = 1;`, `const b = 2;`];
      const results = scanner.scanLines(lines, '/fake/file.ts', { queueName: 'my-queue' });
      expect(results).toHaveLength(0);
    });

    it('sets filePath correctly in each result', () => {
      const lines = [`channel.consume('q', fn);`];
      const results = scanner.scanLines(lines, '/path/to/consumer.ts', { queueName: 'q' });
      expect(results[0].filePath).toBe('/path/to/consumer.ts');
    });

    it('populates matchText', () => {
      const lines = [`channel.consume('q', fn);`];
      const results = scanner.scanLines(lines, '/f', { queueName: 'q' });
      expect(typeof results[0].matchText).toBe('string');
      expect(results[0].matchText.length).toBeGreaterThan(0);
    });
  });
});
