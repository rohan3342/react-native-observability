# Observability Bare React Native Example

A production-grade bare React Native example demonstrating the full native surface.

## Overview

This example uses a bare React Native setup (CLI) with all Observability features, including:

- **MMKV persistence** — logs survive app restarts
- **Shake-to-open** — accelerometer gesture via `react-native-sensors`
- **Session management** — crash detection across launches
- **Full native integration** — no Expo limitations

This is the **reference implementation** for production apps. The code is type-correct and follows best practices, but has not been run through a CI-built binary in this repo. Treat it as a template.

## Project Structure

```
App.tsx                     # Main app component, router, error boundary, panel
metro.config.js             # Metro bundler config
tsconfig.json               # TypeScript config
package.json                # Dependencies
```

## Features Demonstrated

All of Observability's surface:

- **Logger with transports** — Console, Memory, MMKV
- **Session management** — crash detection, per-session logs
- **Error boundaries** — AppErrorBoundary at root
- **HTTP observer** — Axios + network mocking
- **Screen tracking** — trackScreen primitive
- **Debug panel** — shake-to-open, all 6 tabs
- **Custom adapter** — Sentry-style error forwarding
- **Shake gesture** — accelerometer from `react-native-sensors`

## Setup

### Prerequisites

- Node.js ≥18
- Xcode (iOS) or Android Studio (Android)
- Watchman (recommended for macOS)

### Installation

```bash
cd examples/bare
pnpm install
```

### Platform-Specific Setup

#### iOS

```bash
# Install pods
cd ios && pod install && cd ..

# Run on simulator
pnpm ios

# Or:
npx react-native run-ios
```

#### Android

```bash
# Run on emulator or device
pnpm android

# Or:
npx react-native run-android
```

## Key Architecture

### MMKV + SessionManager Setup

```ts
// App.tsx (top-level)
const storage = createStorage({ id: 'observability-example-bare' });

initSessionManager(storage, {
  appVersion: '0.1.0',
  buildNumber: 1,
  transports: [mmkvTransport],
});

// Now every log is stamped with the session ID
const logger = createLogger({
  sessionIdProvider: getCurrentSessionId,
  transports: [...],
});
```

**Important:** SessionManager must be initialized **before** the logger logs anything, so the session ID is available immediately.

### Shake Gesture

```ts
import { accelerometer, setUpdateIntervalForType, SensorTypes } from 'react-native-sensors';

setUpdateIntervalForType(SensorTypes.accelerometer, 100);
const shakeSource: AccelerometerSource = {
  addListener: cb => {
    const sub = accelerometer.subscribe(({ x, y, z }) => cb({ x, y, z }));
    return { remove: () => sub.unsubscribe() };
  },
};

<DebugPanelProvider
  openOn={['shake']}
  accelerometer={shakeSource}
>
```

### Nesting Order

```tsx
<SafeAreaProvider>
  <AppErrorBoundary logger={logger} FallbackComponent={ErrorFallback}>
    <DebugPanelProvider
      logSource={memoryTransport}
      networkSource={http.store}
      openOn={['shake']}
      accelerometer={shakeSource}
    >
      <NavigationContainer ref={navRef}>
        {/* app content */}
      </NavigationContainer>
    </DebugPanelProvider>
  </AppErrorBoundary>
</SafeAreaProvider>
```

**Why this order:**
1. **SafeAreaProvider** — at root so error fallback has context
2. **AppErrorBoundary** — wraps everything
3. **DebugPanelProvider** — wraps app content so panel survives render errors
4. **NavigationContainer** — wraps navigation

### Custom Adapter (Optional)

Wire Sentry for error forwarding:

```ts
import * as Sentry from '@sentry/react-native';

const sentryAdapter = createCustomAdapter({
  name: 'sentry',
  captureException: (err, ctx) => Sentry.captureException(err, { extra: ctx }),
  setUser: (user) => Sentry.setUser(user),
});

const logger = createLogger({
  adapters: [sentryAdapter],
  transports: [...],
});
```

## Debugging

### View Logs

Open the debug panel:
- **Shake** the device
- Or **multi-tap** (5×) the screen

### Inspect Network Requests

1. Open panel (shake)
2. Go to Network tab
3. Tap "Fire HTTP request" button
4. See request, response, headers, body (redacted)

### View Session Info

1. Open panel (shake)
2. Go to Settings tab
3. See current session ID, crash detection, storage usage

### Test Error Recovery

1. Open panel
2. Go to Settings tab
3. Tap "Trigger render error"
4. App shows fallback UI
5. Tap "Retry" to recover

