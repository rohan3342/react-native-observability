# Architecture

This document describes Observability's design, data flows, and core principles.

## Design Philosophy

Observability follows a **transport-agnostic, provider-agnostic** architecture:

- **Transport-agnostic:** Logs flow through composable transports (Console, Memory, MMKV) independently. Each transport can be mixed/matched.
- **Provider-agnostic:** Remote backends (Sentry, Datadog, your service) are wired via adapters, not hardcoded. Zero forced dependencies.

This inversion of control allows you to:

- Use Observability with any backend (today Sentry, tomorrow your own service)
- Install nothing if you want local-only logging
- Mix and match integrations (Axios + fetch + React Query, not just Axios)

## Core Data Flow

See [Diagrams](./diagrams.md) for visual representations.

Conceptually:

```
App Code
├─ logger.info/warn/error/debug
├─ trackScreen / trackAsyncOperation
├─ HTTP requests
└─ Uncaught errors / promise rejections

          ▼

Logger Core (Hot Path)
├─ LogLevel filtering
├─ Sampling (per-key, per-namespace)
├─ Rate limiting (token bucket)
├─ PII redaction (key-path + value-side)
├─ Session ID tagging (if configured)
└─ Screen ID tagging (if configured)

          ▼

    ┌────┬────┬────┐
    ▼    ▼    ▼    ▼

Transports    Adapters     Integrations
├─ Console    ├─ Custom     ├─ HTTP Store
├─ Memory     │ (async q)   ├─ Screen Store
└─ MMKV       └─ Isolated   ├─ Breadcrumbs
              error         └─ Perf Spans
              handling

          ▼

On-Device Panel (Reads)
├─ Logs (from Memory/MMKV Transport)
├─ Network (from HTTP Store)
├─ State (from app-provided slices)
├─ Navigation (from Screen Store)
├─ Performance (from Perf Store)
└─ Settings (panel prefs + Health)
```

### Logger Core (Hot Path)

The Logger is called on every `logger.info()`, `logger.warn()`, etc. This is the hot path—it must be fast.

1. **LogLevel filtering:** Entry is dropped if its level is below the configured threshold
2. **Namespace matching:** Each transport/adapter has a namespace filter; entries not matching are skipped for that sink
3. **Sampling:** Per-namespace or per-level sampling may drop the entry probabilistically
4. **Rate limiting:** Token bucket throttling may drop the entry if the app has logged too much recently
5. **Redaction:** Key-path and value-side matchers redact PII (email, JWT, passwords)
6. **Screen/Session tagging:** If providers are configured, the entry is stamped with the active screen and session ID
7. **Transport writes:** Each transport receives the entry and persists it independently (Console writes to logcat, Memory appends to ring buffer, MMKV writes to disk)
8. **Adapter queueing (deferred):** The entry is enqueued for adapter fan-out, and a microtask is scheduled to drain the queue

### Transports (Independent Writers)

Transports are **write-only sinks**. Each receives the same entry and persists it independently:

- **ConsoleTransport** — writes to React Native's `console.log()`, visible in Xcode/Android Studio/Logcat
- **MemoryTransport** — keeps a ring buffer (FIFO) in RAM, read by the panel via `useSyncExternalStore`
- **MMKVTransport** — persists to MMKV with per-session byte budgets and optional encryption

```ts
const logger = createLogger({
  transports: [
    new ConsoleTransport(), // to logcat
    new MemoryTransport(), // to panel
    new MMKVTransport({ storage }), // to disk (if MMKV installed)
  ],
});
```

Each transport can have its own `minLevel`, so WARN+ goes to disk while DEBUG goes to the console.

### Adapters (Async, Isolated)

Adapters are **async error forwarders**. They receive errors at or above their `minLevel` and send them to remote backends.

Crucially, adapters are:

- **Deferred:** Queued and drained asynchronously via microtask, so they never block the logger's hot path
- **Isolated:** Each adapter is wrapped in `try/catch`, so a broken backend never crashes your app or affects other adapters
- **Rate-limited:** The adapter queue has a bounded depth; if the queue is full, new entries are dropped (backpressure)

```ts
const logger = createLogger({
  adapters: [
    createCustomAdapter({
      name: 'sentry',
      captureException: (err, ctx) => SentrySDK.captureException(err, { extra: ctx }),
    }),
  ],
});
```

If the Sentry SDK hangs or throws, Observability keeps working. The error is logged internally, and subsequent errors queue up waiting for the queue to drain.

### Integrations (Autonomous Event Sources)

Integrations feed events into Observability's stores independently:

#### HTTP Observer

```ts
const http = createHttpObserver({ logger, screenProvider, breadcrumbs });

// Vendor shims call these
http.onStart({ id, url, method, ts /* ... */ });
http.onEnd({ id, status, durationMs /* ... */ });
```

Events are deduped by ID and stored in `http.store` (a `NetworkLogStore`). The panel reads the store in real-time and displays all requests.

#### Screen Tracking

```ts
useEffect(() => trackScreen('HomeScreen'), []);
```

Mount/unmount events are recorded in `ScreenMountStore`. The `createScreenProvider()` reads this store to resolve the current active screen, which is used to tag logs and HTTP entries.

#### Breadcrumb Timeline

```ts
new BreadcrumbTransport(); // every log becomes a breadcrumb
```

