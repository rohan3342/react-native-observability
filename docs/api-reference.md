# API Reference

Complete API reference organized by export path.

## Core (`react-native-observability`)

### Logger

#### `createLogger(config: LoggerConfig): Logger`

Creates a new Logger instance.

```ts
import {
  createLogger,
  ConsoleTransport,
  MemoryTransport,
  LogLevel,
} from 'react-native-observability';

const logger = createLogger({
  namespace: 'app',
  level: LogLevel.DEBUG,
  transports: [new ConsoleTransport(), new MemoryTransport()],
});

logger.info('App started');
logger.error('Something failed', error);
```

#### `setDefaultLogger(logger: Logger): void`

Registers a Logger as the process-wide default.

```ts
setDefaultLogger(logger);
```

#### `getLogger(): Logger`

Returns the process-wide default logger. Throws if `setDefaultLogger()` hasn't been called.

```ts
const logger = getLogger();
```

#### `Logger.info(message: string, context?: any): void`

Logs at INFO level.

```ts
logger.info('User signed in', { userId: 'u123' });
```

#### `Logger.warn(message: string, context?: any): void`

Logs at WARN level.

```ts
logger.warn('API slow', { endpoint: '/users', ms: 2500 });
```

#### `Logger.error(message: string, error?: Error, context?: any): void`

Logs at ERROR level. The error is captured and forwarded to adapters.

```ts
try {
  await riskyOp();
} catch (err) {
  logger.error('Operation failed', err instanceof Error ? err : new Error(String(err)));
}
```

#### `Logger.debug(message: string, context?: any): void`

Logs at DEBUG level.

```ts
logger.debug('Entering auth flow', { method: 'oauth' });
```

#### `Logger.child(namespace: string): Logger`

Creates a child logger with a nested namespace.

```ts
const authLogger = logger.child('auth');
authLogger.info('Token refreshed'); // logs as 'app:auth'
```

#### `Logger.setLevel(level: LogLevel): void`

Changes the log level at runtime.

```ts
logger.setLevel(LogLevel.DEBUG); // increase verbosity
logger.setLevel(LogLevel.WARN); // dial it back
```

### LogLevel

Enum for log severity.

```ts
import { LogLevel } from 'react-native-observability';

LogLevel.DEBUG; // 0
LogLevel.INFO; // 1
LogLevel.WARN; // 2
LogLevel.ERROR; // 3
LogLevel.FATAL; // 4
```

### Transports

#### `new ConsoleTransport(options?: ConsoleTransportOptions)`

Writes logs to React Native console (logcat/Xcode).

```ts
new ConsoleTransport({
  minLevel: LogLevel.WARN, // only WARN and above
  useColor: true, // colorize output
  useTimestamp: true, // add timestamp
});
```

#### `new MemoryTransport(options?: MemoryTransportOptions)`

Keeps a ring buffer of logs in RAM. Read by the panel.

```ts
const mem = new MemoryTransport({
  maxEntries: 500, // max entries to keep
  minLevel: LogLevel.DEBUG,
});

const entries = mem.entries; // read all entries
```

#### `getInternalMetrics(): InternalMetrics`

Returns internal telemetry counters.

```ts
const metrics = getInternalMetrics();
console.log(metrics.totalEntriesWritten);
console.log(metrics.droppedEntries);
console.log(metrics.adapterQueueDepth);
```

### Panic Mode

#### `configurePanic(opts: { dropAboveSize?: number }): void`

Configure panic mode (halts I/O if the library starts failing).

```ts
configurePanic({ dropAboveSize: 1000 });
```

#### `clearPanic(): void`

Clear panic mode.

```ts
clearPanic();
```

### Kill Switch

#### `setKillSwitch(): void`

Immediately halt all I/O (logger becomes a no-op).

```ts
if (criticalFailure) {
  setKillSwitch(); // logs are dropped
}
```

#### `clearKillSwitch(): void`

Resume logging.

```ts
clearKillSwitch();
```

### Console Interception

#### `installConsoleProxy(logger: Logger, options?: InstallConsoleProxyOptions): UninstallConsoleProxy`

Route `console.log()`, `console.warn()`, etc. through the Observability logger.

```ts
import { installConsoleProxy } from 'react-native-observability';

const uninstall = installConsoleProxy(logger, {
  minLevel: LogLevel.DEBUG,
  interceptGlobalErrors: true,
});

console.log('Hello'); // logged via Observability

// Later, restore console
uninstall();
```

### Error Boundaries

#### `<AppErrorBoundary />`

Top-level error boundary for the entire app.

```tsx
import { AppErrorBoundary } from 'react-native-observability';

<AppErrorBoundary logger={logger} FallbackComponent={ErrorFallback}>
  <App />
</AppErrorBoundary>;
```

Props:

- `logger: Logger` — logger to capture errors
- `FallbackComponent: React.ComponentType<ErrorBoundaryFallbackProps>` — fallback UI
- `isolate?: boolean` — optional; if true, errors don't propagate to parent boundaries

