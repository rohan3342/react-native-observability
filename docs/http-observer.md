# HTTP Observer

Monitor HTTP requests and responses in real-time. Supports Fetch, Axios, GraphQL, React Query, tRPC, Apollo, urql, and RTK Query.

## Overview

The HTTP Observer captures all network activity:

```ts
const http = createHttpObserver({
  logger,
  redact: { headerKeys: ['Authorization'] },
  screenProvider,
});

const store = http.store; // read by panel
```

Vendor shims feed events into the observer:

```ts
import { observeFetch } from 'react-native-observability/observers/fetch';
import { observeAxios } from 'react-native-observability/observers/axios';

observeFetch(http);
observeAxios(client, http);
```

The panel displays all requests in the Network tab with filtering, search, and mock rules.

## Creating an Observer

```ts
import { createHttpObserver } from 'react-native-observability';

const http = createHttpObserver({
  logger, // optional: errors logged here
  redact: {
    redactDefaultHeaders: true,
    headerKeys: ['X-API-Key'],
    redactDefaultBodyKeys: true,
    bodyKeys: ['secret'],
  },
  screenProvider, // optional: tag requests with screen
  breadcrumbs, // optional: record to timeline
  logInProduction: false, // default: no-op in production
});

export const store = http.store; // pass to panel
export { http }; // pass to vendor shims
```

## Vendor Shims

### Fetch

Observe all `fetch` calls:

```ts
import { observeFetch } from 'react-native-observability/observers/fetch';

observeFetch(http, {
  responseBodyContentTypes: ['application/json'], // which responses to capture
});
```

Returns a cleanup function:

```ts
const restore = observeFetch(http);
// later:
restore(); // restore original fetch
```

### Axios

Observe an Axios instance:

```ts
import axios from 'axios';
import { observeAxios } from 'react-native-observability/observers/axios';

const client = axios.create({ baseURL: 'https://api.example.com' });
http.observeAxios(client, http, {
  mock: mockEngine, // optional
});
```

### React Navigation

Track screen transitions:

```ts
import { observeReactNavigation } from 'react-native-observability/observers/react-navigation';

observeReactNavigation(navRef, { logger });
```

Returns an observer with `onStateChange()` to call on navigation state changes.

### React Query

Track query/mutation lifecycle:

```ts
import { observeReactQuery } from 'react-native-observability/observers/react-query';

observeReactQuery(queryClient, { logger });
```

### GraphQL

Observe GraphQL requests (fetch-based):

```ts
import { observeGraphQL } from 'react-native-observability/observers/graphql';

observeGraphQL(http);
```

### tRPC

Observe tRPC calls:

```ts
import { observeTRPC } from 'react-native-observability/observers/trpc';

observeTRPC(http);
```

### Apollo, urql, RTK Query

Similar imports available:

```ts
import { observeApollo } from 'react-native-observability/observers/apollo';
import { observeUrql } from 'react-native-observability/observers/urql';
import { observeRTKQuery } from 'react-native-observability/observers/rtk-query';
```

## Network Entry Structure

Each network entry has:

```ts
interface NetworkLogEntry {
  id: string; // unique ID
  method: string; // GET, POST, etc.
  url: string; // full URL
  startedAt: number; // timestamp (ms)
  durationMs: number; // elapsed time
  requestHeaders?: Record<string, string>;
  requestBody?: unknown;
  status?: number; // HTTP status
  responseHeaders?: Record<string, string>;
  responseBody?: unknown;
  error?: Error; // if request failed
  cancelled?: boolean; // if aborted
  screen?: string; // if screenProvider configured
  source: 'fetch' | 'axios' | 'graphql' | 'trpc' | 'apollo' | 'urql' | 'rtk-query';
}
```

## Redaction

HTTP headers and bodies are redacted in the write path:

```ts
const http = createHttpObserver({
  redact: {
    redactDefaultHeaders: true, // redact Authorization, Cookie, etc.
    headerKeys: ['X-API-Key'], // extra headers to redact
    redactDefaultBodyKeys: true, // redact password, token, etc.
    bodyKeys: ['secret'], // extra body keys to redact
  },
});
```

Redacted values appear as `[REDACTED]` in the panel.

## Screen Attribution

Tag every request with the currently-active screen:

```ts
const screenProvider = createScreenProvider();

const http = createHttpObserver({
  screenProvider, // resolved at request start
});

const logger = createLogger({
  screenProvider, // logger entries also tagged
});
```

Then in your screens:

```tsx
useEffect(() => trackScreen('HomeScreen'), []);
```

Every request fired while HomeScreen is active gets tagged with `screen: 'HomeScreen'`, powering the panel's per-screen Network filters.

## Screen Override

Force a request to a specific screen or no screen:

