# Adapters Guide

How to create and wire custom adapters for error forwarding to any backend.

## What is an Adapter?

An adapter is a **remote error forwarder**. It receives errors from the logger and sends them to a backend (Sentry, Datadog, your own service, etc.).

Adapters are:
- **Optional** — wire zero or many
- **Isolated** — a broken backend never crashes your app
- **Deferred** — queued asynchronously so they don't block the logger
- **Rate-limited** — backpressure prevents queue overflow

## createCustomAdapter

Use `createCustomAdapter` to wire any backend:

```ts
import { createCustomAdapter, LogLevel } from 'react-native-observability/adapters';

const adapter = createCustomAdapter({
  name: 'myservice',
  minLevel: LogLevel.ERROR,  // forward ERROR and above
  captureException: (err, ctx) => {
    // Send to backend
    sendToMyBackend({
      error: err.message,
      stack: err.stack,
      context: ctx,
    });
  },
  setUser: (user) => {
    // Optional: set user context
    setUserOnBackend(user);
  },
  captureMessage: (level, message, ctx) => {
    // Optional: capture non-error messages
    sendToBackend({ level, message, context: ctx });
  },
  setTags: (tags) => {
    // Optional: set tags/metadata
    setTagsOnBackend(tags);
  },
});

const logger = createLogger({
  adapters: [adapter],
  transports: [...],
});
```

## Methods

### captureException (Required)

Called when an error is logged at or above `minLevel`.

```ts
captureException: (err, ctx) => {
  console.log(err.message);   // 'Request failed'
  console.log(err.stack);     // stack trace
  console.log(ctx);           // { endpoint: '/users', status: 500 }
}
```

### setUser (Optional)

Called once to set the user context. Useful for crash attribution.

```ts
setUser: (user) => {
  // user shape: { id?: string; username?: string; email?: string }
  myBackend.setUser(user);
}
```

### captureMessage (Optional)

Called for non-error messages if you want to log them to the backend too.

```ts
captureMessage: (level, message, ctx) => {
  myBackend.log({ level, message, context: ctx });
}
```

### setTags (Optional)

Called to set tags/metadata that apply to all subsequent captures.

```ts
setTags: (tags) => {
  Object.entries(tags).forEach(([k, v]) => {
    myBackend.setTag(k, v);
  });
}
```

## Example: Sentry Integration

```ts
import * as Sentry from '@sentry/react-native';
import { createCustomAdapter, LogLevel } from 'react-native-observability/adapters';

const sentryAdapter = createCustomAdapter({
  name: 'sentry',
  minLevel: LogLevel.ERROR,
  captureException: (err, ctx) => {
    Sentry.captureException(err, { extra: ctx });
  },
  setUser: (user) => {
    Sentry.setUser(user);
  },
  setTags: (tags) => {
    Sentry.setTags(tags);
  },
});

const logger = createLogger({
  adapters: [sentryAdapter],
  transports: [...],
});
```

## Example: Datadog Integration

```ts
import { DdRumReactNative } from '@datadog/browser-rum-react-native';
import { createCustomAdapter, LogLevel } from 'react-native-observability/adapters';

const datadogAdapter = createCustomAdapter({
  name: 'datadog',
  minLevel: LogLevel.ERROR,
  captureException: (err, ctx) => {
    DdRumReactNative.addError(err, { context: ctx });
  },
  setUser: (user) => {
    DdRumReactNative.setUserInfo(user);
  },
  setTags: (tags) => {
    DdRumReactNative.setGlobalContextProperty('tags', tags);
  },
});
```

## Example: Custom Backend

```ts
const myAdapter = createCustomAdapter({
  name: 'myservice',
  minLevel: LogLevel.ERROR,
  captureException: async (err, ctx) => {
    try {
      await fetch('https://logs.myservice.com/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error: err.message,
          stack: err.stack,
          context: ctx,
          timestamp: Date.now(),
          appVersion: '1.0.0',
        }),
      });
    } catch (fetchErr) {
      // Silently fail — don't crash the logger
      console.warn('Failed to send error to backend', fetchErr);
    }
  },
  setUser: (user) => {
    localStorage.setItem('observability-user', JSON.stringify(user));
  },
});
```

## Error Isolation

If your adapter throws, it's caught and silenced:

```ts
const badAdapter = createCustomAdapter({
  name: 'broken',
  captureException: (err) => {
    throw new Error('I am broken!');  // caught
  },
});

logger.error('Something failed', new Error('Real error'));
// The broken adapter's error is caught, logged internally, and dropped.
// The real error is still captured and forwarded to other adapters.
```

Check `getInternalMetrics()` for adapter failures:

```ts
const metrics = getInternalMetrics();
console.log(metrics.adapterQueueDepth);     // queue depth
console.log(metrics.totalAdapterCalls);     // how many times adapters were invoked
```

## Async Adapters

Adapters can be async, but the logger won't wait for them:

```ts
const asyncAdapter = createCustomAdapter({
  name: 'async-backend',
  captureException: async (err, ctx) => {
    // This runs async, queued and deferred
    await fetch('https://logs.myservice.com/errors', {
      method: 'POST',
      body: JSON.stringify({ error: err.message, context: ctx }),
    }).catch(() => {
      // Silently fail
    });
  },
});
```

The logger queues the error and drains the queue asynchronously via microtask. This keeps the hot path fast.

## Controlling Adapter Invocation

Control which errors reach adapters via `minLevel`:

```ts
const adapter = createCustomAdapter({
  name: 'myservice',
  minLevel: LogLevel.ERROR,  // only ERROR and above
  captureException: (err) => { /* ... */ },
});

logger.warn('Warning');     // not forwarded
logger.error('Error');      // forwarded to adapter
```

## Best Practices

### Always Include Error Context

```ts
// ✓ Good
logger.error('Request failed', err, { endpoint, status, retrying: true });

// ✗ Poor
logger.error('Request failed', err);
```

### Handle Network Failures

Your adapter's network call might fail:

```ts
captureException: (err, ctx) => {
  fetch('https://logs.myservice.com', { /* ... */ })
    .catch((fetchErr) => {
      // Log internally, don't throw
      console.warn('Failed to send to backend', fetchErr);
    });
}
```

### Don't Throw in Adapters

If your adapter throws, it's caught and silenced. There's no recovery. Just log internally and move on.

### Set User Context Early

Call `setUser()` as soon as you know the user:

```ts
import { ObservabilityConfig } from 'react-native-observability';

const config = ObservabilityConfig.get();
const adapter = config.logger.adapters[0];
if (adapter?.setUser) {
  adapter.setUser({ id: userId, email: userEmail });
}
```

### Test Adapter Isolation

Verify your adapter doesn't crash the logger:

```ts
const badAdapter = createCustomAdapter({
  name: 'test-bad',
  captureException: () => {
    throw new Error('Boom!');
  },
});

const logger = createLogger({ adapters: [badAdapter] });
logger.error('Test', new Error('Real error'));  // logs without crashing

const metrics = getInternalMetrics();
expect(metrics.adapterQueueDepth).toBeGreaterThan(0);
```

## Next Steps

- **[Logger Guide](./logger-guide.md)** — Logger configuration and usage
- **[Testing Guide](./testing.md)** — Test adapters
- **[Examples](../examples)** — See working integrations
