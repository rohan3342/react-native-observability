import { deepRedact, redactString, resolveRedactConfig } from '../../src/logger/redact/deepRedact';
import { looksLikeCreditCard } from '../../src/logger/redact/defaults';

/** Helper: resolve + redact in one call. */
function redact(
  ctx: Record<string, unknown>,
  cfg?: Parameters<typeof resolveRedactConfig>[0]
): Record<string, unknown> {
  return deepRedact(ctx, resolveRedactConfig(cfg));
}

describe('deepRedact — key matching', () => {
  it('redacts a top-level key', () => {
    expect(redact({ password: 'p', name: 'a' }, { keys: ['password'] })).toEqual({
      password: '[REDACTED]',
      name: 'a',
    });
  });

  it('redacts a nested key by dot path', () => {
    const out = redact(
      { user: { password: 'p', name: 'a' } },
      { keys: ['user.password'], valuePatterns: { email: false, jwt: false, creditCard: false } }
    );
    expect(out).toEqual({ user: { password: '[REDACTED]', name: 'a' } });
  });

  it('redacts at any depth with a `*` segment glob', () => {
    const out = redact(
      { a: { password: 'x' }, b: { c: { password: 'y' } } },
      { keys: ['*.password'], valuePatterns: { email: false, jwt: false, creditCard: false } }
    );
    expect(out).toEqual({ a: { password: '[REDACTED]' }, b: { c: { password: 'y' } } });
  });

  it('redacts at ANY depth with `**`', () => {
    const out = redact(
      { a: { password: 'x' }, b: { c: { password: 'y' } } },
      { keys: ['**.password'], valuePatterns: { email: false, jwt: false, creditCard: false } }
    );
    expect(out).toEqual({
      a: { password: '[REDACTED]' },
      b: { c: { password: '[REDACTED]' } },
    });
  });

  it('omit mode drops the key entirely', () => {
    const out = redact(
      { user: { ssn: '1', name: 'a' } },
      {
        keys: ['user.ssn'],
        mode: 'omit',
        valuePatterns: { email: false, jwt: false, creditCard: false },
      }
    );
    expect(out).toEqual({ user: { name: 'a' } });
  });

  it('uses a custom replacement token', () => {
    expect(
      redact(
        { secret: 'x' },
        {
          keys: ['secret'],
          replacement: '***',
          valuePatterns: { email: false, jwt: false, creditCard: false },
        }
      )
    ).toEqual({ secret: '***' });
  });
});

describe('deepRedact — default-on value patterns', () => {
  it('redacts emails by default, even nested, with no keys configured', () => {
    expect(redact({ a: { contact: 'reach me at bob@example.com please' } })).toEqual({
      a: { contact: 'reach me at [REDACTED] please' },
    });
  });

  it('redacts JWTs by default', () => {
    const jwt = 'eyJhbGc.eyJzdWIiOiIxIn0.sig123';
    expect(redact({ token: jwt })).toEqual({ token: '[REDACTED]' });
  });

  it('redacts Luhn-valid credit cards by default', () => {
    // 4242424242424242 is a Luhn-valid test card.
    expect(redact({ card: '4242 4242 4242 4242' })).toEqual({ card: '[REDACTED]' });
  });

  it('does NOT redact a non-Luhn long digit run (e.g. an order id)', () => {
    expect(redact({ orderId: '1234567890123456' })).toEqual({ orderId: '1234567890123456' });
  });

  it('can disable a single pattern', () => {
    expect(redact({ email: 'a@b.com' }, { valuePatterns: { email: false } })).toEqual({
      email: 'a@b.com',
    });
  });

  it('applies custom regexes', () => {
    expect(
      redact(
        { code: 'ABC-123' },
        { valuePatterns: { email: false, jwt: false, creditCard: false, custom: [/ABC-\d+/g] } }
      )
    ).toEqual({ code: '[REDACTED]' });
  });

  it('still matches emails with subdomains and multi-label domains', () => {
    expect(redact({ a: 'x ada@mail.corp.example.co.uk y' })).toEqual({
      a: 'x [REDACTED] y',
    });
  });
});