```ts
// Vendor shim supplies this manually:
http.onStart({
  id: 'custom-req',
  url: 'https://api.example.com/data',
  method: 'GET',
  ts: Date.now(),
  screen: 'SettingsScreen', // force to SettingsScreen
});

// Or: no screen
http.onStart({
  id: 'global-req',
  url: 'https://api.example.com/global',
  method: 'GET',
  ts: Date.now(),
  screen: null, // no screen (e.g., background task)
});
```

## Network Mocking

Create a mock engine to intercept and modify requests:

```ts
import { createMockEngine } from 'react-native-observability';

const mock = createMockEngine({
  rules: [
    {
      id: 'mock-users',
      enabled: false,
      match: { url: '/users', method: 'GET' },
      action: { type: 'respond', status: 200, body: [{ id: 1, name: 'Alice' }] },
    },
    {
      id: 'block-analytics',
      enabled: false,
      match: { url: /analytics/ },
      action: { type: 'block' },
    },
    {
      id: 'flaky-api',
      enabled: false,
      match: { url: '/api' },
      action: { type: 'fault', kind: 'networkError', everyN: 3 },
    },
  ],
  allowInProduction: false,
});

observeFetch(http, { mock });
observeAxios(client, http, { mock });
```

Pass the mock engine to the panel for live rule editing:

```tsx
<DebugPanelProvider
  mockEngine={mock}
  // ...
>
```

The **Rule Details** editor in the panel's Network → Rules tab provides a structured UI for creating and editing rules. See the **[Network Rules guide](./network-rules.md)** for step-by-step recipes (mock any endpoint, force 400/500 errors, simulate timeouts, add auth headers, and more), or [debug-panel.md](./debug-panel.md#mock-engine) for the editor UI reference.

### Mock Rule Types

#### Respond

Intercept and answer synthetically:

```ts
{
  type: 'respond',
  status: 200,
  body: { data: 'mocked' },
  headers: { 'X-Mock': '1' },
  delayMs: 500,
}
```

#### Block

Fail the request:

```ts
{
  type: 'block',
  delayMs: 0,  // optional delay before failing
}
```

#### Fault

Inject a transient failure:

```ts
{
  type: 'fault',
  kind: 'networkError' | 'timeout',
  everyN: 3,         // fail every 3rd request (1 = always)
  delayMs: 2000,     // delay before failing — only used for 'timeout'
}
```

#### Modify Request

Inject headers or modify the body:

```ts
{
  type: 'modifyRequest',
  headers: {
    set: { 'X-Observability-Mock': '1' },
    remove: ['X-Old-Header'],
  },
  body: { /* modified body */ },
}
```

#### Modify Response

Rewrite a real response:

```ts
{
  type: 'modifyResponse',
  status: 503,
  body: { error: 'Simulated outage' },
  headers: { /* ... */ },
}
```

## Breadcrumb Integration

Record completed requests to the breadcrumb timeline:

```ts
import { getBreadcrumbStore } from 'react-native-observability';

const http = createHttpObserver({
  breadcrumbs: getBreadcrumbStore(),
});
```

Each completed request is recorded as a breadcrumb entry, visible in the panel's Settings → Timeline (crash trail).

## Error Logging

HTTP errors are logged at ERROR level:

```ts
const http = createHttpObserver({
  logger, // errors logged here
});

// If a request fails:
// logger.error('HTTP request failed', error, { url, method, status })
```

## Production Behavior

By default, HTTP observation is disabled in production:

```ts
const http = createHttpObserver({
  logInProduction: false, // default
});
```

To enable in production (for staging/preprod):

```ts
const http = createHttpObserver({
  logInProduction: true,
});
```

## Best Practices

### Always Redact Credentials

```ts
const http = createHttpObserver({
  redact: {
    headerKeys: ['Authorization', 'X-API-Key'],
    bodyKeys: ['password', 'token', 'refreshToken'],
  },
});
```

### Use Mocking for Testing

Create mock rules to test error handling:

```ts
const mock = createMockEngine({
  rules: [
    {
      id: 'test-timeout',
      enabled: true, // enabled for this test
      match: { url: '/api/slow' },
      action: { type: 'fault', kind: 'timeout', delayMs: 30_000 },
    },
  ],
});
```

### Monitor Response Times

Use the panel's Network tab to see request duration. Look for slowdowns:

```ts
// In the panel: Network tab → sort by Duration
```

### Check for Unredacted PII

In tests, verify no PII leaks:

```ts
observeFetch(http);
await fetch('https://api.example.com/login', {
  method: 'POST',
  body: JSON.stringify({ email: 'user@example.com', password: 'secret' }),
});

const entry = http.store.entries[0];
expect(entry.requestBody?.password).toBe('[REDACTED]');
```

## Next Steps

- **[Network Rules](./network-rules.md)** — Mock, block, fault, and transform requests from the panel
- **[Screen Tracking](./screen-tracking.md)** — Attribution and idle windows
- **[Breadcrumbs](./breadcrumbs.md)** — Event timeline and crash trails
- **[Debugging](./troubleshooting.md)** — Common issues and solutions
