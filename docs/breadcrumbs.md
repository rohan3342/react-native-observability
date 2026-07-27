# Breadcrumbs & Timeline

Event timeline and crash trail for debugging.

## Overview

Breadcrumbs record every significant event (logs, navigation, network) chronologically. The timeline persists across app crashes, forming a crash trail that helps diagnose what went wrong.

```ts
import { BreadcrumbTransport, getBreadcrumbStore } from 'react-native-observability';

new BreadcrumbTransport();  // every log becomes a breadcrumb
getBreadcrumbStore().configurePersistence(...);  // persist across crashes
```

Open the panel's Settings → Timeline to view the breadcrumb trail.

## BreadcrumbTransport

Automatically records every log entry as a breadcrumb:

```ts
const logger = createLogger({
  transports: [
    new ConsoleTransport(),
    new BreadcrumbTransport({
      minLevel: LogLevel.WARN,  // only record WARN and above
      maxEntries: 1000,
    }),
    new MMKVTransport({ storage }),
  ],
});

logger.info('Info (not recorded)');      // below minLevel
logger.warn('Warning (recorded)');      // recorded as breadcrumb
logger.error('Error (recorded)');       // recorded as breadcrumb
```

## Network Breadcrumbs

Record completed HTTP requests to the timeline:

```ts
import { getBreadcrumbStore } from 'react-native-observability';

const http = createHttpObserver({
  breadcrumbs: getBreadcrumbStore(),  // every request is a breadcrumb
});
```

## Breadcrumb Structure

Each breadcrumb is a snapshot of an event:

```ts
interface Breadcrumb {
  kind: 'log' | 'network' | 'navigation' | 'error';
  level?: LogLevel;
  message?: string;
  timestamp: number;
  data?: Record<string, unknown>;
}
```

## Persistence Across Launches

Persist the breadcrumb trail so the crash trail survives app restart:

```ts
import { getBreadcrumbStore, getCurrentSessionId } from 'react-native-observability/storage';

const breadcrumbs = getBreadcrumbStore();
const sessionId = getCurrentSessionId();

if (sessionId) {
  breadcrumbs.configurePersistence(
    {
      getItem: (key) => storage.getString(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
    sessionId,  // key persisted breadcrumbs by session
  );
}
```

On next launch, the breadcrumb store automatically loads the prior session's trail.

## Crash Detection

Combine breadcrumbs + SessionManager for crash trails:

```ts
import { getSessions } from 'react-native-observability/storage';

const sessions = getSessions();
const hasCrashed = sessions.some(s => s.crashed);

if (hasCrashed) {
  // App crashed on prior launch
  // The breadcrumb timeline of that session is available in the panel
  logger.info('Recovered from crash');
}
```

The panel's Settings → Timeline shows:
1. All breadcrumbs from the current session (live)
2. All breadcrumbs from the prior (crashed) session (read-only)

Users can inspect what happened before the crash.

## Viewing in the Panel

Open the panel (multi-tap or shake), go to Settings tab:

1. **Timeline** section shows chronological breadcrumbs
2. Click on a breadcrumb to see details
3. Use session selector to view prior sessions' trails

## Custom Breadcrumbs

Manually record breadcrumbs:

```ts
const breadcrumbs = getBreadcrumbStore();

breadcrumbs.record({
  kind: 'log',
  level: LogLevel.WARN,
  message: 'Custom event',
  timestamp: Date.now(),
  data: { userId: 'u123', action: 'logout' },
});
```

## Best Practices

### Record at Appropriate Minlevel

```ts
// Development: record everything
new BreadcrumbTransport({ minLevel: LogLevel.DEBUG })

// Production: record WARN and above
new BreadcrumbTransport({ minLevel: LogLevel.WARN })
```

### Set Reasonable Quota

```ts
new BreadcrumbTransport({ maxEntries: 500 })  // last 500 events
```

### Persist for Crash Analysis

```ts
if (sessionId) {
  breadcrumbs.configurePersistence({ /* storage */ }, sessionId);
}
```

### Check Breadcrumbs on Crash

```ts
const sessions = getSessions();
const crashed = sessions.some(s => s.crashed);
if (crashed) {
  // Crash detected — show message or send analytics
}
```

## Next Steps

- **[Persistence & Sessions](./persistence.md)** — Session management
- **[Debug Panel](./debug-panel.md)** — Panel UI
