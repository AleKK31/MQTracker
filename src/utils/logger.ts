import type * as vscode from 'vscode';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export class Logger {
  private readonly channel: vscode.OutputChannel;

  constructor(channel: vscode.OutputChannel) {
    this.channel = channel;
  }

  private log(level: LogLevel, message: string, ...args: unknown[]): void {
    const ts = new Date().toISOString();
    const extra = args.length > 0 ? ' ' + args.map(serialize).join(' ') : '';
    this.channel.appendLine(`[${ts}] [${level.toUpperCase()}] ${message}${extra}`);
  }

  debug(message: string, ...args: unknown[]): void {
    this.log('debug', message, ...args);
  }

  info(message: string, ...args: unknown[]): void {
    this.log('info', message, ...args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.log('warn', message, ...args);
  }

  error(message: string, ...args: unknown[]): void {
    this.log('error', message, ...args);
  }

  show(): void {
    this.channel.show();
  }

  dispose(): void {
    this.channel.dispose();
  }
}

function serialize(value: unknown): string {
  if (value instanceof Error) return `${value.message}\n${value.stack ?? ''}`;
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}
