/**
 * In-memory registry of state-slice selectors registered via
 * `useDebugPanel().registerStateSlice(name, selector)`.
 *
 * Internal to `<DebugPanelProvider>`. The `subscribe` / `getSnapshot` pair is
 * `useSyncExternalStore`-compatible so the State tab can re-render when
 * slices are added or removed without re-rendering the consumer's tree.
 *
 * The snapshot is the list of slice **names**, not their values — values are
 * pulled from each selector at render time. This keeps the registry's
 * notification cadence (only on add/remove) independent of the consumer's
 * state mutation cadence.
 *
 * @internal
 */
export type SliceSelector = () => unknown;

export class SliceRegistry {
  private slices = new Map<string, SliceSelector>();
  private snapshot: readonly string[] = [];
  private readonly listeners = new Set<() => void>();

  /**
   * Register a selector under `name`. Re-registering with an existing name
   * replaces the previous selector — predictable behaviour for hot-reload.
   *
   * @returns A function that unregisters this slice. Idempotent.
   */
  register(name: string, selector: SliceSelector): () => void {
    this.slices.set(name, selector);
    this.invalidate();
    let unregistered = false;
    return () => {
      if (unregistered) return;
      unregistered = true;
      // Only delete if the current entry is still this selector — protects
      // against unregistering a stale closure after the consumer re-registered.
      if (this.slices.get(name) === selector) {
        this.slices.delete(name);
        this.invalidate();
      }
    };
  }

  /** Read a selector by name. Returns `undefined` when the name is unknown. */
  get(name: string): SliceSelector | undefined {
    return this.slices.get(name);
  }

  /** Snapshot of registered names. Stable identity until the registry changes. */
  getSnapshot = (): readonly string[] => this.snapshot;

  /** `useSyncExternalStore` subscribe. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private invalidate(): void {
    this.snapshot = [...this.slices.keys()].sort();
    for (const listener of this.listeners) listener();
  }
}
