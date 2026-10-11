/**
 * Decides when to take a new thumbnail picture of the design. It waits until the design has been
 * saved and its shapes have been worked out ("ready") and has then stayed that way for a while, takes
 * one picture per version of the design, and never overlaps two. Failures are logged and retried the
 * next time it is told about that version.
 */
export class ThumbnailScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private done: unknown = undefined;
  private running = false;
  private latest: { ready: boolean; version: unknown } = { ready: false, version: undefined };
  private disposed = false;

  constructor(
    private readonly run: () => Promise<void>,
    private readonly delayMs = 2000,
  ) {}

  /** Call whenever the design, its saved state or its geometry changes. `version` identifies the design as it is now. */
  notify(ready: boolean, version: unknown): void {
    if (this.disposed) return;
    this.latest = { ready, version };
    this.clear();
    if (!ready || this.running || version === this.done) return;

    this.timer = setTimeout(() => {
      this.timer = null;
      void this.take(version);
    }, this.delayMs);
  }

  dispose(): void {
    this.disposed = true;
    this.clear();
  }

  private async take(version: unknown): Promise<void> {
    this.running = true;
    try {
      await this.run();
      this.done = version;
    } catch (error) {
      console.warn('Could not update the thumbnail:', error);
    } finally {
      this.running = false;
      // The design may have changed while the picture was being taken; that version still needs its own.
      if (this.latest.version !== version) this.notify(this.latest.ready, this.latest.version);
    }
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}