Every log entry is recorded in a `BreadcrumbStore`, which is persisted across launches (via MMKV if available). On crash, the crash trail is surfaced in the panel's Settings → Timeline.

#### Performance Spans

```ts
const span = trackPerformance('decode-image', { logger });
await decode();
span.end();
```

Spans are recorded in `PerfStore`, read by the panel's Performance tab.

### Debug Panel (Read-Only Client)

The panel is a React Native view that reads from all the stores in real-time:

- **Logs tab** — reads `MemoryTransport.entries` via `useSyncExternalStore`
- **Network tab** — reads `NetworkLogStore.entries` and mock rules
- **Navigation tab** — reads `ScreenMountStore.history`
- **Performance tab** — reads `PerfStore.spans`
- **State tab** — reads app-provided state slices and feature flags
- **Settings tab** — displays panel prefs, session selector, health metrics, breadcrumb timeline

The panel never writes to these stores; it reads only. This makes it safe to crash the panel without affecting logging.

## Key Design Decisions

### Why Provider-Agnostic?

Traditional observability stacks hardcode a vendor (Sentry, Datadog). This forces you to:

- Commit to that vendor's SDK upfront
- Bundle their entire library even if you don't use it
- Migrate all your instrumentation if you switch vendors

Observability inverts this: adapters are optional. You can:

- Use Observability with no backend at all (local-only logging)
- Add a backend later (or swap vendors) by plugging in an adapter
- Ship zero backend dependencies if you don't need them

### Why Transports?

Transports decoupled from adapters allow:

- **Console logging for dev, MMKV for staging, memory-only in production** — mix transports independently
- **Local-first, backend-optional** — logs persist locally before (if ever) being forwarded
- **Fault isolation** — a broken backend doesn't affect local logging

### Why Sampling & Rate Limiting?

Logging too much can:

- Fill disk/memory
- Overwhelm backends
- Cause the app to slow down

Observability prevents this with:

- **Per-namespace sampling** — e.g., "log 10% of 'network' entries"
- **Per-level sampling** — e.g., "log 100% of ERROR, 50% of WARN"
- **Token-bucket rate limiting** — e.g., "max 1000 entries/sec"

Dropped entries are counted in `getInternalMetrics()` so you know if you're dropping too much.

### Why Backpressure?

If adapters can't keep up (backend is slow), the queue fills up and new entries are dropped. This prevents unbounded queue growth and memory leaks.

### Why Deep Redaction?

PII is sensitive. Observability applies redaction **in the write path** before any transport or adapter sees data:

- **Key-path matching:** `user.**.email` matches `user.profile.email`, `user.alternate.email`, etc.
- **Value-side patterns:** Regex matches for email, JWT, credit cards
- **Redaction modes:** `omit` (remove key), `replace` (replace value with `[REDACTED]`)

Every transport and adapter sees redacted data. There's no "accidental PII leak to the console."

### Why Screen Attribution?

Logs and network requests from a slow screen are hard to debug without context. Screen attribution tags every entry with the active screen using an **idle window** (Sentry-style):

- A screen mount opens the window
- Activity (mounts, requests) extends it
- After `idleMs` of inactivity, the window closes
- Background calls (after the window closes) are tagged with no screen

This prevents mis-attributing idle-time work to a screen.

## Configuration Hierarchy

Observability uses a configuration singleton (`ObservabilityConfig`) for app-wide settings:

```ts
ObservabilityConfig.init({
  app: { name: 'MyApp', version: '1.0.0', buildNumber: 1, buildType: 'development' },
  logger: { namespace: 'app', level: LogLevel.DEBUG, transports: [] },
});
```

This is read-only after init and frozen. Per-instance loggers can override individual settings:

```ts
const logger = createLogger({
  namespace: 'auth', // overrides global namespace
  level: LogLevel.WARN, // overrides global level
  transports: [myTransport], // overrides global transports
});
```

## Thread Safety

Observability is **not thread-safe**. It assumes:

- All calls happen on the JavaScript thread
- No concurrent calls from native modules
- No shared Logger instances across threads

This is standard for React Native; the library makes no special accommodation.

## Performance Characteristics

| Operation                             | Time       | Notes                                  |
| ------------------------------------- | ---------- | -------------------------------------- |
| `logger.info()`                       | ~0.1–0.5ms | Hot path: filtering + redaction        |
| `logger.info()` (dropped by sampling) | ~0.05ms    | Faster—no redaction                    |
| Adapter queue drain                   | 0–10ms     | Async, microtask deferred              |
| Panel render                          | 0–50ms     | Depends on entry count and device      |
| MMKVTransport write                   | 1–5ms      | Disk I/O; async (doesn't block logger) |

For most apps, Observability's overhead is negligible. On high-volume logging (>10k entries/min), consider:

- Increasing `sampling` ratios
- Lowering `minLevel` to reduce verbosity
- Setting a `rateLimit` to cap throughput

See [troubleshooting](./troubleshooting.md) for tuning advice.

## Future Extensibility

Observability's architecture leaves room for:

- Custom transports (e.g., file system, remote storage)
- Custom integrations (e.g., Redux DevTools, Replay capture)
- Streaming to backends (vs. microtask-deferred adapters)
- Symbolic stack trace unwinding
- Session replay / user interaction replay

These can be added without breaking the core API.