## Building for Release

### iOS

```bash
# Create release build
npx react-native run-ios --configuration Release

# Or with Xcode
open ios/YourApp.xcworkspace
# → Product → Scheme → Select "Release"
# → Product → Run
```

### Android

```bash
# Create release build
npx react-native run-android --variant release

# Or build APK
cd android && ./gradlew assembleRelease && cd ..
# APK is in: android/app/build/outputs/apk/release/app-release.apk
```

### Production Considerations

1. **Disable panel in release:** Set `enabled={__DEV__}`
2. **Reduce log level:** Use `LogLevel.WARN` instead of `LogLevel.DEBUG`
3. **Apply sampling:** Only log a fraction of low-priority events
4. **Wire adapters:** Sentry, Datadog, or your backend for error reporting

```ts
const logger = createLogger({
  level: __DEV__ ? LogLevel.DEBUG : LogLevel.WARN,
  sampling: __DEV__ ? {} : { [LogLevel.INFO]: 0.5 },
  transports: __DEV__ ? [...] : [mmkvTransport],  // no console in release
  adapters: [sentryAdapter],  // always on
});
```

## Extending the Example

### Add a New Screen

```tsx
import { trackScreen } from 'react-native-observability';

export function NewScreen() {
  useEffect(() => {
    const unmount = trackScreen('NewScreen', {}, { logger });
    return unmount;
  }, []);

  return (
    <View>
      <Text>New Screen</Text>
    </View>
  );
}
```

### Add a Custom HTTP Client

Observe your HTTP client the same way as Axios:

```ts
import { observeAxios } from 'react-native-observability/observers/axios';

const client = axios.create();
observeAxios(client, http);
```

For GraphQL, tRPC, etc., use the corresponding observer.

### Add State Inspection

Pass app state to the panel:

```tsx
const [user, setUser] = useState(null);
const [settings, setSettings] = useState({});

<DebugPanelProvider
  stateSlices={{ user, settings }}
  // ...
>
```

The State tab displays this live.

## Testing

### Unit Tests

```ts
import { createLogger, MemoryTransport } from 'react-native-observability';

beforeEach(() => {
  testTransport = new MemoryTransport();
  testLogger = createLogger({
    transports: [testTransport],
  });
});

it('logs user login', () => {
  handleLogin('alice');

  const entry = testTransport.entries[0];
  expect(entry.message).toBe('User logged in');
});
```

### Integration Tests

```ts
import { render } from '@testing-library/react-native';

it('error boundary catches render errors', () => {
  const { getByText } = render(
    <AppErrorBoundary logger={testLogger} FallbackComponent={ErrorFallback}>
      <BombComponent />
    </AppErrorBoundary>
  );

  expect(getByText(/Error Caught/)).toBeTruthy();
});
```

## Troubleshooting

### Build fails: "Cannot find module react-native-sensors"

```bash
pnpm install react-native-sensors
npx react-native link react-native-sensors  # if needed
```

### Shake gesture not working

1. Ensure `react-native-sensors` is installed
2. Check that accelerometer permission is granted (Android)
3. Try multi-tap instead (5× tap)

### MMKV initialization fails

If `createStorage()` throws:
1. Ensure `react-native-mmkv` is installed
2. Check that native build succeeded
3. Verify pods are installed (iOS)

### SessionManager crashes

Make sure it's initialized **before** logging:

```ts
// ✓ Correct
initSessionManager(storage, { /* ... */ });
const logger = createLogger({ sessionIdProvider: getCurrentSessionId });

// ✗ Wrong
const logger = createLogger({ sessionIdProvider: getCurrentSessionId });
initSessionManager(storage, { /* ... */ });
```

## Production Checklist

- [ ] MMKV persistence configured
- [ ] SessionManager initialized early
- [ ] Custom adapter wired (Sentry/Datadog)
- [ ] Error boundary at root
- [ ] Panel disabled in release builds
- [ ] Log level appropriate for environment
- [ ] Sampling/rate-limiting configured
- [ ] Redaction enabled for sensitive fields
- [ ] Error boundary fallback UI looks good
- [ ] App tested on real devices (iOS + Android)

## Next Steps

- **[Getting Started](../../docs/getting-started.md)** — Core concepts
- **[Installation](../../docs/installation.md)** — Peer setup
- **[API Reference](../../docs/api-reference.md)** — Complete API
- **[Logger Guide](../../docs/logger-guide.md)** — Logging best practices
- **[Main README](../../README.md)** — Package overview
