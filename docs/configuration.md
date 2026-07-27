# Configuration

Complete reference for all Observability configuration options.

## ObservabilityConfig (Global Singleton)

The global configuration singleton. Call `init()` exactly once during app bootstrap.

```ts
import { ObservabilityConfig, LogLevel } from 'react-native-observability';

ObservabilityConfig.init({
  app: {
    name: 'MyApp',
    version: '1.0.0',
    buildNumber: 1,
    buildType: 'development' | 'production' | 'staging',
  },
  logger: {
    namespace: 'app',
    level: LogLevel.DEBUG,
    transports: [new ConsoleTransport()],
  },
});

// Later, read the config (throws if not initialized)
const config = ObservabilityConfig.get();
```

### Properties

| Field               | Type                                         | Default | Description                                                        |
| ------------------- | -------------------------------------------- | ------- | ------------------------------------------------------------------ |
| `app.name`          | `string`                                     | —       | App display name (used in panel, adapters)                         |
| `app.version`       | `string`                                     | —       | Semantic version (e.g., `1.2.3`)                                   |
| `app.buildNumber`   | `number`                                     | —       | Build number (e.g., `42`)                                          |
| `app.buildType`     | `'development' \| 'production' \| 'staging'` | —       | Build type for adapter context                                     |
| `logger.namespace`  | `string`                                     | —       | Default namespace (used by transports/adapters)                    |
| `logger.level`      | `LogLevel`                                   | —       | Default log level                                                  |
| `logger.transports` | `ITransport[]`                               | —       | Default transports (usually empty; per-logger config is preferred) |

## createLogger() Config

The main Logger configuration. This is where you set up transports, adapters, redaction, and sampling.

```ts
const logger = createLogger({
  namespace: 'app',
  level: LogLevel.DEBUG,
  transports: [new ConsoleTransport(), new MemoryTransport()],
  adapters: [myAdapter],
  redact: { keys: ['password', 'token'] },
  sampling: { network: 0.5 },
  rateLimit: { entriesPerSecond: 1000 },
  sessionIdProvider: getCurrentSessionId,
  screenProvider: createScreenProvider(),
});
```

### Properties

| Field               | Type                        | Default         | Description                                         |
| ------------------- | --------------------------- | --------------- | --------------------------------------------------- |
| `namespace`         | `string`                    | —               | Logger namespace (hierarchical, e.g., `auth:login`) |
| `level`             | `LogLevel`                  | `LogLevel.INFO` | Minimum level to capture                            |
| `transports`        | `ITransport[]`              | `[]`            | Write destinations (Console, Memory, MMKV)          |
| `adapters`          | `IObservabilityAdapter[]`   | `[]`            | Remote backends (Sentry, Datadog, custom)           |
| `redact`            | `RedactConfig`              | (default rules) | PII redaction rules                                 |
| `sampling`          | `SamplingConfig`            | `{}`            | Per-namespace or per-level sampling                 |
| `rateLimit`         | `RateLimitConfig`           | (no limit)      | Token-bucket rate limiting                          |
| `sessionIdProvider` | `() => string \| undefined` | noop            | Function to resolve current session ID              |
| `screenProvider`    | `() => string \| undefined` | noop            | Function to resolve current screen name             |

## LogLevel

Enum for log severity. Used to filter entries.

```ts
enum LogLevel {
  DEBUG = 0, // dev only
  INFO = 1, // general info
  WARN = 2, // warnings
  ERROR = 3, // errors
  FATAL = 4, // unrecoverable
}
```

## RedactConfig

PII redaction configuration. Redaction is applied in the write path before any transport or adapter sees data.

```ts
const logger = createLogger({
  redact: {
    mode: 'omit', // 'omit' | 'replace' (default: 'replace')
    keys: ['password', 'token', 'secret'], // extra keys to redact (default + these)
    redactDefaultKeys: true, // redact standard keys (email, ssn, etc.)
    redactDefaultHeaders: true, // redact standard headers (Authorization, Cookie)
    matchers: [
      /my-custom-pattern/i, // custom regex for value-side matching
    ],
  },
});
```

