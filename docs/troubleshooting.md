# Troubleshooting

Common issues and solutions.

## Logger Issues

### Logger not capturing logs

**Symptoms:** Logs don't appear in console or panel.

**Causes:**
1. Logger not initialized: `createLogger()` not called
2. Transports not configured: empty `transports: []`
3. Level too high: DEBUG logs won't show if level is WARN

**Solutions:**

```ts
// Check that logger is created
const logger = createLogger({
  level: LogLevel.DEBUG,  // lower level to see more
  transports: [
    new ConsoleTransport(),   // add Console
    new MemoryTransport(),    // add Memory (for panel)
  ],
});

logger.info('Test');  // should appear in console
```

### Logs not reaching panel

**Symptoms:** Logs in console but not in panel's Logs tab.

**Causes:**
1. MemoryTransport not in logger transports
2. DebugPanelProvider not wrapped around app
3. `logSource` not passed to DebugPanelProvider

**Solutions:**

```tsx
const memoryTransport = new MemoryTransport();

const logger = createLogger({
  transports: [new ConsoleTransport(), memoryTransport],
});

<DebugPanelProvider
  logSource={memoryTransport}  // must be the same instance
  enabled={__DEV__}
>
  <App />
</DebugPanelProvider>
```

### Errors not forwarded to backend

**Symptoms:** Errors logged but not reaching your adapter/backend.

**Causes:**
1. Adapter `minLevel` too high (only ERROR and above by default)
2. Adapter not in logger's `adapters` array
3. Adapter throwing internally (caught silently)

**Solutions:**

```ts
const adapter = createCustomAdapter({
  name: 'myservice',
  minLevel: LogLevel.ERROR,  // lower if needed
  captureException: (err, ctx) => {
    try {
      sendToBackend(err, ctx);
    } catch (e) {
      console.warn('Adapter failed:', e);  // debug
    }
  },
});

const logger = createLogger({
  adapters: [adapter],  // must be in array
  transports: [...],
});

logger.error('Test', new Error('test'));  // should send to backend
```

## Panel Issues

### Panel not appearing

**Symptoms:** Multi-tap or shake gesture doesn't open panel.

**Causes:**
1. DebugPanelProvider not wrapping app
2. `enabled={false}`
3. Gesture configuration missing or wrong

**Solutions:**

```tsx
<DebugPanelProvider
  enabled={__DEV__}  // must be true
  openOn={['multiTap']}
  multiTapCount={5}
>
  <App />
</DebugPanelProvider>

// Or open programmatically
const { openPanel } = useDebugPanel();
openPanel('logs');
```

### Shake gesture not working

**Symptoms:** Shake gesture configured but doesn't open panel.

**Causes:**
1. Accelerometer source not provided
2. `react-native-sensors` not installed
3. Expo Go (native module not available)

**Solutions:**

```bash
npm install react-native-sensors
```

```tsx
import { accelerometer, setUpdateIntervalForType, SensorTypes } from 'react-native-sensors';

setUpdateIntervalForType(SensorTypes.accelerometer, 100);
const shakeSource = {
  addListener: cb => {
    const sub = accelerometer.subscribe(({ x, y, z }) => cb({ x, y, z }));
    return { remove: () => sub.unsubscribe() };
  },
};

<DebugPanelProvider
  openOn={['shake']}
  accelerometer={shakeSource}
>
  <App />
</DebugPanelProvider>
```

### Network tab empty

**Symptoms:** HTTP requests made but Network tab shows no entries.

**Causes:**
1. `networkSource` not passed to DebugPanelProvider
2. Observer not wired (e.g., `observeFetch()` not called)
3. Requests made before observer installed

**Solutions:**

```ts
const http = createHttpObserver({ logger });
observeFetch(http);
observeAxios(client, http);

// Make sure this happens before any network calls
```

```tsx
<DebugPanelProvider
  networkSource={http.store}  // must be the same instance
  enabled={__DEV__}
>
  <App />
</DebugPanelProvider>
```

## Persistence Issues

### Logs not persisting in Expo Go

**Symptoms:** Logs don't survive app restart in Expo Go.

**Root cause:** Expo Go doesn't include native modules like MMKV.

**Solution:** Use Expo dev build:

```bash
npx expo run:ios
npx expo run:android
```

Or fall back to in-memory storage in Expo Go:

