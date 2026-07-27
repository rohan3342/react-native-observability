# PII Redaction

Deep dive into Observability's redaction system for protecting sensitive data.

## Overview

Redaction is applied automatically in the write path, before any transport or adapter sees data. Protects PII without changing application code.

```ts
const logger = createLogger({
  redact: {
    keys: ['password', 'token', 'apiKey'],
    matchers: [/\b\d{3}-\d{2}-\d{4}\b/],  // SSN
  },
  transports: [...],
});

logger.info('Login', { email: 'user@example.com', password: 'secret123' });
// password is redacted
```

## Key-Path Matching

Redact by object key path:

```ts
const logger = createLogger({
  redact: {
    keys: ['password', 'token', 'email'],
  },
});

logger.info('User data', {
  user: { email: 'user@example.com', password: 'secret' },
  api: { token: 'abc123' },
});

// Result:
// user.email: '[REDACTED]' (matched by key)
// user.password: '[REDACTED]' (matched by key)
// api.token: '[REDACTED]' (matched by key)
```

### Recursive Matching

Use `**` to match at any depth:

```ts
redact: {
  keys: ['password', 'user.**.email'],  // match email anywhere under user
}

// Matches:
// obj.password
// obj.user.email
// obj.user.profile.email
// obj.user.alternate.email
// obj.user.nested.deep.email
```

### Deep Objects

Key matching is recursive by default:

```ts
redact: {
  keys: ['secret'],
}

logger.info('Data', {
  api: { secret: 'hidden', nested: { secret: 'also hidden' } },
});

// Both secrets are redacted
```

## Value-Side Patterns

Redact by regex pattern on the value:

```ts
const logger = createLogger({
  redact: {
    matchers: [
      /\b\d{3}-\d{2}-\d{4}\b/, // SSN: 123-45-6789
      /\b\d{16}\b/, // credit card: 1234567890123456
      /\b[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}\b/i, // email
    ],
  },
});

logger.info('Payment', {
  ssn: '123-45-6789',
  card: '1234567890123456',
  email: 'user@example.com',
});

// All matched values are redacted
```

## Default Redaction

By default, these are always redacted:

**Keys:**

- password, passwd, pwd
- token, accessToken, refreshToken, authToken
- secret, apiKey, apiSecret, key
- auth, Authorization
- sessionId, sid, jti

**Headers:**

- Authorization
- Cookie
- X-API-Key
- X-Token
- X-Auth-Token

**Value patterns:**

- Email: `user@example.com`
- JWT: `eyJh...` (starts with `eyJ`)
- Luhn-checked credit cards: 13–19 digit numbers
- SSN: `123-45-6789` (9 digits with hyphens)

Disable defaults:

```ts
const logger = createLogger({
  redact: {
    redactDefaultKeys: false, // disable key redaction
    redactDefaultHeaders: false, // disable header redaction
  },
});
```

## Redaction Modes

### Replace (Default)

Value is replaced with `[REDACTED]`:

```ts
redact: {
  keys: ['password'],
  mode: 'replace',  // default
}

// { user: { username: 'alice', password: '[REDACTED]' } }
```

### Omit

Key is removed entirely:

```ts
redact: {
  keys: ['password'],
  mode: 'omit',
}

// { user: { username: 'alice' } }  // password key gone
```

Use `omit` for highly sensitive fields you don't want in logs at all.

## Error Redaction

Errors are redacted too:

```ts
logger.error('Operation failed', new Error('Invalid token: abc123'), {
  token: 'abc123',
});

// Error message and stack are redacted
// token value is redacted
```

## HTTP Observer Redaction

HTTP redaction is separate from logger redaction:

```ts
const http = createHttpObserver({
  redact: {
    redactDefaultHeaders: true,
    headerKeys: ['X-API-Key'], // extra headers
    redactDefaultBodyKeys: true,
    bodyKeys: ['secret'], // extra body keys
  },
});
```

Redacted values appear as `[REDACTED]` in the Network tab.

## Testing Redaction

Verify redaction works:

```ts
it('redacts sensitive data', () => {
  const memTransport = new MemoryTransport();
  const logger = createLogger({
    redact: { keys: ['password'] },
    transports: [memTransport],
  });

  logger.info('Login', { username: 'alice', password: 'secret123' });

  const entry = memTransport.entries[0];
  expect(entry.context?.password).toBe('[REDACTED]');
  expect(entry.context?.username).toBe('alice');
});
```

## Best Practices

### Redact Early

Redaction is applied in the write path, so redacted values never reach transports/adapters. Don't worry about accidental PII leaks to console.

### Use Both Key and Value Matching

Key matching catches structured data (`user.email`). Value matching catches unstructured strings:

```ts
redact: {
  keys: ['email', 'ssn'],
  matchers: [
    /\b\d{3}-\d{2}-\d{4}\b/,  // catch SSN in strings
  ],
}
```

### Disable `__DEV__` If Needed

In development, you might want to see unredacted data for debugging:

```ts
const logger = createLogger({
  redact: __DEV__ ? { keys: [] } : { keys: ['password', 'token'] },
  transports: [...],
});
```

### Document Custom Patterns

Document custom redaction patterns for your team:

```ts
// Custom patterns for our app:
// - Internal user IDs: /^uid_[a-z0-9]{16}$/
// - API keys: /^sk_[a-z0-9]{32}$/
// - JWT: /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/
const logger = createLogger({
  redact: {
    matchers: [
      /^uid_[a-z0-9]{16}$/,
      /^sk_[a-z0-9]{32}$/,
      /^eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+$/,
    ],
  },
});
```

### Audit Redaction

Periodically check that sensitive data is redacted:

```ts
// In your app's testing suite:
import { logger } from './logger';
import { MemoryTransport } from 'react-native-observability';

const memTransport = logger.transports.find(t => t instanceof MemoryTransport);
const entries = memTransport.entries;

entries.forEach(entry => {
  const json = JSON.stringify(entry);
  expect(json).not.toMatch(/password|token|secret|apiKey/i);
});
```

## Limitations

Redaction does NOT protect against:

- **Serialization errors** — if an object's `toString()` leaks PII, it won't be caught
- **Error stack traces** — if a stack trace contains a URL with query params (API keys), those aren't redacted
- **Native logs** — logs from native modules (Kotlin, Swift, Objective-C) bypass Observability's redaction

## Next Steps

- **[Logger Guide](./logger-guide.md#redaction)** — Redaction in the logger
- **[HTTP Observer](./http-observer.md#redaction)** — HTTP redaction
- **[Security Audit](./troubleshooting.md)** — Security best practices
