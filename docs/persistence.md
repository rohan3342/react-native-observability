# Persistence & Sessions

How to persist logs across app launches and correlate them to sessions.

## Overview

Observability can persist logs to disk via MMKV, correlate them to sessions, and detect crashes.

```ts
import {
  createStorage,
  MMKVTransport,
  initSessionManager,
  getCurrentSessionId,
} from 'react-native-observability/storage';

const storage = createStorage({ id: 'my-app' });
const mmkvTransport = new MMKVTransport({ storage, minLevel: LogLevel.WARN });

const logger = createLogger({
  transports: [mmkvTransport],
  sessionIdProvider: getCurrentSessionId,
});

initSessionManager(storage, {
  appVersion: '1.0.0',
  buildNumber: 1,
  transports: [mmkvTransport],
});
```

## MMKV Storage

MMKV is a high-performance key-value store for React Native. Requires `react-native-mmkv` peer:

```bash
npm install react-native-mmkv
```

### createStorage

Create an MMKV storage instance:

```ts
import { createStorage } from 'react-native-observability/storage';

const storage = createStorage({ id: 'observability-logs' });

// storage has these methods:
storage.set(key, value);
storage.getString(key);
storage.getNumber(key);
storage.getBoolean(key);
storage.contains(key);
storage.getAllKeys();
storage.delete(key);
```

### MMKVTransport

Persist logs to disk:

```ts
const mmkvTransport = new MMKVTransport({
  storage,
  minLevel: LogLevel.WARN, // only persist WARN and above
  maxBytesPerSession: 1_000_000, // 1 MB per session
  encryption: {
    encryptKey: data => encrypt(data),
    decryptKey: encrypted => decrypt(encrypted),
  },
});

const logger = createLogger({
  transports: [new ConsoleTransport(), mmkvTransport],
});
```

Persisted logs:

- Are keyed by session ID and entry sequence
- Are filtered by `minLevel`
- Respect per-session byte budgets
- Can be retrieved for past sessions

## Session Management

Sessions group logs across app launches. The SessionManager:

1. Creates a new session on app launch
2. Detects if the prior session crashed (no `endTime`)
3. Provides the current session ID to the logger and transports
4. Marks sessions as ended when the app goes to the background

### initSessionManager

Initialize the session manager once, early:

```ts
import { initSessionManager, getCurrentSessionId } from 'react-native-observability/storage';

initSessionManager(storage, {
  appVersion: '1.0.0',
  buildNumber: 1,
  transports: [mmkvTransport],
});

// Now getCurrentSessionId() returns the session ID
const sessionId = getCurrentSessionId();
```

### Session Structure

Each session has:

```ts
interface SessionMeta {
  sessionId: string; // unique ID
  startedAt: number; // timestamp (ms)
  endedAt?: number; // timestamp or undefined if active
  crashed?: boolean; // true if crashed (no endTime on prior launch)
  appVersion: string;
  buildNumber: number;
}
```

### Getting Sessions

Retrieve all sessions:

```ts
import { getSessions } from 'react-native-observability/storage';

const sessions = getSessions();
sessions.forEach(session => {
  console.log(session.sessionId, session.crashed);
});

// Find the current session
const current = sessions[sessions.length - 1];
```

### Ending a Session

Manually end the current session and create a new one:

```ts
import { endCurrentSession } from 'react-native-observability/storage';

endCurrentSession();

// Next logs go to a new session
```

### Reopening a Session

Undo `endCurrentSession()` to reopen the most recent session:

```ts
import { reopenCurrentSession } from 'react-native-observability/storage';

reopenCurrentSession();
```

## Crash Detection

If the app crashes, the prior session is marked with `crashed: true` on the next launch:

```ts
const sessions = getSessions();
const hasCrashed = sessions.some(s => s.crashed);

if (hasCrashed) {
  logger.warn('App crashed on prior launch');
}
```

The panel's Settings tab shows crash info. The breadcrumb crash trail is recovered and displayed.

## Reading Persisted Logs

Retrieve logs from a session:

```ts
const transport = mmkvTransport;
const logs = transport.getEntriesForSession(sessionId);

logs.forEach(entry => {
  console.log(entry.message);
});
```