#### `<ScreenErrorBoundary />`

Fine-grained error boundary for a single screen.

```tsx
<ScreenErrorBoundary logger={logger} FallbackComponent={ScreenErrorFallback} isolate={true}>
  <MyScreen />
</ScreenErrorBoundary>
```

#### `withErrorBoundary(Component, options)`

HOC to wrap a component with an error boundary.

```ts
const SafeScreen = withErrorBoundary(MyScreen, {
  logger,
  FallbackComponent: ErrorFallback,
  isolate: true,
});
```

#### `useErrorHandler()`

Hook to manually trigger error boundary fallback.

```ts
const { retry, error } = useErrorHandler();
// error contains the caught error
// retry() re-attempts the component
```

### Global Error Handler

#### `installGlobalErrorHandler(logger: Logger, options?: InstallGlobalErrorHandlerOptions): void`

Installs a global error handler for uncaught errors and unhandled rejections.

```ts
import { installGlobalErrorHandler } from 'react-native-observability';

installGlobalErrorHandler(logger, {
  pauseOnThrow: false, // optional
});
```

### Integrations

#### `createHttpObserver(options: CreateHttpObserverOptions): HttpObserver`

Creates an HTTP observer for monitoring network requests.

```ts
const http = createHttpObserver({
  logger,
  redact: { headerKeys: ['Authorization'] },
  screenProvider,
});

export const store = http.store; // read by panel
```

#### `trackScreen(name: string, params?: any, options?: TrackScreenOptions): () => void`

Records screen mount/unmount. Returns unmount function.

```ts
useEffect(() => {
  const unmount = trackScreen('HomeScreen', { tab: 'home' }, { logger });
  return unmount;
}, []);
```

#### `createScreenProvider(options?: CreateScreenProviderOptions): () => string | undefined`

Returns a function that resolves the currently-active screen.

```ts
const screenProvider = createScreenProvider({ idleMs: 1000 });
const logger = createLogger({ screenProvider /* ... */ });
const http = createHttpObserver({ screenProvider /* ... */ });
```

#### `trackAsyncOperation(options: TrackAsyncOperationOptions): AsyncOperationHandle`

Tracks an async operation (e.g., query, mutation).

```ts
const op = trackAsyncOperation({ key: 'fetchUser', logger });
try {
  await fetchUser();
  op.onSuccess();
} catch (err) {
  op.onError(err);
  throw err;
}
```

#### `trackPerformance(name: string, options?: TrackPerformanceOptions): PerfSpanHandle`

Tracks a performance span. **Stability: experimental.**

```ts
const span = trackPerformance('decode-image', { logger });
await decode();
const durationMs = span.end({ bytes: 40_000 });
```

### Breadcrumbs

#### `getBreadcrumbStore(): BreadcrumbStore`

Returns the shared breadcrumb store (timeline).

```ts
const breadcrumbs = getBreadcrumbStore();
```

#### `new BreadcrumbTransport(options?: BreadcrumbTransportOptions)`

Transport that records every log as a breadcrumb (for timeline/crash-trail).

```ts
new BreadcrumbTransport({
  minLevel: LogLevel.WARN,
  maxEntries: 1000,
});
```

### Config

#### `ObservabilityConfig.init(config: ObservabilityConfig): void`

Initialize global config singleton.

```ts
ObservabilityConfig.init({
  app: { name: 'MyApp', version: '1.0.0', buildNumber: 1, buildType: 'development' },
  logger: { namespace: 'app', level: LogLevel.DEBUG, transports: [] },
});
```

#### `ObservabilityConfig.get(): Readonly<ObservabilityConfig>`

Read the initialized config. Throws if not initialized.

```ts
const config = ObservabilityConfig.get();
```

#### `FeatureFlagManager`

Simple in-memory feature flag registry.

```ts
FeatureFlagManager.init({ new_ui: true, dark_mode: false });
FeatureFlagManager.get('new_ui'); // true
FeatureFlagManager.set('new_ui', false);
```

### Adapters

#### `createCustomAdapter(impl: Partial<IObservabilityAdapter>): IObservabilityAdapter`

Creates a custom adapter for any remote backend.

```ts
import { createCustomAdapter } from 'react-native-observability/adapters';

const adapter = createCustomAdapter({
  name: 'myservice',
  minLevel: LogLevel.ERROR,
  captureException: (err, ctx) => sendToBackend(err, ctx),
  setUser: user => setUserContext(user),
});
```

## Storage (`react-native-observability/storage`)

### Session Manager

#### `createStorage(options: CreateStorageOptions): MMKVLike`

Creates an MMKV storage instance (requires `react-native-mmkv` peer).

```ts
import { createStorage } from 'react-native-observability/storage';

const storage = createStorage({ id: 'observability-logs' });
```

#### `initSessionManager(storage: MMKVLike, options: InitSessionManagerOptions): void`

Initializes the session manager. Must be called once, early.

