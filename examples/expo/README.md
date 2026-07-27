# Observability Expo Example

A production-grade Expo Go-safe example showcasing Observability's full surface.

## Overview

This example demonstrates Observability running in **Expo Go** (no native build required). All features work except:

- **MMKV persistence** — available in dev builds (`npx expo run:ios`)
- **Shake-to-open** — available in dev builds (requires accelerometer)

Everything else works directly in Expo Go via the JavaScript layer.

## Features Demonstrated

- **Logger** — structured logging with multiple transports
- **Custom adapter** — in-memory error capture (backend simulation)
- **HTTP observers** — Axios and Fetch with network mocking
- **Navigation tracking** — React Navigation integration
- **Screen attribution** — per-screen log and request filtering
- **Error boundaries** — render error isolation and fallback UI
- **Debug panel** — on-device UI with 6+ tabs
- **Breadcrumb timeline** — event history
- **Session manager** — session correlation (dev build only)
- **State inspection** — live feature flags and app state
- **PII redaction** — password/token redaction
- **Network mocking** — intercept and modify requests

## Project Structure

```
src/
├─ observability.ts          # Logger, HTTP, adapters, session wiring
├─ theme.tsx                 # Theme system (light/dark)
├─ ui.tsx                    # Shared UI components
├─ screens/
│  ├─ HomeScreen.tsx         # Storage & sessions card, demo actions
│  ├─ NetworkScreen.tsx      # Network tab showcase (fetch/axios)
│  ├─ LogsScreen.tsx         # Log examples (all levels, namespaces)
│  ├─ ErrorsScreen.tsx       # Performance spans, error demonstration
│  └─ AttributionScreen.tsx  # Screen attribution cases
└─ App.tsx                   # Router, error boundary, debug panel

dist/                        # Built app (created by Expo)
```

## Setup

### Prerequisites

- Node.js ≥18
- Expo CLI: `npm install -g expo-cli`
- iOS Simulator or Android Emulator (or physical device)

### Installation

```bash
cd examples/expo
pnpm install
```

### Running

```bash
# Expo Go (browser)
pnpm start
# Scan QR code with Expo Go app (iOS/Android)

# iOS Simulator
pnpm start --ios

# Android Emulator
pnpm start --android

# Bare device
pnpm start --tunnel
```

## Key Demonstrations

### Home Screen

**Storage & Sessions Card:**
- Shows if MMKV persistence is active (dev build) or in-memory (Expo Go)
- Displays current session ID
- Shows total sessions saved
- Indicates if prior session crashed
- "Clear All" button wipes everything

**Demo Actions:**
- **Log INFO** — simple info entry
- **Log WARN** — warning entry (persists to MMKV if available)
- **Fire HTTP request** — GET from JSONPlaceholder
- **Trigger render error** — throws from `<Bomb />` component

### Network Screen

**Demonstrates:**
- Axios GET/POST/PUT/DELETE calls
- Fetch GET/POST calls
- Request/response bodies captured
- Headers redacted (Authorization)
- HTTP status codes
- Error handling (404, timeout)
- Mock rules editor (right tab)

**Mock Rules:**
- Mock a specific endpoint
- Block analytics traffic
- Force a 503 error
- Inject a header
- Make every 3rd request fail

Enable rules live from the panel (Network → Rules).

### Logs Screen

**Demonstrates:**
- DEBUG, INFO, WARN, ERROR levels
- Namespace hierarchy (`app`, `app:auth`, `app:network`)
- Context objects (searchable)
- Error logging with stack traces
- Child loggers

**Panel Filtering:**
- Filter by level (DEBUG, INFO, WARN, ERROR)
- Filter by namespace
- Search by message or context keys

### Errors Screen

**Demonstrates:**
- Performance spans with `trackPerformance()`
- Render errors caught by boundaries
- Error recovery with "Retry" button
- Performance tab in the panel

### Attribution Screen

**Demonstrates three screen attribution cases:**

