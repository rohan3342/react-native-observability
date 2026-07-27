# Performance Monitoring

Measure and monitor performance with spans and metrics.

## Overview

Track performance of any operation—image decoding, API calls, screen-to-interactive time, etc.

```ts
import { trackPerformance } from 'react-native-observability';

const span = trackPerformance('decode-image', { logger });
await decodeImage();
span.end({ bytes: 40_000 });
```

Spans are recorded in `PerfStore`, visible in the panel's Performance tab (opt-in).

## trackPerformance

Start a performance span:

```ts
const span = trackPerformance('operation-name', {
  logger,  // optional: also log the span
  store,   // optional: custom perf store (default: singleton)
});

await doWork();

const durationMs = span.end({
  bytes: 10_000,     // optional context
  itemCount: 50,
});
```

## Performance Tab (Opt-in)

Enable the Performance tab in the panel:

```tsx
<DebugPanelProvider
  tabs={['logs', 'network', 'state', 'navigation', 'performance', 'settings']}
>
```

The Performance tab displays:
- All recorded spans
- Duration (ms)
- Context (bytes, count, etc.)
- Timeline

## Common Measurements

### Image Decoding

```ts
const span = trackPerformance('decode-image', { logger });
const decoded = await decodeImage(imageData);
span.end({ bytes: imageData.length, format: 'png' });
```

### API Calls

```ts
const span = trackPerformance('fetch-users', { logger });
const response = await fetch('/users');
const data = await response.json();
span.end({ itemCount: data.length, status: response.status });
```

### Screen Navigation

```ts
useEffect(() => {
  const span = trackPerformance('HomeScreen:render', { logger });
  return () => span.end();
}, []);
```

### List Rendering

```ts
const span = trackPerformance('render-list', { logger });
const items = renderList(data);
span.end({ itemCount: items.length });
```

## Internal Metrics

Get performance store stats:

```ts
import { getPerfStore } from 'react-native-observability';

const store = getPerfStore();
const spans = store.spans;  // all recorded spans

spans.forEach(span => {
  console.log(span.name, span.durationMs, span.context);
});
```

## Logging Integration

Spans are also logged at DEBUG:

```ts
const span = trackPerformance('operation', { logger });
await operation();
span.end();

// Logger output:
// DEBUG perf:operation { durationMs: 100 }
```

## Testing Performance

```ts
it('decodes image quickly', () => {
  const span = trackPerformance('decode', { logger });
  const decoded = decode(imageData);
  const duration = span.end();

  expect(duration).toBeLessThan(100);  // must be under 100ms
});
```

## Best Practices

### Measure High-Impact Operations

```ts
// ✓ Good — worth measuring
trackPerformance('decode-avatar', { logger });

// ✗ Poor — too granular
trackPerformance('set-state', { logger });
```

### Include Relevant Context

```ts
span.end({
  bytes: imageSize,
  format: 'jpeg',
  cached: true,
});
```

### Clean Up Spans

Idempotent `end()` allows safe usage in finally:

```ts
const span = trackPerformance('operation', { logger });
try {
  await operation();
  span.end();
} finally {
  span.end();  // called again, ignored
}
```

## Stability

Performance monitoring is marked **@stability experimental**. The API is stable but the implementation may evolve.

## Next Steps

- **[Architecture](./architecture.md)** — System design
- **[Debug Panel](./debug-panel.md)** — Performance tab