Pass this to the panel so users can view past session logs:

```tsx
<DebugPanelProvider
  getSessionLogs={(sessionId) => mmkvTransport.getEntriesForSession(sessionId)}
  // ...
>
```

## Clearing Storage

Wipe all persisted logs and sessions:

```ts
const keys = storage.getAllKeys();
keys.forEach(key => storage.delete(key));
```

Or provide a callback in the panel so users can clear from Settings:

```tsx
<DebugPanelProvider
  onClearStorage={() => {
    const keys = storage.getAllKeys();
    keys.forEach(key => storage.delete(key));
  }}
  // ...
>
```

## Encryption

Optionally encrypt persisted data:

```ts
import crypto from 'crypto';

const mmkvTransport = new MMKVTransport({
  storage,
  encryption: {
    encryptKey: data => {
      const encrypted = crypto.encrypt('aes-256-cbc', data, key);
      return encrypted;
    },
    decryptKey: encrypted => {
      const decrypted = crypto.decrypt('aes-256-cbc', encrypted, key);
      return decrypted;
    },
  },
});
```

The transport handles encryption/decryption transparently.

## Quota Management

Each session has a byte budget:

```ts
const mmkvTransport = new MMKVTransport({
  storage,
  maxBytesPerSession: 1_000_000, // 1 MB per session
});
```

When a session exceeds its quota, oldest entries are dropped. This prevents unbounded disk growth.

## Multi-Logger Setup

Multiple loggers can share the same storage:

```ts
const storage = createStorage({ id: 'my-app' });
const mmkvTransport = new MMKVTransport({ storage });

const appLogger = createLogger({
  namespace: 'app',
  transports: [mmkvTransport],
  sessionIdProvider: getCurrentSessionId,
});

const authLogger = appLogger.child('auth'); // inherits sessionIdProvider
```

Both loggers' entries are persisted under the same session.

## Best Practices

### Initialize SessionManager Early

Call `initSessionManager()` before any logging:

```ts
// App.tsx (very top, before rendering)
initSessionManager(storage, { appVersion, buildNumber });
const logger = createLogger({ sessionIdProvider: getCurrentSessionId });
```

### Use Sensible Quotas

Balance disk usage vs. retention:

```ts
// Conserve disk: 100 KB per session, max 10 sessions = 1 MB total
new MMKVTransport({ storage, maxBytesPerSession: 100_000 });

// Keep more: 1 MB per session, max 100 sessions = 100 MB total
new MMKVTransport({ storage, maxBytesPerSession: 1_000_000 });
```

### Integrate with Panel

Always provide `getSessionLogs` to the panel:

```tsx
<DebugPanelProvider
  getSessionLogs={(sessionId) => mmkvTransport.getEntriesForSession(sessionId)}
  onClearStorage={() => { /* clear all */ }}
  // ...
>
```

### Check for Crashes

On app launch, detect crashes and take action:

```ts
initSessionManager(storage, {
  /* ... */
});

const sessions = getSessions();
const crashed = sessions.some(s => s.crashed);
if (crashed) {
  // Send a crash report
  logger.error('Prior session crashed');
}
```

### Don't Over-Persist

Persisting everything is wasteful. Use `minLevel` to filter:

```ts
// Only persist WARN and above
new MMKVTransport({ storage, minLevel: LogLevel.WARN });
```

## Troubleshooting

**Q: Logs aren't persisting in Expo Go**  
A: MMKV requires a native module. Use Expo dev build (`npx expo run:ios`) or fall back to in-memory storage.

**Q: Can I migrate to a new MMKV ID?**  
A: Create a new storage with a new ID. Old data remains in the old MMKV instance. You'll need to manually migrate if desired.

**Q: What if I exceed the per-session quota?**  
A: Oldest entries are dropped. The transport logs this to internal metrics (`getInternalMetrics().droppedEntries`).

## Next Steps

- **[Breadcrumbs & Timeline](./breadcrumbs.md)** — Event timeline with crash trail
- **[Debug Panel](./debug-panel.md)** — View persisted logs in the panel
