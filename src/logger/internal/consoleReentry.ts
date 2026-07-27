/**
 * Shared re-entrancy flag bridging {@link ConsoleTransport} and
 * {@link installConsoleProxy}.
 *
 * The hazard: a logger configured with BOTH a `ConsoleTransport` and an
 * installed console proxy double-records every direct `logger.*()` call —
 *
 *   logger.info('x')
 *     → ConsoleTransport.write() → console.log('[INFO] …')   // patched by the proxy
 *       → proxy re-forwards → logger.info('[INFO] …')        // ← duplicate entry
 *
 * The proxy's own `inForward` guard only covers console-originated calls, not
 * this transport-originated one. So the ConsoleTransport marks its own
 * `console.*` output with this flag, and the proxy skips (passes straight to the
 * original console) while it is set.
 */

let writingFromTransport = false;

/** True while a `ConsoleTransport` is emitting its own `console.*` output. */
export function isConsoleTransportWriting(): boolean {
  return writingFromTransport;
}

/** Run `fn` with the transport-writing flag set, restoring it afterwards. */
export function runAsConsoleTransport(fn: () => void): void {
  const prev = writingFromTransport;
  writingFromTransport = true;
  try {
    fn();
  } finally {
    writingFromTransport = prev;
  }
}
