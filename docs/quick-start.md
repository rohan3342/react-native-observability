# Quick Start

Get Observability running in 5 minutes with a minimal working example.

## Step 1: Install

```bash
npm install react-native-observability
```

## Step 2: Create a Logger Service

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

## Step 3: Set Up Error Boundary + Panel

```tsx
// App.tsx
import { AppErrorBoundary } from 'react-native-observability';
import { DebugPanelProvider } from 'react-native-observability/panel';
import { logger, memoryTransport } from './services/logger';
import { Root } from './Root';

export default function App() {
  return (
    <AppErrorBoundary logger={logger} FallbackComponent={ErrorFallback}>
      <DebugPanelProvider
        enabled={__DEV__}
        logSource={memoryTransport}
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
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
      <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 8 }}>Error Caught</Text>
      <Text style={{ marginBottom: 16, color: '#666' }}>{error.message}</Text>
      <Button onPress={retry} title="Try Again" />
    </View>
  );
}
```

## Step 4: Use the Logger

```ts
// In any component or service
import { logger } from './services/logger';

logger.info('Screen loaded', { screen: 'Home' });
logger.warn('API slow', { endpoint: '/users', ms: 2000 });
logger.error('Request failed', new Error('Network timeout'));
```

## Step 5: Open the Panel

Multi-tap the top-right corner of the screen 5 times (default gesture). You'll see the debug panel slide up with all your logs.

Or open programmatically:

```tsx
import { useDebugPanel } from 'react-native-observability/panel';

export function MyScreen() {
  const { openPanel } = useDebugPanel();
  return <Button onPress={() => openPanel('logs')} title="📊 Open Logs" />;
}
```

## Add HTTP Monitoring (Optional)

```ts
// src/services/http.ts
import { createHttpObserver } from 'react-native-observability';
import { observeFetch } from 'react-native-observability/observers/fetch';
import { logger } from './logger';

export const http = createHttpObserver({
  logger,
  redact: { headerKeys: ['Authorization'] },
});

observeFetch(http);
```

Then update your `App.tsx`:

```tsx
<DebugPanelProvider
  enabled={__DEV__}
  logSource={memoryTransport}
  networkSource={http.store}  // ← add this
  openOn={['multiTap']}
>
```

Now every HTTP request (via `fetch`) is logged to the Network tab.

## Add Custom Error Adapter (Optional)

Forward errors to your backend:

```ts
// src/services/adapters.ts
import { createCustomAdapter } from 'react-native-observability/adapters';

export const myAdapter = createCustomAdapter({
  name: 'myservice',
  minLevel: LogLevel.ERROR,
  captureException: (err, ctx) => {
    // Send to your backend
    fetch('https://logs.myservice.com/errors', {
      method: 'POST',
      body: JSON.stringify({ error: err.message, context: ctx }),
    }).catch(() => {
      // Silently fail—don't crash the app
    });
  },
});
```

Then wire it into your logger:

```ts
// src/services/logger.ts
import { myAdapter } from './adapters';

export const logger = createLogger({
  // ...
  adapters: [myAdapter],
});
```

## Next Steps

- **[Logger Guide](./logger-guide.md)** — Master namespaces, redaction, sampling
- **[HTTP Observer](./http-observer.md)** — Advanced network monitoring and mocking
- **[Debug Panel](./debug-panel.md)** — Customize theme, tabs, and gestures
- **[Persistence](./persistence.md)** — Add MMKV for log persistence
- **[Examples](../examples)** — See full working apps

## Common Tasks

### Log an Error

```ts
try {
  await riskyOperation();
} catch (err) {
  logger.error('Operation failed', err instanceof Error ? err : new Error(String(err)));
}
```

### Create a Child Logger

```ts
const authLogger = logger.child('auth');
authLogger.info('Token refreshed'); // Logs as "app:auth"
```

### Change Log Level Dynamically

```ts
// Temporarily increase verbosity
logger.setLevel(LogLevel.DEBUG);

// Later, dial it back
logger.setLevel(LogLevel.WARN);
```

### Filter Logs by Level

Open the debug panel (multi-tap), go to the Logs tab, and use the level filter at the top.

### Search Logs

In the Logs tab, type in the search box at the top to filter by message, namespace, or context keys.