describe('EMAIL_PATTERN — ReDoS regression (SEC-1)', () => {
  // The unbounded domain `[\w-]+\.[\w.-]+` (and even an anchored-label rewrite)
  // backtracked superlinearly on a long @-run with no qualifying dot — tens of
  // seconds at 100k chars. The length-bounded pattern scrubs the same adversarial
  // input in a few hundred ms (a linear scan). The 1s ceiling is generous enough
  // to stay non-flaky on slow CI while still failing hard on the seconds-long
  // quadratic blow-up the bug produced.
  it('redacts a 100k-char @-string without catastrophic backtracking', () => {
    const evil = 'a'.repeat(100_000) + '@' + 'b'.repeat(100_000);
    const start = Date.now();
    const out = redactString(evil, resolveRedactConfig(undefined));
    expect(Date.now() - start).toBeLessThan(1000);
    // No qualifying dotted domain → nothing to redact → returned unchanged.
    expect(out).toBe(evil);
  });

  it('handles a long run of @-fragments without stalling', () => {
    const evil = ('user@nodot ' + 'z'.repeat(2000) + ' ').repeat(200);
    const start = Date.now();
    redactString(evil, resolveRedactConfig(undefined));
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe('redactString — bare-string scrubbing (SEC-2 / API-1)', () => {
  it('scrubs value patterns from a plain string', () => {
    const cfg = resolveRedactConfig(undefined);
    expect(redactString('auth failed for ada@example.com', cfg)).toBe('auth failed for [REDACTED]');
  });

  it('scrubs a JWT in a string', () => {
    const cfg = resolveRedactConfig(undefined);
    expect(redactString('token=eyJhbGc.eyJzdWIiOiIxIn0.sig123 end', cfg)).toBe(
      'token=[REDACTED] end'
    );
  });

  it('returns the input unchanged on a no-op config (same reference)', () => {
    const cfg = resolveRedactConfig({
      valuePatterns: { email: false, jwt: false, creditCard: false },
    });
    const input = 'ada@example.com';
    expect(redactString(input, cfg)).toBe(input);
  });

  it('honours a custom replacement token', () => {
    const cfg = resolveRedactConfig({ replacement: '***' });
    expect(redactString('mail ada@example.com', cfg)).toBe('mail ***');
  });
});

describe('deepRedact — safety', () => {
  it('does not mutate the input', () => {
    const input = { user: { email: 'a@b.com' } };
    redact(input);
    expect(input.user.email).toBe('a@b.com');
  });

  it('bounds recursion at maxDepth', () => {
    const deep = { l1: { l2: { l3: { l4: { l5: { l6: { email: 'a@b.com' } } } } } } };
    const out = redact(deep, { maxDepth: 2 }) as Record<string, unknown>;
    // At depth 2 the descent stops and the subtree is summarized.
    expect(JSON.stringify(out)).toContain('[Object]');
  });

  it('handles circular references without throwing', () => {
    const a: Record<string, unknown> = { name: 'a' };
    a['self'] = a;
    expect(() => redact(a)).not.toThrow();
    const out = redact(a);
    expect(out['self']).toBe('[Circular]');
  });

  it('is a no-op (returns same reference) when nothing is configured to run', () => {
    const input = { plain: 'value' };
    const out = deepRedact(
      input,
      resolveRedactConfig({ valuePatterns: { email: false, jwt: false, creditCard: false } })
    );
    expect(out).toBe(input);
  });

  it('redacts inside arrays', () => {
    expect(redact({ list: ['a@b.com', 'safe'] })).toEqual({
      list: ['[REDACTED]', 'safe'],
    });
  });
});

describe('looksLikeCreditCard', () => {
  it('accepts a Luhn-valid 16-digit number with separators', () => {
    expect(looksLikeCreditCard('4242-4242-4242-4242')).toBe(true);
  });
  it('rejects a non-Luhn run', () => {
    expect(looksLikeCreditCard('1234567890123456')).toBe(false);
  });
  it('rejects runs shorter than 13 digits', () => {
    expect(looksLikeCreditCard('411111111111')).toBe(false);
  });
});