1. **Owned request** — fired while HomeScreen is active → tagged with HomeScreen
2. **Global request** — fired with `screen: null` → unattributed (background task)
3. **Explicit request** — fired with `screen: 'SettingsScreen'` → forced attribution

Use the panel's Network tab → Screen filter to see the three cases.

## MMKV Persistence (Dev Build Only)

This example gracefully handles both Expo Go and dev builds:

```ts
// src/observability.ts
let mmkvStorage: MMKVLike | null = null;
try {
  const raw = createMMKV({ id: 'observability-expo-example' });
  mmkvStorage = { /* adapted interface */ };
} catch {
  // Expo Go — no native module
  mmkvStorage = null;
}
```

If MMKV is available:
- Logs WARN+ persist to disk
- SessionManager detects crashes
- Panel preferences persist
- Breadcrumb crash trail recovers

If MMKV is unavailable (Expo Go):
- Everything falls back to in-memory
- App works normally
- No disk I/O

### Testing MMKV

```bash
# Build a dev build for iOS
npx expo run:ios

# Or use EAS (Expo Application Services)
eas build --platform=ios --profile=preview
```

In a dev build, the Home screen shows "MMKV" as persistent, and logs survive restarts.

## Extending the Example

### Add a New Screen

```tsx
// src/screens/MyScreen.tsx
import { useScreenTracker } from 'react-native-observability/observers/react-navigation';

export function MyScreen() {
  useScreenTracker({ logger });
  
  return (
    <View>
      <Text>My Screen</Text>
    </View>
  );
}
```

Add to the navigator:

```tsx
// App.tsx
<Tab.Screen name="MyScreen" component={MyScreen} />
```

### Add a Custom Adapter

```ts
// src/observability.ts
const myAdapter = createCustomAdapter({
  name: 'myservice',
  captureException: (err, ctx) => {
    console.log('Error captured:', err.message, ctx);
    // In a real app, send to your backend
  },
});

const logger = createLogger({
  adapters: [myAdapter],
  // ...
});
```

### Add Network Mocking

```ts
// src/observability.ts
const mockEngine = createMockEngine({
  rules: [
    {
      id: 'mock-posts',
      enabled: false,
      match: { url: '/posts/1' },
      action: { type: 'respond', status: 200, body: { id: 1, title: 'Mocked Post' } },
    },
  ],
});

observeFetch(http, { mock: mockEngine });
observeAxios(apiClient, http, { mock: mockEngine });
```

Enable from the panel: Network → Rules.

### Theming

```tsx
// App.tsx
const t = useTheme();  // hook inside DebugPanelProvider

// Apply to UI
<Text style={{ color: t.colors.accent }}>Text</Text>
```

Switch themes live in Settings → Appearance.

## Troubleshooting

### Logs not appearing

1. Open the panel (5× multi-tap)
2. Go to Logs tab
3. Check filter level (should see DEBUG or lower)
4. Try "Log INFO" button on Home screen

### Network tab empty

1. Make sure you're on the Network tab
2. Tap "Fire HTTP request" on Home screen
3. If still empty, `observeFetch()` or `observeAxios()` may not be wired

### Panel won't open

1. Try multi-tap (5×) on screen
2. Try "Open Logs" button on Home screen
3. Check that DebugPanelProvider wraps the app

### App crashes on startup

This shouldn't happen in Expo Go. If it does:
1. Clear the Metro bundler cache: `pnpm start --reset-cache`
2. Restart the development server

## Build & Deploy

### EAS Build

```bash
eas build --platform=ios --profile=preview
# or
eas build --platform=android --profile=preview
```

### Local Build

```bash
# iOS
eas build --platform=ios --profile=preview --local

# Android
eas build --platform=android --profile=preview --local
```

## Next Steps

- **[Getting Started](../../docs/getting-started.md)** — Core concepts
- **[Quick Start](../../docs/quick-start.md)** — 5-minute setup
- **[Debug Panel](../../docs/debug-panel.md)** — Panel customization
- **[HTTP Observer](../../docs/http-observer.md)** — Network monitoring
- **[Main README](../../README.md)** — Package overview
