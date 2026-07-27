import type { Logger } from './Logger';
import { isConsoleTransportWriting } from './internal/consoleReentry';

/** Console methods this proxy intercepts, mapped to a logger level method. */
type ConsoleMethod = 'log' | 'info' | 'warn' | 'error' | 'debug';

/** Minimal shape of the global `console` we touch — keeps this testable. */
interface ConsoleLike {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
}

/** Options for {@link installConsoleProxy}. */
export interface InstallConsoleProxyOptions {
  /**
   * Also call the original `console` method so existing console output (LogBox,
   * Hermes inspector, CI logs) is preserved. Default: `true`. Set `false` to
   * route console output _exclusively_ through the logger.
   */
  passthrough?: boolean;
  /**
   * The console object to patch. Defaults to the global `console`. Inject a stub
   * in tests.
   */
  console?: ConsoleLike;
  /**
   * Namespace stamped on proxied entries (in `context.source`). Default:
   * `'console'`. Lets you tell logger-originated entries apart from
   * console-originated ones in the panel.
   */
  namespace?: string;
}

/** Removes the proxy and restores the original `console` methods. */
export type UninstallConsoleProxy = () => void;

/**
 * Maps each intercepted console method to the logger level it forwards to.
 * `console.log` → INFO (no DEBUG analogue on the console side for plain `log`).
 */
const METHOD_TO_LOGGER: Record<ConsoleMethod, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: 'debug',
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
};

/**
 * Routes `console.log` / `.info` / `.warn` / `.error` / `.debug` through a
 * Observability {@link Logger}, so an existing codebase that logs with `console.*`
 * gets structured capture (panel, transports, adapters, redaction) with **no
 * call-site changes**. Intended as a migration on-ramp, not the long-term API.
 *
 * **Recursion safety.** The classic hazard: the logger has a `ConsoleTransport`,
 * so `console.log()` → `logger.info()` → `ConsoleTransport.write()` →
 * `console.log()` → … This proxy captures the **original** console methods at
 * install time and routes the transport's own output back through them via a
 * re-entrancy flag, so the loop is broken — a `ConsoleTransport` on the same
 * logger prints exactly once and never recurses.
 *
 * The first argument of each call becomes the log `message` (stringified if not
 * already a string); any remaining arguments are attached as
 * `context.args`. The proxy stamps `context.source` with the configured
 * namespace (default `'console'`).
 *
 * Returns an idempotent teardown that restores the original console. Calling
 * `installConsoleProxy` twice without uninstalling is a no-op-safe re-install
 * (the second call restores first), so it cannot double-wrap.
 *
 * @param logger - the logger that receives proxied console calls
 * @param options - see {@link InstallConsoleProxyOptions}
 * @returns a function that restores the original `console`
 * @stability experimental
 *
 * @example
 * ```ts
 * const uninstall = installConsoleProxy(logger);
 * console.warn('low disk', { freeMb: 12 }); // → logger.warn('low disk', { source: 'console', args: [{ freeMb: 12 }] })
 * // ...later, in tests or on teardown:
 * uninstall();
 * ```
 */
export function installConsoleProxy(
  logger: Logger,
  options: InstallConsoleProxyOptions = {}
): UninstallConsoleProxy {
  const target = options.console ?? (globalThis.console as unknown as ConsoleLike);
  const passthrough = options.passthrough ?? true;
  const namespace = options.namespace ?? 'console';

  const methods: ConsoleMethod[] = ['debug', 'log', 'info', 'warn', 'error'];

  // Snapshot the originals BEFORE patching. The ConsoleTransport's own output is
  // routed back through these, never through the patched versions.
  const originals = {} as Record<ConsoleMethod, ConsoleLike[ConsoleMethod]>;
  for (const m of methods) originals[m] = target[m];

  // Re-entrancy guard: while we are forwarding into the logger, any console call
  // the logger triggers (e.g. a ConsoleTransport) must hit the ORIGINAL console,
  // not loop back into the proxy.
  let inForward = false;

  for (const method of methods) {
    const original = originals[method];
    const loggerMethod = METHOD_TO_LOGGER[method];

    target[method] = (...args: unknown[]): void => {
      if (inForward || isConsoleTransportWriting()) {
        // Either we're already inside a logger forward, or this call is a
        // `ConsoleTransport` emitting its own output (a direct `logger.*()` that
        // fanned out to the transport). Go straight to the original — never
        // re-forward, or every direct logger call would record twice.
        original(...args);
        return;
      }

      const [first, ...rest] = args;
      const message = typeof first === 'string' ? first : safeStringify(first);
      const context: Record<string, unknown> = { source: namespace };
      if (rest.length > 0) context.args = rest;

      inForward = true;
      try {
        if (loggerMethod === 'error') {
          // Preserve an Error first-arg as the structured error param.
          if (first instanceof Error) {
            logger.error(first.message, first, rest.length > 0 ? { ...context } : context);
          } else {
            logger.error(message, context);
          }
        } else {
          logger[loggerMethod](message, context);
        }
      } catch {
        // The proxy must never break the caller's console.* call.
      } finally {
        inForward = false;
      }

      if (passthrough) original(...args);
    };
  }

  let uninstalled = false;
  return () => {
    if (uninstalled) return;
    uninstalled = true;
    for (const m of methods) target[m] = originals[m];
  };
}

/** Best-effort stringify for a non-string first console arg. Never throws. */
function safeStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  try {
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  } catch {
    return String(value);
  }
}
