# Logger Guide

Deep dive into Observability's structured logger, transports, redaction, and sampling.

## Overview

The Logger is the core API for capturing events with context. It's transport-agnostic—logs flow through independent transports (Console, Memory, MMKV) and can be forwarded to remote backends via adapters.

```ts
const logger = createLogger({
  namespace: 'app',
  level: LogLevel.DEBUG,
  transports: [new ConsoleTransport(), new MemoryTransport()],
  adapters: [myCustomAdapter],
});

logger.info('User signed in', { userId: 'u123' });
logger.error('Request failed', error, { endpoint: '/users' });
```

## Logging Methods

### Basic Levels

| Method           | Level     | Use Case                    |
| ---------------- | --------- | --------------------------- |
| `logger.debug()` | DEBUG (0) | Dev-only, verbose tracing   |
| `logger.info()`  | INFO (1)  | General app events          |
| `logger.warn()`  | WARN (2)  | Recoverable issues          |
| `logger.error()` | ERROR (3) | Errors (logged to adapters) |
| `logger.fatal()` | FATAL (4) | Unrecoverable (rare)        |

```ts
logger.debug('Entering auth flow');
logger.info('User signed in', { userId: 'u123' });
logger.warn('API slow', { ms: 2500 });
logger.error('Request failed', new Error('Timeout'));
```

### Error Logging

When you call `logger.error()`, the error is:

1. Captured and redacted
2. Written to all transports
3. Forwarded to all adapters at or above ERROR level

```ts
try {
  await fetchData();
} catch (err) {
  logger.error('Fetch failed', err instanceof Error ? err : new Error(String(err)), {
    endpoint: '/users',
    retry: true,
  });
}
```

## Namespaces

Namespaces organize logs hierarchically. Use child loggers for domain-specific logging:

```ts
const logger = createLogger({ namespace: 'app' });

const authLogger = logger.child('auth');
const networkLogger = logger.child('network');

logger.info('App started'); // namespace: 'app'
authLogger.info('Token refreshed'); // namespace: 'app:auth'
networkLogger.info('Request sent'); // namespace: 'app:network'

// Chain deeper
const loginLogger = authLogger.child('login');
loginLogger.info('Form submitted'); // namespace: 'app:auth:login'
```

Namespaces are useful for:

- **Filtering** — in the panel, show only logs from 'network:\*'
- **Sampling** — apply different sampling to different domains
- **Organization** — logs are grouped logically

## Log Entry Structure

Each log entry is an object:

```ts
interface LogEntry {
  level: LogLevel;
  namespace: string;
  timestamp: number;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    message: string;
    stack?: string;
    name: string;
  };
  screen?: string; // if screenProvider is configured
  sessionId?: string; // if sessionIdProvider is configured
  entryId: string; // unique identifier
}
```

## Context

Pass arbitrary context as the third argument (for `error()`) or second argument (for other methods):

```ts
logger.info('User signed in', {
  userId: 'u123',
  provider: 'oauth',
  metadata: { timestamp: Date.now() },
});

logger.error('Request failed', error, {
  endpoint: '/users',
  method: 'GET',
  status: 503,
  retrying: true,
});
```

Context is:

- **Searchable** in the panel's log search
- **Redactable** via redaction rules
- **Forwarded to adapters** for remote logging

## Transports

Transports are write destinations. Each logger can have multiple transports.

### ConsoleTransport

Writes to React Native's console (visible in logcat/Xcode):

```ts
new ConsoleTransport({
  minLevel: LogLevel.WARN, // only WARN and above
  useColor: true, // colorize output
  useTimestamp: true, // add [HH:MM:SS] prefix
});
```

Useful for development and debugging.

### MemoryTransport

Keeps a ring buffer of entries in RAM:

```ts
const memTransport = new MemoryTransport({
  maxEntries: 500, // keep the last 500 entries
  minLevel: LogLevel.DEBUG,
});

// Read entries
const entries = memTransport.entries;

// Clear entries
memTransport.clear();
```

The panel reads from MemoryTransport via `useSyncExternalStore`.

### MMKVTransport

Persists to disk via `react-native-mmkv`:

```ts
import { MMKVTransport } from 'react-native-observability/storage';

const mmkvTransport = new MMKVTransport({
  storage,
  minLevel: LogLevel.WARN, // only persist WARN and above
  maxBytesPerSession: 1_000_000, // 1 MB per session
  encryption: {
    encryptKey: data => encrypt(data),
    decryptKey: encrypted => decrypt(encrypted),
  },
});
```

Persisted logs:

- Survive app restarts
- Are correlated to sessions (with SessionManager)
- Can be read from past sessions in the panel

### Custom Transport

Implement `ITransport` to create a custom transport:

```ts
class MyTransport implements ITransport {
  write(entry: LogEntry): void {
    sendToMyBackend(entry);
  }

  clear?(): void {
    // optional
  }
}

new MyTransport();
```

## Adapters

Adapters forward errors to remote backends. They are isolated—a broken backend never crashes your app.

### createCustomAdapter

Wire any backend via `createCustomAdapter`:

```ts
import { createCustomAdapter, LogLevel } from 'react-native-observability/adapters';

const myAdapter = createCustomAdapter({
  name: 'myservice',
  minLevel: LogLevel.ERROR, // only forward ERROR and above
  captureException: (err, ctx) => {
    sendToMyBackend({
      error: err.message,
      stack: err.stack,
      context: ctx,
      timestamp: Date.now(),
    });
  },
});

const logger = createLogger({ adapters: [myAdapter] });
```