```ts
initSessionManager(storage, {
  appVersion: '1.0.0',
  buildNumber: 1,
  transports: [mmkvTransport],
});
```

#### `getCurrentSessionId(): string | undefined`

Returns the current session ID.

```ts
const sessionId = getCurrentSessionId();
```

#### `getSessions(): SessionMeta[]`

Returns all sessions in storage.

```ts
const sessions = getSessions();
sessions.forEach(s => {
  console.log(s.sessionId, s.crashed);
});
```

#### `endCurrentSession(): void`

Manually ends the current session and creates a new one.

```ts
endCurrentSession();
```

#### `reopenCurrentSession(): void`

Reopens the most recent session (undo `endCurrentSession()`).

```ts
reopenCurrentSession();
```

### MMKV Transport

#### `new MMKVTransport(options: MMKVTransportOptions)`

Persists logs to MMKV storage.

```ts
const mmkvTransport = new MMKVTransport({
  storage,
  minLevel: LogLevel.WARN,
  maxBytesPerSession: 100_000,
});
```

## Panel (`react-native-observability/panel`)

### Provider

#### `<DebugPanelProvider />`

Mounts the on-device debug panel.

```tsx
<DebugPanelProvider
  enabled={__DEV__}
  logSource={memoryTransport}
  networkSource={http.store}
  openOn={['multiTap']}
  multiTapCount={5}
>
  <App />
</DebugPanelProvider>
```

### Hook

#### `useDebugPanel(): DebugPanelContextValue`

Hook to programmatically control the panel.

```ts
const { openPanel, closePanel } = useDebugPanel();

openPanel('logs'); // open at Logs tab
closePanel(); // close the panel
```

### Gesture Detection

#### `useShakeDetector(accelerometer: AccelerometerSource, options?: UseShakeDetectorOptions): boolean`

Hook to detect device shake.

```ts
const [shaking, setShaking] = useShakeDetector(accelerometer);

useEffect(() => {
  if (shaking) {
    openPanel('logs');
  }
}, [shaking]);
```

#### `<MultiTapTarget />`

Component that detects multi-tap gestures.

```tsx
<MultiTapTarget count={5} onTap={() => openPanel('logs')}>
  <App />
</MultiTapTarget>
```

### Theming

#### `lightTokens`, `darkTokens`, `themePresets`

Pre-built theme tokens and presets.

```ts
import { lightTokens, darkTokens, themePresets } from 'react-native-observability/panel';

// themePresets.midnight, themePresets.forest, etc.
```

#### `useTheme(): Theme`

Hook to read the current theme (inside `DebugPanelProvider`).

```ts
const theme = useTheme();
console.log(theme.colors.accent);
console.log(theme.spacing.md);
```

## Observers

### Fetch

#### `observeFetch(http: HttpObserver, options?: ObserveFetchOptions): () => void`

Monkey-patches `globalThis.fetch` to feed into HTTP observer.

```ts
import { observeFetch } from 'react-native-observability/observers/fetch';

const restore = observeFetch(http, {
  responseBodyContentTypes: ['application/json'],
});

// Later, restore fetch
restore();
```

### Axios

#### `observeAxios(client: AxiosInstance, http: HttpObserver, options?: ObserveAxiosOptions): void`

Wires an Axios instance to the HTTP observer.

```ts
import { observeAxios } from 'react-native-observability/observers/axios';

observeAxios(client, http, {
  mock: mockEngine,
});
```

### React Navigation

#### `observeReactNavigation(navRef: NavigationContainerRef, options: { logger: Logger }): NavigationObserver`

Wires React Navigation to Observability.

```ts
import { observeReactNavigation } from 'react-native-observability/observers/react-navigation';

const nav = observeReactNavigation(navRef, { logger });
```

#### `useScreenTracker(options?: TrackScreenOptions): void`

Hook to auto-track screen mount/unmount inside a screen component.

```ts
import { useScreenTracker } from 'react-native-observability/observers/react-navigation';

export function HomeScreen() {
  useScreenTracker({ logger });
  // ...
}
```

### React Query

#### `observeReactQuery(queryClient: QueryClient, options: { logger: Logger }): void`

Wires React Query to Observability.

```ts
import { observeReactQuery } from 'react-native-observability/observers/react-query';

observeReactQuery(queryClient, { logger });
```

### GraphQL, tRPC, Apollo, urql, RTK Query

Similar observer functions available:

```ts
import { observeGraphQL } from 'react-native-observability/observers/graphql';
import { observeTRPC } from 'react-native-observability/observers/trpc';
import { observeApollo } from 'react-native-observability/observers/apollo';
import { observeUrql } from 'react-native-observability/observers/urql';
import { observeRTKQuery } from 'react-native-observability/observers/rtk-query';
```

## Next Steps

- **[Configuration](./configuration.md)** — Detailed config options
- **[Logger Guide](./logger-guide.md)** — Logger best practices
- **[Examples](../examples)** — Working code samples
