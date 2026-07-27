# Installation Guide

This guide covers installing Observability and its optional peer dependencies.

## Core Package

```bash
npm install react-native-observability
pnpm add react-native-observability
yarn add react-native-observability
```

The core is pure TypeScript—no native module, no forced dependencies, no setup required.

## Optional Peers

Install **only the peers you actually use**. Observability is designed to be modular; each feature can be adopted independently.

### Persistent Storage (MMKV)

If you want logs to survive app restarts, install:

```bash
npm install react-native-mmkv react-native-nitro-modules
```

Then wire it in your app:

```ts
import { createStorage, MMKVTransport } from 'react-native-observability/storage';

const storage = createStorage({ id: 'my-app' });
const mmkvTransport = new MMKVTransport({ storage });

const logger = createLogger({
  transports: [new ConsoleTransport(), mmkvTransport],
});
```

> **Note:** `react-native-mmkv` v4 requires the New Architecture. See [troubleshooting](./troubleshooting.md) if you're on the old architecture.

### Session Management

To correlate logs across app launches and detect crashes:

```bash
npm install react-native-mmkv  # required for persistence
```

Then initialize the SessionManager:

```ts
import {
  createStorage,
  initSessionManager,
  getCurrentSessionId,
} from 'react-native-observability/storage';

const storage = createStorage({ id: 'my-app' });
initSessionManager(storage, { appVersion: '1.0.0', buildNumber: 1 });

const logger = createLogger({
  // ...
  sessionIdProvider: getCurrentSessionId,
});
```

Sessions are automatically created, and a prior crash is detected on app relaunch.

### HTTP Observers

#### Fetch (Built-in)

No installation needed—`fetch` is built into React Native:

```ts
import { observeFetch } from 'react-native-observability/observers/fetch';

const http = createHttpObserver({ logger });
observeFetch(http);
```

#### Axios

```bash
npm install axios
```

```ts
import axios from 'axios';
import { observeAxios } from 'react-native-observability/observers/axios';

const client = axios.create();
const http = createHttpObserver({ logger });
observeAxios(client, http);
```

#### React Navigation

```bash
npm install @react-navigation/native
```

```ts
import { observeReactNavigation } from 'react-native-observability/observers/react-navigation';

observeReactNavigation(navRef, { logger });
```

#### React Query

```bash
npm install @tanstack/react-query
```

```ts
import { observeReactQuery } from 'react-native-observability/observers/react-query';

observeReactQuery(queryClient, { logger });
```

#### GraphQL

```bash
npm install graphql
```

```ts
import { observeGraphQL } from 'react-native-observability/observers/graphql';

observeGraphQL(http);
```

#### tRPC

```bash
npm install @trpc/client
```

```ts
import { observeTRPC } from 'react-native-observability/observers/trpc';

observeTRPC(http);
```

#### Apollo

```bash
npm install @apollo/client
```

```ts
import { observeApollo } from 'react-native-observability/observers/apollo';

observeApollo(http);
```

#### urql

```bash
npm install urql
```

```ts
import { observeUrql } from 'react-native-observability/observers/urql';

observeUrql(http);
```

#### RTK Query

```bash
npm install @reduxjs/toolkit
```

```ts
import { observeRTKQuery } from 'react-native-observability/observers/rtk-query';

observeRTKQuery(http);
```

## Platform Setup

### Expo

Observability works in **Expo Go** for most features. Optional peers:

- **MMKV** — Not supported in Expo Go; use in dev builds (`npx expo run:ios`)
- **Shake gesture** — Not supported in Expo Go; use in dev builds with `react-native-sensors`

If you're starting fresh, [Expo's setup documentation](https://docs.expo.dev/workflow/overview/) has everything you need.

### Bare React Native

Full support for all features:

```bash
npm install react-native@latest
npm install react-native-mmkv react-native-nitro-modules  # optional
npm install react-native-sensors                          # optional: accelerometer for shake
```

Then build and run:

```bash
npx react-native run-ios
npx react-native run-android
```

## TypeScript

Observability is fully typed. No additional setup required—types are included in the package.

```ts
import { Logger, LogLevel } from 'react-native-observability';

const logger: Logger = createLogger({
  /* ... */
});
```

## Troubleshooting

**I'm in Expo Go and want persistent logs:**  
Build a dev build (`npx expo run:ios`) so the native MMKV module is available. Expo Go (no native module) will gracefully fall back to in-memory storage.

**My Axios observer isn't working:**  
Make sure you call `observeAxios()` _after_ creating your `axios` instance, and pass the same instance:

```ts
const client = axios.create();
observeAxios(client, http); // ✓ correct
```

**I get an error importing MMKV:**  
New Architecture (MMKV v4) requires `react-native-nitro-modules`. See the [troubleshooting guide](./troubleshooting.md) for migration steps.

**The debug panel isn't appearing:**

- Make sure `DebugPanelProvider` wraps your app
- Check that `enabled={true}` (or `enabled={__DEV__}`)
- Try a programmatic open: `useDebugPanel().openPanel('logs')`

## Next Steps

- **[Quick Start](./quick-start.md)** — Get logging in 5 minutes
- **[Configuration](./configuration.md)** — Fine-tune logger and panel options
- **[Examples](../examples)** — See working integrations
