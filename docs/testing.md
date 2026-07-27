# Testing

Testing patterns for Observability.

## Logger in Tests

### Create a Test Logger

```ts
import { createLogger, MemoryTransport, LogLevel } from 'react-native-observability';

beforeEach(() => {
  testTransport = new MemoryTransport();
  testLogger = createLogger({
    namespace: 'test',
    level: LogLevel.DEBUG,
    transports: [testTransport],
  });
});

afterEach(() => {
  testTransport.clear();
});
```

### Assert Log Entries

```ts
it('logs user login', () => {
  handleLogin('alice');

  const entry = testTransport.entries[0];
  expect(entry.message).toBe('User logged in');
  expect(entry.context?.username).toBe('alice');
  expect(entry.level).toBe(LogLevel.INFO);
});
```

### Assert Redaction

```ts
it('redacts passwords', () => {
  testLogger = createLogger({
    transports: [testTransport],
    redact: { keys: ['password'] },
  });

  testLogger.info('Login', { username: 'alice', password: 'secret' });

  const entry = testTransport.entries[0];
  expect(entry.context?.password).toBe('[REDACTED]');
  expect(entry.context?.username).toBe('alice');
});
```

### Assert Error Capture

```ts
it('captures and logs errors', () => {
  const error = new Error('Something failed');
  testLogger.error('Operation failed', error, { retrying: true });

  const entry = testTransport.entries[0];
  expect(entry.level).toBe(LogLevel.ERROR);
  expect(entry.error?.message).toBe('Something failed');
  expect(entry.context?.retrying).toBe(true);
});
```

## Error Boundary Testing

### Test AppErrorBoundary

```ts
import { AppErrorBoundary } from 'react-native-observability';

function BombComponent() {
  throw new Error('Boom!');
}

it('catches render errors', () => {
  const FallbackComponent = ({ error }) => (
    <Text>Error: {error.message}</Text>
  );

  const { getByText } = render(
    <AppErrorBoundary logger={testLogger} FallbackComponent={FallbackComponent}>
      <BombComponent />
    </AppErrorBoundary>
  );

  expect(getByText(/Error: Boom!/)).toBeTruthy();
});
```

### Test ScreenErrorBoundary

```ts
import { ScreenErrorBoundary } from 'react-native-observability';

it('isolates screen-level errors', () => {
  const { getByText, queryByText } = render(
    <ScreenErrorBoundary
      logger={testLogger}
      FallbackComponent={({ error }) => <Text>{error.message}</Text>}
      isolate
    >
      <BombComponent />
    </ScreenErrorBoundary>
  );

  expect(getByText('Boom!')).toBeTruthy();
});
```

## HTTP Observer Testing

### Mock Network Requests

```ts
import { createHttpObserver, createMockEngine } from 'react-native-observability';

it('intercepts fetch with mock engine', async () => {
  const mockEngine = createMockEngine({
    rules: [
      {
        id: 'mock-users',
        enabled: true,
        match: { url: '/users', method: 'GET' },
        action: { type: 'respond', status: 200, body: [{ id: 1, name: 'Alice' }] },
      },
    ],
    allowInProduction: true, // for tests
  });

  observeFetch(http, { mock: mockEngine });

  const response = await fetch('https://api.example.com/users');
  const data = await response.json();

  expect(response.status).toBe(200);
  expect(data).toEqual([{ id: 1, name: 'Alice' }]);
});
```

### Inject Faults

```ts
it('handles network faults', async () => {
  const mockEngine = createMockEngine({
    rules: [
      {
        id: 'flaky-api',
        enabled: true,
        match: { url: '/api' },
        action: { type: 'fault', kind: 'networkError' },
      },
    ],
    allowInProduction: true,
  });

  observeFetch(http, { mock: mockEngine });

  await expect(fetch('https://api.example.com/api')).rejects.toThrow();
});
```

### Assert HTTP Entries

