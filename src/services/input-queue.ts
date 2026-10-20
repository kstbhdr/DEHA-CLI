/** One consumer for all interactive input, including commands. */
export class InputQueue {
  private items: string[];
  private busy = false;
  private stopped = false;

  constructor(private readonly options: {
    initial?: string[];
    process: (input: string) => Promise<void>;
    changed: (pending: string[]) => void;
    idle: () => void;
    error: (error: unknown) => void;
  }) { this.items = [...(options.initial ?? [])]; }

  get running(): boolean { return this.busy; }
  get pending(): string[] { return [...this.items]; }

  enqueue(input: string): void {
    if (this.stopped) return;
    this.items.push(input);
    this.options.changed(this.pending);
    this.start();
  }

  remove(index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= this.items.length) return false;
    this.items.splice(index, 1);
    this.options.changed(this.pending);
    return true;
  }

  clear(): void {
    this.items = [];
    this.options.changed([]);
  }

  stop(): void { this.stopped = true; }

  start(): void {
    if (this.busy || this.stopped || !this.items.length) return;
    this.busy = true;
    void this.drain();
  }

  private async drain(): Promise<void> {
    try {
      while (!this.stopped && this.items.length) {
        const input = this.items.shift()!;
        this.options.changed(this.pending);
        try { await this.options.process(input); }
        catch (error) { this.options.error(error); }
      }
    } finally {
      this.busy = false;
      this.options.idle();
    }
  }
}