### Properties

| Field                  | Type                  | Default     | Description                                                                  |
| ---------------------- | --------------------- | ----------- | ---------------------------------------------------------------------------- |
| `mode`                 | `'omit' \| 'replace'` | `'replace'` | `omit` removes the key; `replace` replaces value with `[REDACTED]`           |
| `keys`                 | `string[]`            | `[]`        | Extra key-path patterns to redact (in addition to defaults)                  |
| `redactDefaultKeys`    | `boolean`             | `true`      | Whether to redact default sensitive keys (email, ssn, password, token, etc.) |
| `redactDefaultHeaders` | `boolean`             | `true`      | Whether to redact default sensitive headers (Authorization, Cookie, etc.)    |
| `matchers`             | `RegExp[]`            | `[]`        | Extra regex patterns for value-side matching (email, JWT, credit cards)      |

### Key-Path Matching

Key-path patterns use `**` for recursive matching:

- `user.email` — matches only `obj.user.email`
- `user.**.email` — matches `obj.user.email`, `obj.user.profile.email`, `obj.user.alternate.email`, etc.
- `**.password` — matches any `password` at any depth

### Redaction Modes

- **`omit`** — removes the key entirely: `{ user: { password: '123' } }` → `{ user: {} }`
- **`replace`** — replaces the value: `{ user: { password: '123' } }` → `{ user: { password: '[REDACTED]' } }`

## SamplingConfig

Probabilistic sampling to reduce log volume. Configured per namespace or per level.

```ts
const logger = createLogger({
  sampling: {
    network: 0.5, // log 50% of 'network' entries
    auth: 0.1, // log 10% of 'auth' entries
    [LogLevel.DEBUG]: 0.5, // log 50% of DEBUG entries
  },
});
```

Sampling is applied **after** filtering and redaction, and uses a stable hash so the same keys are consistently sampled (e.g., "user 123" is always sampled or always dropped).

## RateLimitConfig

Token-bucket rate limiting to cap throughput. Shared across all loggers.

```ts
const logger = createLogger({
  rateLimit: {
    entriesPerSecond: 1000, // max entries/sec before dropping
  },
});
```

If the logger exceeds the limit, entries are dropped and counted in `getInternalMetrics().droppedEntries`.

## createHttpObserver() Config

Configure HTTP request/response capture and mocking.

```ts
const http = createHttpObserver({
  logger,
  store: networkLogStore, // optional: custom store
  redact: { headerKeys: ['Authorization'], bodyKeys: ['password'] },
  screenProvider,
  breadcrumbs: breadcrumbStore,
  logInProduction: false,
});
```

### Properties

| Field             | Type                        | Default    | Description                             |
| ----------------- | --------------------------- | ---------- | --------------------------------------- |
| `logger`          | `Logger`                    | undefined  | Logger for request errors (optional)    |
| `store`           | `NetworkLogStore`           | new store  | Custom backing store (optional)         |
| `redact`          | `HttpRedactOptions`         | (defaults) | Header/body redaction rules             |
| `screenProvider`  | `() => string \| undefined` | undefined  | Function to resolve current screen      |
| `breadcrumbs`     | `BreadcrumbStore`           | undefined  | Breadcrumb store for recording requests |
| `logInProduction` | `boolean`                   | `false`    | Whether to capture in production        |

### HttpRedactOptions

```ts
redact: {
  redactDefaultHeaders: true,          // redact Authorization, Cookie, etc.
  headerKeys: ['X-API-Key'],           // extra headers to redact
  redactDefaultBodyKeys: true,         // redact password, token, etc.
  bodyKeys: ['secret'],                // extra body keys to redact
}
```

## DebugPanelProvider Config

