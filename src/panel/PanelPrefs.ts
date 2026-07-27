import { createContext, useCallback, useContext, useState } from 'react';

/**
 * Synchronous key→string persistence the panel uses to remember UI preferences
 * (active tab, filter selections) across opens and app restarts.
 *
 * Deliberately minimal and **injected** — the core ships no storage dependency.
 * Satisfied directly by `react-native-mmkv` (its `getString`/`set` map to
 * `getItem`/`setItem` with a tiny adapter), `AsyncStorage` is async so wrap it,
 * or any object with these two methods. When no persistence is provided, prefs
 * live in memory only (they survive a panel close within a session, not an app
 * restart).
 *
 * @example MMKV adapter
 * ```ts
 * import { MMKV } from 'react-native-mmkv';
 * const store = new MMKV({ id: 'observability-prefs' });
 * const persist = {
 *   getItem: (k: string) => store.getString(k) ?? null,
 *   setItem: (k: string, v: string) => store.set(k, v),
 * };
 * <DebugPanelProvider persist={persist} ... />
 * ```
 */
export interface PanelPersistence {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  /**
   * Optional bulk clear of the panel's stored preferences. When implemented,
   * the Settings tab offers a "Clear panel prefs" action. Most consumers can
   * delegate to their store's own clear/delete-all; the panel namespaces its
   * keys under `observability.panel.` so a scoped clear is safe. When absent, the
   * Settings action is hidden (the minimal `getItem`/`setItem` contract can't
   * enumerate keys, so the panel cannot clear them itself).
   */
  clear?(): void;
}

/** Key prefix so panel prefs never collide with the consumer's own keys. */
const PREFIX = 'observability.panel.';

const PanelPrefsContext = createContext<PanelPersistence | null>(null);

export const PanelPrefsProvider = PanelPrefsContext.Provider;

/**
 * Returns the injected {@link PanelPersistence}, or `null` when none was
 * configured. Lets the Settings tab offer a "Clear panel prefs" action only
 * when the store supports {@link PanelPersistence.clear}.
 */
export function usePanelPrefs(): PanelPersistence | null {
  return useContext(PanelPrefsContext);
}

/**
 * A `useState`-shaped hook whose value is persisted through the panel's
 * injected {@link PanelPersistence} (if any). Values are JSON-serialised under a
 * namespaced key. With no persistence configured it behaves like plain
 * `useState` (in-memory). Reads are synchronous on first render — no flash of
 * default state.
 *
 * @param key - stable preference key (namespaced internally)
 * @param defaultValue - value used when nothing is stored / persistence absent
 */
export function usePersistentState<T>(key: string, defaultValue: T): [T, (next: T) => void] {
  const persistence = useContext(PanelPrefsContext);
  const fullKey = `${PREFIX}${key}`;

  const [value, setValueState] = useState<T>(() => {
    if (persistence === null) return defaultValue;
    try {
      const raw = persistence.getItem(fullKey);
      if (raw === null) return defaultValue;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  });

  const setValue = useCallback(
    (next: T) => {
      setValueState(next);
      if (persistence !== null) {
        try {
          persistence.setItem(fullKey, JSON.stringify(next));
        } catch {
          // Persistence is best-effort — a failed write must never crash the panel.
        }
      }
    },
    [persistence, fullKey]
  );

  return [value, setValue];
}
