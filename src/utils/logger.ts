export interface LogEntry {
  timestamp: Date;
  source: string;
  message: string;
}

class DebugLogger {
  private logs: LogEntry[] = [];
  private listeners: Set<() => void> = new Set();

  log(source: string, message: string) {
    this.logs.push({ timestamp: new Date(), source, message });
    console.log(`[${source}] ${message}`);
    this.notify();
  }

  getLogs() {
    return this.logs;
  }

  getFormattedLogs() {
    return this.logs.map(l => `[${l.timestamp.toISOString()}] [${l.source}] ${l.message}`).join('\n');
  }

  clear() {
    this.logs = [];
    this.notify();
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach(l => l());
  }
}

export const logger = new DebugLogger();
