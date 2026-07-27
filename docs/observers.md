# Observers

Vendor integrations for HTTP clients, navigation, and data-fetching libraries.

## Overview

Observers feed events into Observability's core (HTTP, screens, async operations). Each observer is a thin shim—provider-agnostic at its core.

## Fetch

Observe all `fetch` calls:

```ts
import { observeFetch } from 'react-native-observability/observers/fetch';

const http = createHttpObserver({ logger });
observeFetch(http, {
  responseBodyContentTypes: ['application/json'],
  mock: mockEngine, // optional
});

// All fetch calls are captured
```

Returns cleanup function:

```ts
const restore = observeFetch(http);
restore(); // restore original fetch
```

## Axios

Observe an Axios instance:

```ts
import axios from 'axios';
import { observeAxios } from 'react-native-observability/observers/axios';

const client = axios.create({ baseURL: 'https://api.example.com' });
const http = createHttpObserver({ logger });

observeAxios(client, http, {
  mock: mockEngine, // optional
});

// All requests via this client are captured
```

## React Navigation

Track screen transitions:

```ts
import { observeReactNavigation } from 'react-native-observability/observers/react-navigation';

const navRef = createNavigationContainerRef();
const nav = observeReactNavigation(navRef, { logger });

// Call on state changes
<NavigationContainer ref={navRef} onStateChange={nav.onStateChange}>
  {/* navigator */}
</NavigationContainer>
```

### useScreenTracker Hook

Auto-track mount/unmount:

```ts
import { useScreenTracker } from 'react-native-observability/observers/react-navigation';

export function HomeScreen() {
  useScreenTracker({ logger }); // auto tracks
  // ...
}
```

## React Query

Observe queries and mutations:

```ts
import { observeReactQuery } from 'react-native-observability/observers/react-query';

const queryClient = new QueryClient();
observeReactQuery(queryClient, { logger });

// All queries/mutations are observed
```

Captures:

- Query starts and ends
- Mutation lifecycle
- Errors logged to logger

## GraphQL

Observe GraphQL requests (via fetch):

```ts
import { observeGraphQL } from 'react-native-observability/observers/graphql';

const http = createHttpObserver({ logger });
observeGraphQL(http);

// GraphQL queries are captured in Network tab
```

## tRPC

Observe tRPC calls:

```ts
import { observeTRPC } from 'react-native-observability/observers/trpc';

const http = createHttpObserver({ logger });
observeTRPC(http);

// tRPC requests are captured
```

## Apollo

Observe Apollo client:

```ts
import { observeApollo } from 'react-native-observability/observers/apollo';

const http = createHttpObserver({ logger });
observeApollo(http);

// Apollo queries/mutations are captured
```

## urql

Observe urql client:

```ts
import { observeUrql } from 'react-native-observability/observers/urql';

const http = createHttpObserver({ logger });
observeUrql(http);

// urql requests are captured
```

## RTK Query

Observe RTK Query:

```ts
import { observeRTKQuery } from 'react-native-observability/observers/rtk-query';

const http = createHttpObserver({ logger });
observeRTKQuery(http);

// RTK Query requests are captured
```

## Building a Custom Observer

Create your own observer for an unsupported client:

```ts
export function observeMyClient(myClient, http) {
  const originalRequest = myClient.request;

  myClient.request = function (config) {
    const id = generateId();
    const ts = Date.now();

    http.onStart({
      id,
      ts,
      method: config.method,
      url: config.url,
      source: 'my-client',
    });

    return originalRequest
      .call(this, config)
      .then(response => {
        http.onEnd({
          id,
          durationMs: Date.now() - ts,
          status: response.status,
        });
        return response;
      })
      .catch(error => {
        http.onEnd({
          id,
          durationMs: Date.now() - ts,
          error,
        });
        throw error;
      });
  };
}
```

## Combining Observers

Mix multiple observers freely:

```ts
import { observeFetch } from 'react-native-observability/observers/fetch';
import { observeAxios } from 'react-native-observability/observers/axios';
import { observeReactQuery } from 'react-native-observability/observers/react-query';

const http = createHttpObserver({ logger });

observeFetch(http);
observeAxios(client, http);
observeReactQuery(queryClient, { logger });

// All network calls are unified in the Network tab
```

## Best Practices

### Install in Order

If you have multiple observers wrapping the same transport, install in the order they'll be called:

```ts
// ✓ Good order
observeFetch(http); // outermost
observeAxios(client, http);
```

### Use Same HTTP Observer

All observers should use the same `HttpObserver` instance so entries are unified:

```ts
const http = createHttpObserver({ logger });
observeFetch(http);
observeAxios(client, http);
observeReactQuery(queryClient, { logger: http.logger }); // same logger
```

### Clean Up Observers

Some observers return cleanup functions:

```ts
const restore = observeFetch(http);
// later
restore();
```

## Next Steps

- **[HTTP Observer](./http-observer.md)** — Network monitoring
- **[Screen Tracking](./screen-tracking.md)** — Navigation and attribution
- **[Examples](../examples)** — Working integrations
