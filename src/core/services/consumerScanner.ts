export interface ConsumerMatch {
  filePath: string;
  line: number;
  column: number;
  matchText: string;
}

export interface ScanOptions {
  queueName: string;
  /** Additional patterns to search alongside the default set */
  extraPatterns?: RegExp[];
}

export class ConsumerScanner {
  private static readonly DEFAULT_PATTERNS = [
    // amqplib: channel.consume('queue-name', ...)
    /channel\s*\.\s*consume\s*\(\s*['"`]([^'"`]+)['"`]/,
    // @RabbitMQHandler('queue-name') (NestJS / decorator style)
    /@RabbitMQHandler\s*\(\s*['"`]([^'"`]+)['"`]/,
    // @RabbitSubscribe({ queue: 'queue-name' })
    /queue\s*:\s*['"`]([^'"`]+)['"`]/,
    // Generic string literal that equals queue name
  ];

  buildPatterns(queueName: string, extraPatterns: RegExp[] = []): RegExp[] {
    const escaped = queueName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const specific = new RegExp(
      `(consume|subscribe|listen|handler|consumer)[^(]*\\([^)]*['"\`]${escaped}['"\`]`,
      'i',
    );
    return [...ConsumerScanner.DEFAULT_PATTERNS, specific, ...extraPatterns];
  }

  matchesLine(line: string, patterns: RegExp[]): RegExpMatchArray | null {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match) return match;
    }
    return null;
  }

  scanLines(
    lines: string[],
    filePath: string,
    options: ScanOptions,
  ): ConsumerMatch[] {
    const patterns = this.buildPatterns(options.queueName, options.extraPatterns);
    const results: ConsumerMatch[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = this.matchesLine(line, patterns);
      if (match) {
        results.push({
          filePath,
          line: i,
          column: match.index ?? 0,
          matchText: match[0],
        });
      }
    }

    return results;
  }
}