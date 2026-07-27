# Error Boundaries

Catch and isolate render errors with custom fallback UI.

## Overview

Error boundaries catch render errors (exceptions thrown in render methods). Observability provides two:

- **AppErrorBoundary** — top-level, catches all render errors
- **ScreenErrorBoundary** — screen-level, isolates specific screens

```tsx
<AppErrorBoundary logger={logger} FallbackComponent={ErrorFallback}>
  <ScreenErrorBoundary logger={logger} FallbackComponent={ScreenErrorFallback}>
    <MyScreen />
  </ScreenErrorBoundary>
</AppErrorBoundary>
```

## AppErrorBoundary

Top-level boundary for the entire app:

```tsx
import { AppErrorBoundary } from 'react-native-observability';

function ErrorFallback({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8 }}>Error Caught</Text>
      <Text style={{ marginBottom: 16, color: '#666' }}>{error.message}</Text>
      <Button onPress={retry} title="Try Again" />
    </View>
  );
}

export default function App() {
  return (
    <AppErrorBoundary logger={logger} FallbackComponent={ErrorFallback}>
      <Root />
    </AppErrorBoundary>
  );
}
```

### Props

| Prop                | Type                                              | Description                                           |
| ------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| `logger`            | `Logger`                                          | Logger to capture the error                           |
| `FallbackComponent` | `React.ComponentType<ErrorBoundaryFallbackProps>` | Fallback UI                                           |
| `isolate`           | `boolean`                                         | If true, error doesn't propagate to parent boundaries |

## ScreenErrorBoundary

Fine-grained boundary for a single screen:

```tsx
import { ScreenErrorBoundary } from 'react-native-observability';

export function HomeScreen() {
  return (
    <ScreenErrorBoundary logger={logger} FallbackComponent={ScreenErrorFallback} isolate={true}>
      <View>
        <Text>Home</Text>
      </View>
    </ScreenErrorBoundary>
  );
}
```

Isolating each screen prevents one broken screen from crashing the entire app.

## withErrorBoundary (HOC)

Wrap a component with an error boundary:

```ts
import { withErrorBoundary } from 'react-native-observability';

const SafeHomeScreen = withErrorBoundary(HomeScreen, {
  logger,
  FallbackComponent: ScreenErrorFallback,
  isolate: true,
});

// Use it like a normal component
<SafeHomeScreen />
```

## useErrorHandler

Hook to manually trigger error boundary fallback:

```ts
import { useErrorHandler } from 'react-native-observability';

export function MyComponent() {
  const { error, retry } = useErrorHandler();

  if (error) {
    return (
      <View>
        <Text>Error: {error.message}</Text>
        <Button onPress={retry} title="Retry" />
      </View>
    );
  }

  // ... normal render
}
```

## Global Error Handler

For errors outside render (async, event handlers, timers):

```ts
import { installGlobalErrorHandler } from 'react-native-observability';

installGlobalErrorHandler(logger, {
  pauseOnThrow: false, // optional
});

// Uncaught errors and unhandled rejections are now logged
```

This catches:

- Uncaught exceptions in event handlers
- Unhandled promise rejections
- Errors thrown in timers
- Errors from native modules

## Best Practices

### Multi-Level Boundaries

Use both app-level and screen-level boundaries:

```tsx
<AppErrorBoundary logger={logger} FallbackComponent={AppErrorFallback}>
  <Navigation>
    <HomeStack>
      <ScreenErrorBoundary logger={logger} FallbackComponent={ScreenErrorFallback}>
        <HomeScreen />
      </ScreenErrorBoundary>
    </HomeStack>
  </Navigation>
</AppErrorBoundary>
```

Benefits:

- Screen-level errors don't crash the whole app
- Users can navigate to a different screen
- App-level fallback catches truly catastrophic errors

### Provide Useful Fallback UI

```tsx
// ✓ Good
function ErrorFallback({ error, retry }: ErrorBoundaryFallbackProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.message}>{error.message}</Text>
      <Button onPress={retry} title="Try Again" />
      <Button onPress={() => navigation.navigate('Home')} title="Go Home" />
    </View>
  );
}

// ✗ Poor
function ErrorFallback({ error, retry }: ErrorBoundaryFallbackProps) {
  return <Text>Error</Text>; // not helpful
}
```

### Log Extra Context

In your fallback, log additional context:

```ts
function ErrorFallback({ error, retry }: ErrorBoundaryFallbackProps) {
  useEffect(() => {
    logger.error('Render error in HomeScreen', error, {
      screen: 'HomeScreen',
      timestamp: Date.now(),
    });
  }, [error]);

  return /* fallback UI */;
}
```

### Don't Suppress Errors

Don't swallow errors silently:

```ts
// ✗ Bad — error is hidden
try {
  riskyOp();
} catch (err) {
  // silently ignore
}

// ✓ Good — error is logged and handled
try {
  riskyOp();
} catch (err) {
  logger.error('Operation failed', err);
  // handle gracefully
}
```

### Isolate Unreliable Widgets

If a widget sometimes crashes, isolate it:

```tsx
<ScreenErrorBoundary logger={logger} FallbackComponent={WidgetFallback} isolate>
  <UnreliableWidget />
</ScreenErrorBoundary>
```

## Testing Error Boundaries

```ts
// Test that the boundary catches errors
function BombComponent() {
  throw new Error('Boom!');
}

it('catches render errors', () => {
  const { getByText } = render(
    <AppErrorBoundary logger={logger} FallbackComponent={ErrorFallback}>
      <BombComponent />
    </AppErrorBoundary>
  );

  expect(getByText('Error Caught')).toBeTruthy();
});
```

## Next Steps

- **[Global Error Handler](./logger-guide.md#global-error-handler)** — Catch uncaught errors
- **[Testing](./testing.md)** — Test error boundaries