```ts
let mmkvTransport = null;
try {
  const storage = createStorage({ id: 'my-app' });
  mmkvTransport = new MMKVTransport({ storage });
} catch {
  // Expo Go — no MMKV available
  console.warn('MMKV not available');
}

const logger = createLogger({
  transports: [
    new ConsoleTransport(),
    ...(mmkvTransport ? [mmkvTransport] : []),
  ],
});
```

### Cannot import MMKV

**Symptoms:** Error like `cannot find module 'react-native-mmkv'`.

**Causes:**
1. `react-native-mmkv` not installed
2. New Architecture not enabled (MMKV v4 requires it)
3. Native build not run

**Solutions:**

```bash
npm install react-native-mmkv react-native-nitro-modules
```

Then rebuild:

```bash
npx react-native run-ios
npx react-native run-android
```

### Sessions not created

**Symptoms:** `getCurrentSessionId()` returns `undefined`.

**Causes:**
1. `initSessionManager()` not called
2. Called after logger is already logging
3. In Expo Go (no MMKV)

**Solutions:**

```ts
// Call VERY early, before rendering
initSessionManager(storage, { appVersion: '1.0.0', buildNumber: 1 });

const logger = createLogger({
  sessionIdProvider: getCurrentSessionId,
  transports: [...],
});
```

## Network Issues

### Requests not captured

**Symptoms:** HTTP requests made but not in Network tab.

**Causes:**
1. Observer not installed for your HTTP client
2. Wrong client instance passed to observer
3. Requests made before observer installed

**Solutions:**

```ts
// For fetch
import { observeFetch } from 'react-native-observability/observers/fetch';
observeFetch(http);

// For axios
import { observeAxios } from 'react-native-observability/observers/axios';
const client = axios.create();
observeAxios(client, http);  // same instance

// For other clients: observeGraphQL, observeTRPC, etc.
```

### Request body not captured

**Symptoms:** Request shows in panel but `requestBody` is empty.

**Causes:**
1. Request body is not a string (e.g., FormData, Blob)
2. Body is not JSON-serializable

**Solutions:**

Only string bodies are captured (to avoid re-creating streams). FormData and binary bodies show `requestBody: undefined`.

### Response body not captured

**Symptoms:** Response shows in panel but `responseBody` is empty.

**Causes:**
1. Content-Type not in `responseBodyContentTypes` (default: `['application/json']`)
2. Response can't be cloned (rare)

**Solutions:**

```ts
observeFetch(http, {
  responseBodyContentTypes: ['application/json', 'text/plain', 'application/xml'],
});
```

## Redaction Issues

### Sensitive data not redacted

**Symptoms:** Passwords, tokens visible in panel or console.

**Causes:**
1. Redaction not configured
2. Key-path pattern doesn't match
3. Redaction rule applied to wrong transport

**Solutions:**

```ts
const logger = createLogger({
  redact: {
    keys: ['password', 'token', 'apiKey'],
    matchers: [/\b[a-z0-9]{32}\b/i],  // 32-char hex strings
  },
  transports: [...],
});

// Verify redaction
const memTransport = new MemoryTransport();
logger.info('Test', { password: 'secret' });
const entry = memTransport.entries[0];
console.log(entry.context?.password);  // should be '[REDACTED]'
```

## Performance Issues

### App slow with high logging

**Symptoms:** Frame drops, UI lag when logging heavily.

**Causes:**
1. Too much logging (DEBUG level in production)
2. Large objects logged
3. No sampling or rate-limiting

**Solutions:**

```ts
const logger = createLogger({
  level: __DEV__ ? LogLevel.DEBUG : LogLevel.WARN,
  sampling: {
    'network': 0.5,  // log 50% of network entries
    [LogLevel.INFO]: 0.9,  // log 90% of INFO
  },
  rateLimit: {
    entriesPerSecond: 1000,
  },
  transports: [...],
});
```

### Panel slow to render

**Symptoms:** Panel laggy when scrolling logs.

**Causes:**
1. Too many entries (MemoryTransport maxEntries too high)
2. Large individual entries
3. Low-end device

**Solutions:**

```ts
const memTransport = new MemoryTransport({
  maxEntries: 200,  // reduce if necessary
});
```

## Next Steps

- **[FAQ](./faq.md)** — Frequently asked questions
- **[Performance](./troubleshooting.md#performance-issues)** — Tuning for production
- **[Security](./redaction.md)** — PII protection