Configure the on-device debug panel.

```tsx
<DebugPanelProvider
  enabled={__DEV__}
  logSource={memoryTransport}
  networkSource={http.store}
  tabs={['logs', 'network', 'state', 'navigation']}
  openOn={['multiTap', 'shake']}
  multiTapCount={5}
  gestureTab="logs"
  persist={{ getItem, setItem }}
  onClearStorage={clearAll}
  safeAreaInsets={insets}
  getSessionLogs={getSessionLogs}
  branding={{ title: 'My App', subtitle: 'Debug' }}
  theme="system"
  haptics={{ impact: ..., notify: ... }}
  iconSet={customIcons}
>
  <App />
</DebugPanelProvider>
```

### Properties

| Field            | Type                                         | Default                                                  | Description                                      |
| ---------------- | -------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| `enabled`        | `boolean`                                    | `true`                                                   | Whether the panel is mounted and functional      |
| `logSource`      | `MemoryTransport \| null`                    | —                                                        | Transport to read logs from                      |
| `networkSource`  | `NetworkLogStore \| null`                    | —                                                        | Store to read network entries from               |
| `mockEngine`     | `MockEngine \| null`                         | —                                                        | Mock engine for network mocking rules            |
| `tabs`           | `DebugPanelTab[]`                            | `['logs', 'network', 'state', 'navigation', 'settings']` | Tabs to display                                  |
| `openOn`         | `('multiTap' \| 'shake')[]`                  | `['multiTap']`                                           | Entry gestures                                   |
| `multiTapCount`  | `number`                                     | `5`                                                      | Taps required to open                            |
| `gestureTab`     | `DebugPanelTab`                              | `'logs'`                                                 | Default tab when opened by gesture               |
| `persist`        | `{ getItem, setItem }`                       | undefined                                                | Optional persistence for panel prefs             |
| `onClearStorage` | `() => void`                                 | undefined                                                | Callback when user clears storage (Settings tab) |
| `safeAreaInsets` | `{ top, bottom, left, right }`               | undefined                                                | Safe-area insets (for notch/gesture bar)         |
| `getSessionLogs` | `(sessionId: string) => LogEntry[]`          | undefined                                                | Callback to fetch past session logs              |
| `branding`       | `{ title: string, subtitle?: string }`       | `{ title: 'Observability' }`                             | Panel header text                                |
| `theme`          | `'light' \| 'dark' \| 'system'`              | `'system'`                                               | Theme mode                                       |
| `haptics`        | `{ impact: () => void, notify: () => void }` | undefined                                                | Haptic feedback (optional)                       |
| `iconSet`        | `Partial<IconSet>`                           | (built-in glyphs)                                        | Custom icon renderers                            |

### DebugPanelTab

Available tabs:

```ts
type DebugPanelTab = 'logs' | 'network' | 'state' | 'navigation' | 'performance' | 'settings';
```

## createMockEngine() Config

Configure the network mock engine for request interception and mocking.

```ts
const mock = createMockEngine({
  rules: [
    {
      id: 'mock-todo',
      enabled: true,
      match: { url: '/todos/1', method: 'GET' },
      action: { type: 'respond', status: 200, body: { id: 1, title: 'Mocked' } },
    },
  ],
  allowInProduction: false,
});
```

### Properties

| Field               | Type         | Default | Description                                   |
| ------------------- | ------------ | ------- | --------------------------------------------- |
| `rules`             | `MockRule[]` | `[]`    | Initial mock rules                            |
| `allowInProduction` | `boolean`    | `false` | Whether to allow mocking in production builds |

See [HTTP Observer](./http-observer.md) for detailed mock rule documentation.

## Next Steps

- **[Logger Guide](./logger-guide.md)** — Deep dive into logger options
- **[HTTP Observer](./http-observer.md)** — Network monitoring configuration
- **[Debug Panel](./debug-panel.md)** — Panel customization
