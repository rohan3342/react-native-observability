# FAQ

Frequently asked questions about react-native-observability.

## Core Concepts

**Q: Why provider-agnostic? Isn't that more work?**

A: Provider-agnostic means you're not locked into a vendor. Today you use Sentry, tomorrow you switch to Datadog without rewriting instrumentation. Or use Observability locally-only with zero backend. It's actually less work long-term.

**Q: How is Observability different from console.log()?**

A: `console.log` is unstructured. Observability gives you:

- Structured context (namespace, level, metadata)
- Multiple transports (console, memory, disk)
- Automatic redaction (PII protection)
- Remote adapters (Sentry, Datadog, etc.)
- Error isolation (broken backends don't crash your app)
- On-device debug panel

**Q: Can I use Observability in production?**

A: Yes. Most features work in production. The debug panel is optional—disable it with `enabled={!isProduction}`. Redaction runs automatically to protect PII.

**Q: Do I have to use all the features?**

A: No. Use just the logger. Use just error boundaries. Use just the panel. Every feature is opt-in.

## Installation & Setup

**Q: Do I need react-native-mmkv?**

A: No. It's optional. Without it, logs stay in memory (survive for the session) but don't persist across restarts. Use MMKV if you need crash trails and session history.

**Q: Why does MMKV require the New Architecture?**

A: MMKV v4+ uses Nitro modules, which require React Native's New Architecture. If you're on the old architecture, stay on MMKV v3 (if available) or skip persistence.

**Q: How do I set up Sentry?**

A: Wire it via a custom adapter:

```ts
import { createCustomAdapter } from 'react-native-observability/adapters';
import * as Sentry from '@sentry/react-native';

const sentryAdapter = createCustomAdapter({
  name: 'sentry',
  captureException: (err, ctx) => Sentry.captureException(err, { extra: ctx }),
});

const logger = createLogger({ adapters: [sentryAdapter] });
```

That's it. No SDK integration needed, just the adapter.

**Q: Can I use Observability without TypeScript?**

A: Yes. Observability is written in TypeScript, but types are optional. JavaScript works fine.

## Logging & Debugging

**Q: Why are my logs disappearing?**

A: Most common causes:

1. MemoryTransport not in transports array
2. LogLevel too high (use `LogLevel.DEBUG` to see everything)
3. DebugPanelProvider not wrapping your app

**Q: How do I log large objects?**

A: Selectively. Don't log entire objects—extract relevant fields:

```ts
// ✓ Good
logger.info('User data', { id: user.id, email: user.email, role: user.role });

// ✗ Poor
logger.info('User data', user); // entire object, bloats panel
```

**Q: Can I disable logging in production?**

A: Yes. Wrap logging in `__DEV__`:

```ts
if (__DEV__) {
  logger.info('Debug info');
}
```

Or use conditional setup:

```ts
const logger = createLogger({
  level: __DEV__ ? LogLevel.DEBUG : LogLevel.WARN,
  transports: __DEV__ ? [memTransport] : [],
});
```

**Q: How do I search logs?**

A: Open the debug panel's Logs tab, type in the search box. Searches message, context keys, and namespace.

## Network & HTTP

**Q: Why isn't fetch being captured?**

A: Did you call `observeFetch(http)`? It must be called before any fetch requests.

**Q: Can I mock network requests?**

A: Yes. Create a mock engine and pass it to `observeFetch()` and `observeAxios()`:

```ts
const mock = createMockEngine({
  rules: [
    { id: 'mock', match: { url: '/users' }, action: { type: 'respond', status: 200, body: [...] } },
  ],
  allowInProduction: true,  // for testing
});

observeFetch(http, { mock });
```

**Q: Are request/response bodies captured?**

A: Request bodies are captured only if they're strings (common for JSON). Response bodies are captured only if content-type matches your filter (default: JSON). This prevents consuming streams.

**Q: Are headers redacted?**

A: Yes. Authorization, Cookie, X-API-Key, and custom keys in your redaction config are redacted to `[REDACTED]`.

## Error Handling

**Q: Do error boundaries prevent all errors?**

A: No. Error boundaries only catch **render errors** (errors thrown during component render). Errors in event handlers, timers, async code, etc. need `try/catch` or `installGlobalErrorHandler()`.

```ts
// Render error — caught by boundary
function Component() {
  throw new Error('Boom!');  // caught by ScreenErrorBoundary
}

// Event handler error — NOT caught by boundary
<Button onPress={() => { throw new Error('Boom!'); }} />  // not caught

// Install global handler to catch this
installGlobalErrorHandler(logger);
```

**Q: How do I test error boundaries?**

A: Use a throwing component:

```ts
function BombComponent() {
  throw new Error('Test error');
}

render(
  <AppErrorBoundary logger={logger} FallbackComponent={Fallback}>
    <BombComponent />
  </AppErrorBoundary>
);
```

## Persistence & Sessions

**Q: What happens if the app crashes?**

A: If you're using SessionManager + MMKV, the prior session is marked with `crashed: true` on next launch. You can detect and handle this.

**Q: Can I encrypt persisted logs?**

A: Yes. Pass `encryption` to MMKVTransport:

```ts
new MMKVTransport({
  encryption: {
    encryptKey: data => myEncrypt(data),
    decryptKey: encrypted => myDecrypt(encrypted),
  },
});
```

**Q: How much disk space does persistence use?**

A: Set a per-session quota:

```ts
new MMKVTransport({ maxBytesPerSession: 1_000_000 }); // 1 MB per session
```

Oldest entries are dropped when quota is exceeded.

## Debug Panel

**Q: Can I customize the panel's appearance?**

A: Yes. Theme, icons, branding, and spacing are all customizable.

```ts
import { themePresets } from 'react-native-observability/panel';

<DebugPanelProvider
  theme={themePresets.midnight}  // use preset
  branding={{ title: 'My App' }}
  iconSet={customIcons}
>
```

**Q: Does the panel impact performance?**

A: Minimally in dev. In production, disable it with `enabled={!isProduction}`. When disabled, the provider doesn't mount and has zero overhead.

**Q: Can I share panel data?**

A: Yes. Logs and network entries can be exported from the panel (Settings tab → Export). You can also programmatically read stores:

```ts
const entries = memoryTransport.entries;
const networkEntries = http.store.entries;
```

## PII & Security

**Q: Is my sensitive data protected?**

A: Yes. Redaction is applied in the write path, before transports/adapters see data. Keys (`password`, `token`, etc.) and values (email patterns, JWT, credit cards) are automatically redacted.

**Q: Can I add custom redaction patterns?**

A: Yes:

```ts
const logger = createLogger({
  redact: {
    keys: ['custom_field'],
    matchers: [/my-secret-pattern/],
  },
});
```

**Q: Does redaction protect console.log?**

A: No. `console.log` bypasses redaction (it writes directly to logcat). Use `installConsoleProxy()` to route `console.*` through the logger:

```ts
installConsoleProxy(logger);
console.log('Data:', { password: 'secret' }); // password is redacted
```

## Performance & Scaling

**Q: Will logging slow down my app?**

A: Logger is designed to be fast. Most entries log in <0.5ms. For high-volume logging (>10k entries/min), use sampling or rate-limiting.

**Q: How do I tune for production?**

A: Lower the log level and apply sampling:

```ts
const logger = createLogger({
  level: LogLevel.WARN, // only warnings and errors
  sampling: {
    [LogLevel.WARN]: 0.5, // log 50% of warnings
  },
  rateLimit: { entriesPerSecond: 1000 },
});
```

**Q: Should I persist all logs?**

A: No. Use `minLevel` to persist only WARN and above:

```ts
new MMKVTransport({ minLevel: LogLevel.WARN });
```

## Best Practices

**Q: When should I use debug vs. info vs. warn vs. error?**

A:

- **DEBUG** — verbose tracing (dev only)
- **INFO** — general app events ("User signed in")
- **WARN** — recoverable issues ("API slow")
- **ERROR** — actual errors (exceptions, failures)
- **FATAL** — rarely used

**Q: Should I log on every screen mount?**

A: Yes. It helps with debugging:

```ts
useEffect(() => {
  logger.debug('Screen mounted', { screen: 'HomeScreen' });
  return () => logger.debug('Screen unmounted');
}, []);
```

**Q: Is it safe to share logs publicly?**

A: Only after verifying redaction. Inspect logs in the panel, check that passwords/tokens are `[REDACTED]`, then it's safe.

## Next Steps

- **[Troubleshooting](./troubleshooting.md)** — Common issues
- **[Quick Start](./quick-start.md)** — Get started in 5 minutes
- **[Examples](../examples)** — Working code