```ts
it('captures network entries', async () => {
  observeFetch(http);

  await fetch('https://api.example.com/users', {
    method: 'GET',
    headers: { Authorization: 'Bearer token123' },
  });

  const entry = http.store.entries[0];
  expect(entry.url).toBe('https://api.example.com/users');
  expect(entry.method).toBe('GET');
  expect(entry.status).toBe(200);
  expect(entry.requestHeaders?.Authorization).toBe('[REDACTED]'); // redacted
});
```

## Screen Tracking Testing

```ts
import { trackScreen, createScreenProvider } from 'react-native-observability';

it('attributes logs to active screen', () => {
  const screenProvider = createScreenProvider();
  const testLogger = createLogger({
    screenProvider,
    transports: [testTransport],
  });

  trackScreen('HomeScreen', {});
  testLogger.info('Test message');

  const entry = testTransport.entries[0];
  expect(entry.screen).toBe('HomeScreen');
});
```

## Adapter Testing

```ts
const mockBackend = {
  captureException: jest.fn(),
  setUser: jest.fn(),
};

const adapter = createCustomAdapter({
  name: 'test',
  captureException: (err, ctx) => mockBackend.captureException(err, ctx),
  setUser: user => mockBackend.setUser(user),
});

it('forwards errors to adapter', () => {
  const logger = createLogger({
    adapters: [adapter],
    transports: [testTransport],
  });

  logger.error('Test error', new Error('Boom'));

  expect(mockBackend.captureException).toHaveBeenCalledWith(
    expect.objectContaining({ message: 'Boom' }),
    expect.any(Object)
  );
});
```

## Integration Testing

```ts
it('full logging flow', async () => {
  const memTransport = new MemoryTransport();
  const mockBackend = { captureException: jest.fn() };

  const adapter = createCustomAdapter({
    name: 'test',
    captureException: (err, ctx) => mockBackend.captureException(err, ctx),
  });

  const logger = createLogger({
    namespace: 'app',
    transports: [memTransport],
    adapters: [adapter],
    redact: { keys: ['password'] },
  });

  logger.info('User login', { username: 'alice', password: 'secret' });
  logger.error('Auth failed', new Error('Invalid token'));

  // Verify transports
  expect(memTransport.entries).toHaveLength(2);
  expect(memTransport.entries[0].context?.password).toBe('[REDACTED]');

  // Verify adapters
  expect(mockBackend.captureException).toHaveBeenCalled();
});
```

## Testing Best Practices

### Use Fresh Loggers per Test

```ts
// ✓ Good
beforeEach(() => {
  testTransport = new MemoryTransport();
  testLogger = createLogger({ transports: [testTransport] });
});

// ✗ Bad — loggers shared across tests
const sharedLogger = createLogger({ transports: [testTransport] });

describe('...', () => {
  it('test1', () => {
    sharedLogger.info('test1');
  });
  it('test2', () => {
    sharedLogger.info('test2');
  }); // polluted by test1
});
```

### Mock External Services

```ts
// ✓ Good
const mockBackend = { captureException: jest.fn() };
const adapter = createCustomAdapter({
  captureException: err => mockBackend.captureException(err),
});

// ✗ Bad — real HTTP call in test
const adapter = createCustomAdapter({
  captureException: err => {
    fetch('https://real-backend.com/errors', {
      /* ... */
    });
  },
});
```

### Test Error Handling

```ts
// ✓ Good
it('handles adapter errors gracefully', () => {
  const badAdapter = createCustomAdapter({
    captureException: () => {
      throw new Error('Adapter broken');
    },
  });
  const logger = createLogger({ adapters: [badAdapter] });

  expect(() => {
    logger.error('Test', new Error('Real error'));
  }).not.toThrow(); // doesn't crash
});

// ✗ Bad — assume adapter always works
```

## Next Steps

- **[Troubleshooting](./troubleshooting.md)** — Common issues
- **[HTTP Observer](./http-observer.md#network-mocking)** — Mock engine reference