Adapters receive:

- `error: Error` — the captured error
- `context: Record<string, unknown>` — the entry context
- `entry: LogEntry` — the full log entry

### Error Isolation

Each adapter is wrapped in `try/catch`. If an adapter throws:

```ts
const badAdapter = createCustomAdapter({
  name: 'bad',
  captureException: err => {
    throw new Error('I am broken!'); // caught and silenced
  },
});
```

The error is:

1. Caught
2. Logged to internal metrics (via `getInternalMetrics()`)
3. Silently dropped

The logger continues working, and other adapters are unaffected.

## Redaction

Redaction is applied in the write path before transports/adapters see data. Protects PII automatically.

### Key-Path Matching

Redact by key path using `**` for recursive matching:

```ts
const logger = createLogger({
  redact: {
    keys: ['password', 'token', 'ssn'],
    mode: 'replace', // 'replace' | 'omit'
  },
});

logger.info('Login attempt', {
  user: { email: 'user@example.com', password: 'secret123' },
});
// Result: password is replaced with [REDACTED]
```

Key-path patterns:

- `user.email` — matches only `obj.user.email`
- `user.**.email` — matches `obj.user.email` and `obj.user.profile.email`
- `**.password` — matches any `password` at any depth

### Value-Side Patterns

Redact by regex pattern on the value:

```ts
const logger = createLogger({
  redact: {
    matchers: [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN
      /\b\d{16}\b/, // credit card
    ],
  },
});

logger.info('Transaction', { ssn: '123-45-6789', cardLast4: '1234' });
// SSN is redacted
```

### Redaction Modes

- **`replace`** (default) — value becomes `[REDACTED]`: `{ password: '[REDACTED]' }`
- **`omit`** — key is removed: `{ username: 'user' }` (password gone)

```ts
const logger = createLogger({
  redact: {
    keys: ['password'],
    mode: 'omit', // password key is removed
  },
});
```

### Default Rules

By default, these are always redacted (unless you set `redactDefaultKeys: false`):

- **Keys:** password, token, secret, apiKey, auth, Authorization, sessionId, refreshToken
- **Headers:** Authorization, Cookie, X-API-Key, X-Token
- **Value patterns:** email, JWT, Luhn-checked credit cards, SSN

## Sampling

Probabilistic sampling reduces log volume when your app logs heavily.

### Namespace Sampling

Sample per namespace:

```ts
const logger = createLogger({
  sampling: {
    network: 0.5, // log 50% of 'network' entries
    auth: 0.1, // log 10% of 'auth' entries
  },
});
```

Sampling uses a stable hash, so the same keys are consistently sampled. Example: "user 123" is always sampled or always dropped.

### Level Sampling

Sample per level:

```ts
const logger = createLogger({
  sampling: {
    [LogLevel.DEBUG]: 0.5, // log 50% of DEBUG
    [LogLevel.INFO]: 1.0, // log 100% of INFO (no sampling)
    [LogLevel.WARN]: 1.0, // always log warnings and errors
  },
});
```

## Rate Limiting

Token-bucket rate limiting caps throughput across all loggers:

```ts
const logger = createLogger({
  rateLimit: {
    entriesPerSecond: 1000, // max 1000 entries/sec
  },
});
```

If exceeded, entries are dropped and counted in `getInternalMetrics().droppedEntries`.

## Dynamic Configuration

Change log level or set transports at runtime:

```ts
// Change level
logger.setLevel(LogLevel.DEBUG); // increase verbosity
logger.setLevel(LogLevel.WARN); // dial it back

// Temporarily add a transport
const tempTransport = new MemoryTransport();
logger.setTransports([...logger.transports, tempTransport]);
```

## Screen & Session Tagging

If you configure providers, each entry is automatically tagged:

```ts
const screenProvider = createScreenProvider();
const logger = createLogger({
  screenProvider,
  sessionIdProvider: getCurrentSessionId,
  transports: [new MemoryTransport()],
});

// Result entry includes:
// { screen: 'HomeScreen', sessionId: 'sess-123-xyz' }
```

Screen tags are used by the panel's per-screen filters.

## Best Practices

### Use Child Loggers

Organize logs by domain:

```ts
const authLogger = logger.child('auth');
const apiLogger = logger.child('api');

authLogger.info('Token refreshed');
apiLogger.error('Request failed', err);
```

### Log Context

Always include relevant context:

```ts
// ✓ Good
logger.info('User signed in', { userId, provider, duration: ms });

// ✗ Poor
logger.info('User signed in');
```

### Use Appropriate Levels

- **DEBUG** — detailed tracing (verbose, dev-only)
- **INFO** — general app events
- **WARN** — recoverable issues
- **ERROR** — actual errors (logged to adapters)

### Handle Errors Properly

```ts
// ✓ Good
try {
  await operation();
} catch (err) {
  logger.error('Operation failed', err instanceof Error ? err : new Error(String(err)));
  // handle or throw
}

// ✗ Poor
try {
  await operation();
} catch (err) {
  logger.info('Operation failed'); // not logged to adapters
}
```

### Test with Redaction

In tests, verify redaction works:

```ts
logger.info('Login', { password: 'secret' });
const entry = memTransport.entries[0];
expect(entry.context.password).toBe('[REDACTED]');
```

## Next Steps

- **[Adapters Guide](./adapters-guide.md)** — Custom backends and error forwarding
- **[Redaction Guide](./redaction.md)** — Advanced PII protection
- **[Testing Guide](./testing.md)** — Testing with the logger
