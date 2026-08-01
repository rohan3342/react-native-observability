# react-native-observability

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![npm](https://img.shields.io/npm/v/react-native-observability.svg)](https://www.npmjs.com/package/react-native-observability)
[![types: TypeScript](https://img.shields.io/badge/types-TypeScript-blue.svg)](https://www.typescriptlang.org/)
[![Release CI](https://github.com/rohan3342/react-native-observability/actions/workflows/release.yml/badge.svg)](https://github.com/rohan3342/react-native-observability/actions/workflows/release.yml)

A production-grade, provider-agnostic observability and debugging toolkit for React Native. Structured logging, optional remote backends, crash capture, PII redaction, on-device debug panel, and first-party integrations for HTTP clients and navigation — all with **zero forced runtime dependencies**.

<div align="center">
  <table>
    <tr>
      <td align="center"><strong>Logs Tab</strong><br/><img src="./docs/assets/panel-logs-1.png" width="180" alt="Logs tab showing structured log entries with filtering"/></td>
      <td align="center"><strong>Network Tab</strong><br/><img src="./docs/assets/panel-network-1.png" width="180" alt="Network tab with HTTP requests and response inspection"/></td>
      <td align="center"><strong>Settings Tab</strong><br/><img src="./docs/assets/panel-settings-1.png" width="180" alt="Settings tab with theme, session, and storage controls"/></td>
    </tr>
    <tr>
      <td align="center"><strong>Network Rules</strong><br/><img src="./docs/assets/panel-network-rules-1.png" width="180" alt="Network rules editor for mocking and fault injection"/></td>
      <td align="center"><strong>State Inspection</strong><br/><img src="./docs/assets/panel-state-1.png" width="180" alt="State tab displaying app state with JSON syntax highlighting"/></td>
      <td align="center"><strong>Navigation Tracking</strong><br/><img src="./docs/assets/panel-navigation-1.png" width="180" alt="Navigation tab showing screen stack and transitions"/></td>
    </tr>
  </table>
</div>

```bash
npm install react-native-observability
```

## Why react-native-observability?

Most observability stacks force you to pick a vendor upfront and bundle its SDK into your core. This library inverts that: it ships **provider-agnostic primitives** that work with any backend (Sentry, Datadog, your own service) or none at all. Wire only the vendors you use—zero bundle cost if you ship nothing.

The library is **pure TypeScript with no native module of its own**. Native features (persistent storage, shake-to-open) come from optional peers you opt into.

## Features

- **Structured logger** — composable transports (console, in-memory ring buffer, MMKV), `LogLevel` enum, hierarchical namespaces, child loggers, and optional session ID tagging
- **Observability adapters** — forward errors to any backend via `createCustomAdapter` (Datadog, Sentry, your service). Adapter fan-out is microtask-deferred and isolated—a broken backend never crashes your app
- **Crash capture** — `installGlobalErrorHandler()` catches uncaught JS errors and unhandled promise rejections
- **Error boundaries** — `AppErrorBoundary` and `ScreenErrorBoundary` with fine-grained error isolation and custom fallback UI
- **Provider-agnostic HTTP** — tag requests with the active screen, apply PII redaction, intercept and mock network traffic. Vendor shims for Axios, `fetch`, GraphQL, React Navigation, React Query, tRPC, Apollo, urql, and RTK Query
- **Session management** — MMKV-backed persistence, per-session byte budgets, crash detection across launches, and optional encryption
- **Deep PII redaction** — recursive key-path matching (`user.**.email`) and value-side regexes for email, JWT, credit cards—applied in the write path before any transport or adapter sees data
- **On-device debug panel** — 6+ tabs (Logs, Network, State, Navigation, Performance, Settings), light/dark/system theming, live state inspection, session history, breadcrumb timeline, and crash trail
- **Backpressure & sampling** — bounded drop-tail queue, token-bucket rate limiting, and per-level/per-namespace sampling to prevent runaway I/O
- **Self-telemetry** — `getInternalMetrics()`, `setKillSwitch()`, and panic mode to halt I/O if the library fails

## Installation

```bash
npm install react-native-observability
# or
pnpm add react-native-observability
# or
yarn add react-native-observability
```

**Optional peers** — install only what you use:

| Peer                       | Unlocks                                |
| -------------------------- | -------------------------------------- |
| `react-native-mmkv`        | Persistent storage, session management |
| `axios`                    | Axios HTTP observer                    |
| _(built-in)_               | Fetch observer                         |
| `graphql`                  | GraphQL observer                       |
| `@react-navigation/native` | React Navigation observer              |
| `@tanstack/react-query`    | React Query observer                   |
| `@trpc/client`             | tRPC observer                          |
| `@apollo/client`           | Apollo observer                        |
| `urql` / `@urql/core`      | urql observer                          |
| `@reduxjs/toolkit`         | RTK Query observer                     |

## Quick Start

### 1. Create a Logger

```ts
// src/services/logger.ts
import {
  createLogger,
  ConsoleTransport,
  MemoryTransport,
  LogLevel,
} from 'react-native-observability';

export const memoryTransport = new MemoryTransport({ maxEntries: 500 });

export const logger = createLogger({
  namespace: 'app',
  level: __DEV__ ? LogLevel.DEBUG : LogLevel.WARN,
  transports: [new ConsoleTransport(), memoryTransport],
});
```

### 2. Wrap Your App

```tsx
// App.tsx
import { AppErrorBoundary } from 'react-native-observability';
import { DebugPanelProvider } from 'react-native-observability/panel';
import { logger, memoryTransport } from './services/logger';
import { http } from './services/http';

export default function App() {
  return (
    <AppErrorBoundary logger={logger} FallbackComponent={ErrorFallback}>
      <DebugPanelProvider
        enabled={__DEV__}
        logSource={memoryTransport}
        networkSource={http.store}
        openOn={['multiTap']}
        multiTapCount={5}
      >
        <Root />
      </DebugPanelProvider>
    </AppErrorBoundary>
  );
}

function ErrorFallback({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View>
      <Text>Error: {error.message}</Text>
      <Button onPress={retry} title="Retry" />
    </View>
  );
}
```

### 3. Observe HTTP

```ts
// src/services/http.ts
import axios from 'axios';
import { createHttpObserver } from 'react-native-observability';
import { observeAxios } from 'react-native-observability/observers/axios';
import { observeFetch } from 'react-native-observability/observers/fetch';
import { logger } from './logger';

export const http = createHttpObserver({
  logger,
  redact: { headerKeys: ['Authorization'], bodyKeys: ['password', 'token'] },
});

const client = axios.create({ baseURL: 'https://api.example.com' });
observeAxios(client, http);
observeFetch(http);

export { client };
```

### 4. Use the Logger

```ts
import { logger } from './services/logger';

// Simple entry
logger.info('User logged in', { userId: 'u123' });

// With an error
try {
  await fetchData();
} catch (error) {
  logger.error('Fetch failed', error instanceof Error ? error : new Error(String(error)));
}

// Child loggers for namespace hierarchy
const authLogger = logger.child('auth');
authLogger.debug('Validating token');
```

### 5. Open the Panel

The panel opens via gesture (shake or multi-tap):

```tsx
import { useDebugPanel } from 'react-native-observability/panel';

export function MyScreen() {
  const { openPanel } = useDebugPanel();
  return <Button onPress={() => openPanel('logs')} title="Open Logs" />;
}
```

## Architecture

```text
               ┌───────────────────────────────────┐
               │         Application Code          │
               │    Logging · Navigation · HTTP    │
               └─────────────────┬─────────────────┘
                                 │
                                 ▼ entry
               ┌─────────────────┴─────────────────┐
               │            Logger Core            │
               │            (hot path)             │
               │     filter · redact · sample      │
               └─────────────────┬─────────────────┘
                                 │
           ┌─────────────────────┼─────────────────────┐
        dispatch               queue                  feed
           │                     │                     │
           ▼                     ▼                     ▼
  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
  │   Transports   │    │    Adapters    │    │  Integrations  │
  │                │    │ async·isolated │    │  event stores  │
  └────────────────┘    └────────────────┘    └────────────────┘
           │                     │                     │
           ▼                     ▼                     ▼
  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐
  │ Console output │    │Remote backends │    │ HTTP · Screen  │
  │ Memory (ring)  │    │ Sentry·Datadog │    │Breadcrumb·Perf │
  │ MMKV (persist) │    │                │    │                │
  └────────────────┘    └────────────────┘    └────────────────┘
           │                                           │
           └─────────────────────┬─────────────────────┘
                         subscribe · query
                                 │
                                 ▼
               ┌─────────────────┴─────────────────┐
               │            Debug Panel            │
               └─────────────────┬─────────────────┘
                                 │
                                 ▼ render
               ┌─────────────────┴─────────────────┐
               │              Live UI              │
               │Logs · Network · State · Nav · Perf│
               └───────────────────────────────────┘
```

**Data flow:**

1. **App calls logger** — `logger.info()`, `trackScreen()`, HTTP requests
2. **Logger core (hot path)** — Filters, redacts, samples, tags with screen/session
3. **Three paths in parallel:**
   - **Transports** — Write independently (Console, Memory, MMKV\*)
   - **Adapters** — Queued async, error-isolated (Sentry, Datadog, custom)
   - **Integrations** — Feed into stores (HTTP, screens, breadcrumbs, perf)
4. **Panel reads stores** — Real-time subscription via `useSyncExternalStore`
5. **User sees live UI** — Logs, network, state, navigation, performance

\*Optional peer: `react-native-mmkv`

## Documentation

**Start here:** [Documentation Navigation Guide](./docs/navigation.md) — Find what you need by goal or problem

**Essential guides:**

- **[Getting Started](./docs/getting-started.md)** — First-time setup and core concepts
- **[Installation](./docs/installation.md)** — Peer dependencies and platform setup
- **[Quick Start](./docs/quick-start.md)** — 5-minute walkthrough

**Understanding the system:**

- **[Architecture](./docs/architecture.md)** — System design and principles
- **[Diagrams](./docs/diagrams.md)** — Visual flowcharts and sequence diagrams
- **[Configuration](./docs/configuration.md)** — All configuration options
- **[API Reference](./docs/api-reference.md)** — Complete export reference

**Feature guides:**

- **[Logger](./docs/logger-guide.md)** — Structured logging and transports
- **[Error Boundaries](./docs/error-boundaries.md)** — Error isolation
- **[HTTP Observer](./docs/http-observer.md)** — Network monitoring and mocking
- **[Debug Panel](./docs/debug-panel.md)** — On-device UI and customization
- **[Screen Tracking](./docs/screen-tracking.md)** — Screen attribution
- **[Persistence](./docs/persistence.md)** — MMKV storage and sessions
- **[Observers](./docs/observers.md)** — Vendor integrations
- **[Adapters](./docs/adapters-guide.md)** — Custom backends
- **[Breadcrumbs](./docs/breadcrumbs.md)** — Timeline and crash trails
- **[Performance](./docs/performance.md)** — Performance monitoring
- **[Redaction](./docs/redaction.md)** — PII protection

**Production & support:**

- **[Testing](./docs/testing.md)** — Testing patterns
- **[Troubleshooting](./docs/troubleshooting.md)** — Common issues
- **[FAQ](./docs/faq.md)** — 40+ frequently asked questions

## Examples

- **[Expo Example](./examples/expo/)** — Go-safe subset, no native build required
- **[Bare Example](./examples/bare/)** — Full native surface with MMKV and shake-to-open

## Supported Platforms

- **React Native:** ≥0.73.0
- **React:** ≥18.0.0
- **Node:** ≥18

## Bundle Size

Observability ships with aggressive size budgets enforced in CI. Core is **~8 KB** (gzipped), adapters are **~4 KB**, and the panel is **~30 KB** (excluding React/React Native).

## Contributing

We welcome contributions. Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

### Development

```bash
pnpm install
pnpm build       # tsup — CJS + ESM + .d.ts
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint
pnpm test        # jest
pnpm test:coverage
pnpm size        # size-limit — verify budgets
```

## License

MIT — see [LICENSE](./LICENSE) for details.

---

**Questions?** Open an issue on [GitHub](https://github.com/rohan3342/react-native-observability).
