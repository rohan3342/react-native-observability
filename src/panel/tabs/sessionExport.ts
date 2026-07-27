import type { LogEntry } from '../../logger/types';
import type { NetworkLogEntry } from '../../integrations/http';
import type { ScreenLifecycleEvent } from '../../integrations/screen';

/** Inputs for a full-session export bundle. All optional — absent sections are omitted. */
export interface SessionExportInput {
  readonly sessionId?: string | undefined;
  readonly version?: string;
  readonly logs?: readonly LogEntry[];
  readonly network?: readonly NetworkLogEntry[];
  readonly screens?: readonly ScreenLifecycleEvent[];
  readonly state?: Readonly<Record<string, unknown>>;
  /** Generation timestamp (ms). Injected for deterministic tests. */
  readonly generatedAt?: number;
}

/**
 * Builds a single JSON bundle of an entire debug session — logs, network
 * entries, screen events, and registered state slices — for the Settings tab's
 * "Export session" action (shared via the OS share sheet).
 *
 * Pure and dependency-free. Values are already redacted at capture time, so the
 * bundle never re-introduces unredacted data. Log/network entries are flattened
 * to plain JSON (the live entries carry closures like `toCurl` that don't
 * serialise); non-serialisable state values degrade gracefully.
 */
export function formatSessionExport(input: SessionExportInput): string {
  const bundle: Record<string, unknown> = {
    observability: input.version ?? 'unknown',
    generatedAt: new Date(input.generatedAt ?? 0).toISOString(),
    ...(input.sessionId !== undefined ? { sessionId: input.sessionId } : {}),
  };

  if (input.logs !== undefined) {
    bundle.logs = input.logs.map(e => ({
      level: e.level,
      namespace: e.namespace,
      message: e.message,
      timestamp: new Date(e.timestamp).toISOString(),
      ...(e.sessionId !== undefined ? { sessionId: e.sessionId } : {}),
      ...(e.context !== undefined ? { context: e.context } : {}),
      ...(e.error !== undefined
        ? { error: { message: e.error.message, stack: e.error.stack } }
        : {}),
    }));
  }

  if (input.network !== undefined) {
    bundle.network = input.network.map(e => ({
      method: e.method,
      url: e.url,
      status: e.statusCode,
      state: e.state,
      durationMs: e.durationMs,
      timestamp: new Date(e.timestamp).toISOString(),
      ...(e.requestHeaders !== undefined ? { requestHeaders: e.requestHeaders } : {}),
      ...(e.requestBody !== undefined ? { requestBody: e.requestBody } : {}),
      ...(e.responseHeaders !== undefined ? { responseHeaders: e.responseHeaders } : {}),
      ...(e.responseBody !== undefined ? { responseBody: e.responseBody } : {}),
      ...(e.error !== undefined ? { error: e.error } : {}),
    }));
  }

  if (input.screens !== undefined) {
    bundle.screens = input.screens.map(e => ({ ...e }));
  }

  if (input.state !== undefined) bundle.state = input.state;

  try {
    return JSON.stringify(bundle, jsonSafeReplacer(), 2);
  } catch {
    return JSON.stringify({ error: 'session export failed to serialise' }, null, 2);
  }
}

/** Replacer that keeps the export from throwing on circular / exotic values. */
function jsonSafeReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();
  return (_key, value) => {
    if (typeof value === 'bigint') return `<bigint:${value.toString()}>`;
    if (typeof value === 'function') return '<function>';
    if (typeof value === 'symbol') return value.toString();
    if (typeof value === 'object' && value !== null) {
      if (seen.has(value)) return '<circular>';
      seen.add(value);
    }
    return value;
  };
}
