# Getting Started

Welcome to react-native-observability! This guide will help you understand what Observability is and how to get it running in your app in minutes.

## What is Observability?

Observability is a **provider-agnostic observability toolkit** for React Native. It provides:

1. **Structured logging** — a Logger instance that captures events with context
2. **HTTP observation** — automatic network monitoring with request/response/error tracking
3. **Crash capture** — uncaught errors and unhandled rejections are logged
4. **Error boundaries** — isolate render errors and show custom fallback UI
5. **On-device debug panel** — inspect logs, network traffic, state, navigation, performance, and more
6. **Optional persistence** — save logs to disk via MMKV (optional native peer)
7. **Optional remote backends** — forward errors to Sentry, Datadog, or your own service

The core installs with **zero forced dependencies** — every external SDK is optional.

## Core Concepts

### Logger

The `Logger` is the central API. You create one, pass it to your app, and call methods like `logger.info()`, `logger.warn()`, `logger.error()`.

```ts
const logger = createLogger({
  namespace: 'app',
  level: LogLevel.DEBUG,
  transports: [new ConsoleTransport(), new MemoryTransport()],
});

logger.info('User signed in', { userId: 'u123' });
```

### Transports

Transports are **where** logs go. Built-in transports include:

- **ConsoleTransport** — writes to React Native's console/logcat
- **MemoryTransport** — keeps a ring buffer in RAM (read by the debug panel)
- **MMKVTransport** — persists to disk via `react-native-mmkv` (optional peer)

You can mix transports:

```ts
transports: [
  new ConsoleTransport(), // dev console
  new MemoryTransport(), // panel reads this
  new MMKVTransport({ storage }), // optional: persists to disk
];
```

### Adapters

Adapters are **how** errors reach remote backends. Use `createCustomAdapter` to wire any backend:

```ts
import { createCustomAdapter } from 'react-native-observability/adapters';

const myAdapter = createCustomAdapter({
  name: 'myservice',
  captureException: (err, ctx) => {
    sendToMyBackend(err, ctx);
  },
});

const logger = createLogger({
  // ...
  adapters: [myAdapter],
});
```

Adapters only see errors at or above their `minLevel` and are isolated behind error boundaries—a broken backend never crashes your app.

### Error Boundaries

Error boundaries catch render errors and invoke a fallback UI. Observability provides two:

- **AppErrorBoundary** — wraps the entire app
- **ScreenErrorBoundary** — wraps a single screen (fine-grained isolation)

```tsx
<AppErrorBoundary logger={logger} FallbackComponent={ErrorFallback}>
  <App />
</AppErrorBoundary>
```

### Debug Panel

The `DebugPanelProvider` mounts an on-device UI with 6+ tabs:

- **Logs** — all captured log entries, filterable by level and namespace
- **Network** — HTTP requests/responses, mock rules
- **State** — app state slices, feature flags
- **Navigation** — screen stack and transitions
- **Performance** (opt-in) — performance spans and timings
- **Settings** — theme, session info, panel preferences

Open it via shake gesture, multi-tap, or programmatically:

```tsx
const { openPanel } = useDebugPanel();
openPanel('logs');
```

### Screen Attribution

Logs and network requests can be tagged with the active screen. This powers the panel's per-screen filters:

```ts
const screenProvider = createScreenProvider();
const logger = createLogger({ screenProvider /* ... */ });
const http = createHttpObserver({ screenProvider /* ... */ });
```

Then wire `trackScreen` in your screens:

```tsx
useEffect(() => trackScreen('HomeScreen'), []);
```

## Minimum Setup

Here's the absolute minimum to get Observability running:

```tsx
// 1. Create a logger
const memoryTransport = new MemoryTransport();
const logger = createLogger({
  namespace: 'app',
  level: LogLevel.DEBUG,
  transports: [new ConsoleTransport(), memoryTransport],
});

// 2. Wrap your app
export default function App() {
  return (
    <AppErrorBoundary logger={logger} FallbackComponent={ErrorFallback}>
      <DebugPanelProvider enabled={__DEV__} logSource={memoryTransport} openOn={['multiTap']}>
        <Root />
      </DebugPanelProvider>
    </AppErrorBoundary>
  );
}

// 3. Use the logger
logger.info('App started');

// 4. Open the panel (multi-tap the screen)
```

That's it. You now have crash capture, a debug panel, and structured logs.

## What's Next?

- **[Installation Guide](./installation.md)** — Set up optional peers (MMKV, Axios, etc.)
- **[Quick Start](./quick-start.md)** — Add HTTP monitoring, custom adapters, screen tracking
- **[Logger Guide](./logger-guide.md)** — Master redaction, sampling, rate-limiting
- **[Debug Panel](./debug-panel.md)** — Customize theming, gestures, persistence
- **[Adapters Guide](./adapters-guide.md)** — Wire Sentry, Datadog, or your backend

## FAQ

**Q: Does Observability require a native build?**  
A: No. The core is pure JS. Optional features (persistent storage, shake-to-open) require native peers. Expo Go users can skip these.

**Q: Can I ship the debug panel to production?**  
A: Yes, conditionally. The panel is just a React Native view; wrap it in `enabled={!isProduction}` or add runtime feature flags.

**Q: What if my backend is down?**  
A: Adapters are isolated—if your backend times out, Observability keeps working. The logger queues events safely.

**Q: Do I have to use all the features?**  
A: No. Use just the logger. Use just error boundaries. Use just the panel. Every feature is opt-in.

**Q: Can I disable Observability in production?**  
A: Yes. Wrap all Observability setup in `if (__DEV__)`. The transpiled code will tree-shake to nothing.
