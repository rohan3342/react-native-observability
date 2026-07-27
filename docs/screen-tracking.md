# Screen Tracking

Tag logs and network requests with the active screen for per-screen filtering.

## Overview

Screen tracking attributes logs and HTTP requests to the screen that was active when they fired. This powers the panel's per-screen filters.

## trackScreen Primitive

Record screen mount/unmount:

```ts
import { trackScreen } from 'react-native-observability';

export function HomeScreen() {
  useEffect(() => {
    const unmount = trackScreen('HomeScreen', { tab: 'home' }, { logger });
    return unmount;
  }, []);

  // ... component
}
```

This records:

```ts
{ screen: 'HomeScreen', event: 'mount', timestamp: ..., params: { tab: 'home' } }
{ screen: 'HomeScreen', event: 'unmount', timestamp: ... }
```

## createScreenProvider

Create a provider function that resolves the currently-active screen:

```ts
import { createScreenProvider } from 'react-native-observability';

const screenProvider = createScreenProvider({
  idleMs: 1000,  // idle window in ms
});

const logger = createLogger({
  screenProvider,  // logs tagged with active screen
  transports: [...],
});

const http = createHttpObserver({
  screenProvider,  // requests tagged with active screen
  logger,
});
```

The provider reads from a shared `ScreenMountStore` which is populated by `trackScreen()`.

## Idle Window

The idle window prevents background work from being mis-attributed to a screen:

1. Screen mounts — window opens
2. Activity occurs (mounts, requests) — window extends
3. After `idleMs` of no activity — window closes
4. Background calls (after close) — not attributed to the screen

Example:

```
Time  | Event           | Provider Output
------|-----------------|----------------
0ms   | HomeScreen mnt  | "HomeScreen"
100ms | request sent    | "HomeScreen" (within window)
200ms | idle for 200ms  | (no activity)
1200ms| background req  | undefined (idle window expired)
```

With `idleMs: 1000`, a background request 1.2s after the last activity is unattributed.

## React Navigation Integration

Use `observeReactNavigation()` to auto-populate the screen store:

```ts
import { observeReactNavigation } from 'react-native-observability/observers/react-navigation';

observeReactNavigation(navRef, { logger });

// Now navigation state changes auto-feed into the screen store
```

## useScreenTracker Hook

Convenience hook for screen components:

```ts
import { useScreenTracker } from 'react-native-observability/observers/react-navigation';

export function HomeScreen() {
  useScreenTracker({ logger });  // auto tracks mount/unmount

  // ... component
}
```

Equivalent to:

```ts
useEffect(() => {
  const unmount = trackScreen('HomeScreen', {}, { logger });
  return unmount;
}, []);
```

## Screen Parameters

Pass params to `trackScreen()`:

```ts
trackScreen('UserDetailScreen', { userId: 'u123', mode: 'view' }, { logger });
```

Params are stored in the screen event and available in panel's Navigation tab.

## Session ID Tagging

Optionally tag screen events with session ID:

```ts
trackScreen('HomeScreen', {}, { logger, sessionId: getCurrentSessionId() });
```

## Manual Screen Override

Force a request to a specific screen or no screen:

```ts
http.onStart({
  id: 'custom-req',
  url: 'https://api.example.com/data',
  method: 'GET',
  ts: Date.now(),
  screen: 'SettingsScreen',  // force to SettingsScreen
});

http.onStart({
  id: 'global-req',
  url: 'https://api.example.com/global',
  method: 'GET',
  ts: Date.now(),
  screen: null,  // force no screen
});
```

## Per-Screen Filtering

In the panel's Logs and Network tabs, filter by screen:

1. Open panel
2. Go to Logs or Network tab
3. Click the screen filter (top bar)
4. Select a screen to show only entries from that screen

## Testing Screen Attribution

```ts
it('attributes requests to the visible screen', () => {
  const screenProvider = createScreenProvider();
  const http = createHttpObserver({ screenProvider });

  trackScreen('HomeScreen', {});
  
  http.onStart({ id: '1', url: 'https://api.example.com', method: 'GET', ts: Date.now() });
  
  const entry = http.store.entries[0];
  expect(entry.screen).toBe('HomeScreen');
});
```

## Best Practices

### Track All Screens

Don't miss screens — incomplete tracking reduces filter utility:

```ts
// ✓ Good — all screens tracked
export function HomeScreen() {
  useScreenTracker({ logger });
}

export function SettingsScreen() {
  useScreenTracker({ logger });
}

// ✗ Poor — only some screens tracked
export function HomeScreen() {
  useScreenTracker({ logger });
}

export function SettingsScreen() {
  // no tracking
}
```

### Use Descriptive Screen Names

Make screen names searchable:

```ts
// ✓ Good
trackScreen('UserDetailScreen', { userId });
trackScreen('UserListScreen', { filter: 'active' });

// ✗ Poor
trackScreen('Screen1', {});
trackScreen('Page', {});
```

### Tune Idle Window

Default idle window is 1 second. Adjust for your app:

```ts
// Short window (100ms) — responsive but more mis-attribution
const screenProvider = createScreenProvider({ idleMs: 100 });

// Medium window (1s) — balanced (default)
const screenProvider = createScreenProvider({ idleMs: 1000 });

// Long window (10s) — permissive, fewer filters
const screenProvider = createScreenProvider({ idleMs: 10_000 });
```

## Next Steps

- **[HTTP Observer](./http-observer.md)** — Screen attribution in network monitoring
- **[Debug Panel](./debug-panel.md)** — Per-screen filtering in the panel
