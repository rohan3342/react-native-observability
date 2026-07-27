# Network Rules

Network Rules let you intercept HTTP requests on-device — no proxy, no server changes, no app rebuild. You can return canned responses, force error codes, inject failures, add headers, or redirect traffic. Rules toggle on/off instantly while the app is running.

---

## How It Works

The mock engine sits between your app code and the network as a two-phase interceptor. The observer shim consults it before every request and after every response.

```mermaid
flowchart TD
  AppCode["Your App Code\nfetch / axios call"] --> Shim["Observer Shim\nobserveFetch · observeAxios"]
  Shim --> RequestPhase{"Request Phase\nengine.resolve()"}

  RequestPhase -->|"block"| Reject["Network error\nno round-trip"]
  RequestPhase -->|"respond"| Canned["Canned response\nno round-trip"]
  RequestPhase -->|"fault"| Faulted["Timeout or disconnect\nno round-trip"]
  RequestPhase -->|"modifyRequest"| Mutated["Mutated request\nsent to server"]
  RequestPhase -->|"no match"| Original["Original request\nsent to server"]

  Mutated --> RealServer["Real Server"]
  Original --> RealServer

  RealServer --> ResponsePhase{"Response Phase\nengine.resolveResponse()"}

  ResponsePhase -->|"modifyResponse rule"| Transformed["Transformed response\nstatus · headers · body"]
  ResponsePhase -->|"no match"| Unchanged["Real response\nunchanged"]

  Reject --> AppCode
  Canned --> AppCode
  Faulted --> AppCode
  Transformed --> AppCode
  Unchanged --> AppCode
```

**Request phase** runs before any network call. A matching `block`, `respond`, or `fault` rule short-circuits the request — the real server is never contacted. A `modifyRequest` rule mutates the outgoing call then lets it through.

**Response phase** runs after the real server responds. A matching `modifyResponse` rule transforms the status, headers, or body before your app code sees it.

Rules are evaluated in order. The first matching, enabled rule wins. A `modifyResponse` rule is skipped in the request phase and only evaluated in the response phase.

---

## Setup

Wire a mock engine and pass it to both the HTTP observer and the debug panel:

```ts
// mock.ts
import { createMockEngine } from 'react-native-observability';

export const mock = createMockEngine();
```

```ts
// observeNetwork.ts
import { observeFetch } from 'react-native-observability/observers/fetch';
import { observeAxios } from 'react-native-observability/observers/axios';
import { mock } from './mock';

observeFetch(http, { mock });
observeAxios(client, http, { mock });
```

```tsx
// App.tsx
import { DebugPanelProvider } from 'react-native-observability/panel';
import { mock } from './mock';

<DebugPanelProvider mockEngine={mock}>
  <YourApp />
</DebugPanelProvider>
```

Open the panel → **Network** tab → **Rules**. From here you can add, edit, toggle, and delete rules without restarting the app.

---

## Adding a Rule in the Panel

```mermaid
flowchart TD
  OpenPanel["Open debug panel"] --> NetTab["Network tab"]
  NetTab --> RulesTab["Rules sub-tab"]

  RulesTab --> AddBtn["Tap + Add rule"]
  NetTab -->|"tap any request → Mock this"| MockThis["Editor opens\npre-filled from captured request"]

  AddBtn --> MatchCard
  MockThis --> MatchCard

  subgraph RuleEditor["Rule Details Editor"]
    MatchCard["Match\nMethod chips + URL pattern + Test Rule"]
    ActionCard["Action\nRespond · Modify Request · Modify Response · Block · Fault"]
    ConfigCard["Configuration\nFields for the selected action only"]
    AdvancedCard["Advanced  (collapsed)\nURL overrides · delay · everyN"]
  end

  MatchCard --> ActionCard
  ActionCard --> ConfigCard
  ConfigCard --> AdvancedCard
  AdvancedCard --> SaveBtn["Tap Save rule"]
  SaveBtn --> Live["Rule is active\ntakes effect on next matching request"]
```

1. Open the debug panel and switch to the **Network → Rules** tab.
2. Tap **+ Add rule**.
3. The **Rule Details** editor opens with four sections:

   | Section | What to fill in |
   |---|---|
   | **Match** | Method chips (ANY / GET / POST …) + URL pattern |
   | **Action** | What to do: Respond, Modify Request, Modify Response, Block, or Fault |
   | **Configuration** | Fields for the selected action (status, body, headers, delay) |
   | **Advanced** | Collapsed — request overrides, delay, intermittency |

4. Tap **Save rule**. The rule activates immediately.

> **Tip — "Mock this":** In the **Requests** tab, tap any captured request, then tap **Mock this**. The editor opens pre-filled with that request's method, URL, status code, and response body — the fastest way to start mocking a real endpoint.

---

## URL Pattern Quick Reference

The pattern you type in the **Match** section is interpreted as:

| Pattern | Interpretation | Example | Matches |
|---|---|---|---|
| *(empty)* | Every URL | — | Every request |
| `/api/orders` | Case-insensitive substring | `/api/orders` | `https://api.example.com/api/orders/1`, `https://staging.example.com/api/orders` |
| `*` | Glob — any single-segment run | `*.json` | `config.json` but **not** `api/config.json` |
| `**` | Glob — crosses path segments | `**/ads/**` | `cdn.example.com/ads/banner.png`, `api.example.com/v2/ads/track` |
| `/api/users/:id` | Literal substring | `/api/users/:id` | Any URL containing that exact string |

The live hint under the URL field tells you which mode is active as you type.

```mermaid
flowchart TD
  PatternInput["URL pattern you type"] --> IsEmpty{"Empty?"}
  IsEmpty -->|"yes"| MatchAll["Matches every URL\nno filtering applied"]
  IsEmpty -->|"no"| HasStar{"Contains an asterisk?"}
  HasStar -->|"no"| Substring["Substring match\ncase-insensitive\n/api/orders matches any URL containing that text"]
  HasStar -->|"yes"| HasDouble{"Contains double asterisk?"}
  HasDouble -->|"yes"| GlobCross["Glob — ** crosses path segments\n**/ads/** matches cdn.example.com/v2/ads/banner.png"]
  HasDouble -->|"no"| GlobSingle["Glob — * stays within one segment\n*.json matches config.json but not api/config.json"]
```

---

## Recipes

The table below shows which phase each action runs in and whether a real network call is made.

```mermaid
flowchart LR
  subgraph requestPhase["Request Phase  (before any network call)"]
    direction TB
    blockAction["Block\nrejects instantly — no server call"]
    respondAction["Respond\ncanned status + body — no server call"]
    modreqAction["Modify Request\nmutate method / URL / headers / body\nthen proceed to server"]
    faultAction["Fault\ntimeout or disconnect — no server call"]
  end

  subgraph responsePhase["Response Phase  (after real server responds)"]
    direction TB
    modresAction["Modify Response\ntransform real status / headers / body\nbefore app code sees the result"]
  end

  AppNode["Your App"] -->|"outgoing request"| requestPhase
  requestPhase -->|"block · respond · fault"| AppNode
  requestPhase -->|"modifyRequest or no match"| ServerNode["Real Server"]
  ServerNode --> responsePhase
  responsePhase -->|"transformed or unchanged"| AppNode
```

### 1. Return a fake response for any path under `/api`

Use case: stub the entire backend during a demo or offline development.

**Match**
- Method: **ANY**
- URL: `/api`

**Action → Respond**
- Status: `200`
- Body:
  ```json
  { "ok": true, "data": [] }
  ```

Every request whose URL contains `/api` now gets this instant response — no network call is made.

---

### 2. Force a specific endpoint to return 404

Use case: test how the app handles a missing resource.

**Match**
- Method: **GET**
- URL: `/api/orders/`

**Action → Respond**
- Status: `404`
- Body:
  ```json
  { "error": "Not found", "code": "ORDER_NOT_FOUND" }
  ```

---

### 3. Simulate a server error (500)

Use case: verify your error boundary or retry logic triggers correctly.

**Match**
- Method: **ANY**
- URL: `/api/checkout`

**Action → Respond**
- Status: `500`
- Body:
  ```json
  { "error": "Internal server error", "retryable": true }
  ```
- Delay: `200` *(realistic server latency before the error)*

---

### 4. Return a 400 Bad Request with a validation message

Use case: test form validation error states without hitting the real API.

**Match**
- Method: **POST**
- URL: `/api/users`

**Action → Respond**
- Status: `400`
- Body:
  ```json
  {
    "error": "Validation failed",
    "fields": {
      "email": "Email is already taken",
      "username": "Must be at least 3 characters"
    }
  }
  ```

---

### 5. Change what a real response looks like (Modify Response)

Use case: test an edge-case response shape without changing the server. The real request goes out; the response is transformed before the app sees it.

**Match**
- Method: **GET**
- URL: `/api/profile`

**Action → Modify Response**
- Override Status Code: *(leave blank to keep the real status)*
- Set Headers: `X-Mock: 1`
- Replace Response Body:
  ```json
  {
    "id": 42,
    "name": "Test User",
    "plan": "enterprise",
    "features": ["all"]
  }
  ```

---

### 6. Inject an auth header into every outgoing request

Use case: add a token to all requests without touching app code — useful when testing a staging environment from a device where you can't log in normally.

**Match**
- Method: **ANY**
- URL: `/api`

**Action → Modify Request**
- Add / Set Headers:
  ```
  Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.test-token
  X-Debug-Source: observability
  ```

The app's own Authorization header is overwritten; the real request goes to the server with the injected token.

---

### 7. Block all requests to an analytics or ad domain

Use case: silence noisy third-party traffic so the Network tab stays focused on your own API calls.

**Match**
- Method: **ANY**
- URL: `**/analytics/**`

**Action → Block**

Every matching request is rejected immediately with a synthetic network error. No data is sent.

For multiple patterns, add one rule per domain:
- `**/segment.io/**`
- `**/amplitude/**`
- `**/doubleclick.net/**`

---

### 8. Simulate a slow network (high latency)

Use case: reproduce a 3G-like experience to check loading states and skeleton screens.

**Match**
- Method: **ANY**
- URL: `/api`

**Action → Respond**
- Status: `200`
- Body: *(your normal fixture JSON)*
- Delay: `3000` *(3 seconds)*

---

### 9. Simulate a network timeout

Use case: check that request-timeout logic and the UI's "retry" button work.

**Match**
- Method: **ANY**
- URL: `/api/payments`

**Action → Fault**
- Fault Type: **Timeout**
- Timeout Delay (ms): `30000`

The request hangs for 30 seconds then rejects. Open **Advanced** and set "Inject every Nth match" to `2` to let every other request succeed — useful for testing retry back-off.

---

### 10. Simulate an intermittent failure (flaky API)

Use case: stress-test retry logic against a service that fails one in three times.

**Match**
- Method: **ANY**
- URL: `/api/feed`

**Action → Fault**
- Fault Type: **Disconnect**

**Advanced**
- Inject every Nth match: `3`

Every third request to `/api/feed` gets a network error; the rest go through normally.

---

### 11. Redirect a request to a different URL (Modify Request — Advanced)

Use case: point the app at a staging server for one endpoint without changing the build.

**Match**
- Method: **GET**
- URL: `/api/v1/products`

**Action → Modify Request**
- *(no header or body changes needed)*

**Advanced**
- Override URL: `https://staging.example.com/api/v1/products`

---

### 12. Override the response for a specific HTTP method only

Use case: GET succeeds but POST should fail — test the "submit failed" state without breaking reads.

**Rule A**
- Match: **POST** + `/api/comments`
- Action → Respond: Status `503`, Body `{ "error": "Service unavailable" }`

**Rule B**
- Match: **GET** + `/api/comments`
- *(no rule — real GET requests go through)*

Rules are matched in order. A request that matches Rule A stops there; GET requests skip it.

---

## Code-defined Rules

Rules can be defined in code at engine creation time. This is useful for pre-seeding a set of scenarios in development builds:

```ts
import { createMockEngine } from 'react-native-observability';

export const mock = createMockEngine({
  rules: [
    // Scenario: empty orders list
    {
      id: 'empty-orders',
      enabled: false, // toggle on in the panel when needed
      match: { method: 'GET', url: '/api/orders' },
      action: {
        type: 'respond',
        status: 200,
        body: { orders: [], total: 0 },
      },
    },

    // Scenario: checkout fails with 400 validation error
    {
      id: 'checkout-400',
      enabled: false,
      match: { method: 'POST', url: '/api/checkout' },
      action: {
        type: 'respond',
        status: 400,
        body: { error: 'Card declined', code: 'PAYMENT_FAILED' },
        delayMs: 300,
      },
    },

    // Scenario: server is down
    {
      id: 'server-500',
      enabled: false,
      match: { url: '/api' },
      action: {
        type: 'respond',
        status: 500,
        body: { error: 'Internal server error' },
      },
    },

    // Scenario: flaky feed — fails every 3rd call
    {
      id: 'flaky-feed',
      enabled: false,
      match: { url: '/api/feed' },
      action: { type: 'fault', kind: 'networkError', everyN: 3 },
    },

    // Scenario: block all ad traffic
    {
      id: 'block-ads',
      enabled: true, // always on during development
      match: { url: '**/ads/**' },
      action: { type: 'block' },
    },
  ],
});
```

Each rule has `enabled: false` — toggle them live in the **Rules** tab without a rebuild.

---

## Using Rules in Tests

Rules work in Jest and other test environments. Create an engine with the exact scenario you need:

```ts
import { createMockEngine } from 'react-native-observability';
import { observeFetch } from 'react-native-observability/observers/fetch';

describe('checkout error states', () => {
  it('shows payment-failed UI when POST /checkout returns 400', async () => {
    const mock = createMockEngine({
      rules: [
        {
          id: 'checkout-400',
          match: { method: 'POST', url: '/api/checkout' },
          action: {
            type: 'respond',
            status: 400,
            body: { error: 'Card declined' },
          },
        },
      ],
    });
    const restore = observeFetch(http, { mock });

    // render your component and assert error UI ...

    restore(); // always restore after the test
  });
});
```

---

## Troubleshooting

**Rule doesn't seem to fire**
- Check the rule is **enabled** (toggle on the list row).
- Open the rule and expand **Test Rule** — paste the real URL and check the result.
- URL patterns are substring-matched by default. `/orders` matches `https://api.example.com/api/orders/1` — no wildcard needed unless you want path specificity.
- Rules run in order; an earlier rule may have already matched the request.

**All requests are blocked even though my rule should only match one path**
- Your URL pattern may be too broad. `/api` matches every URL that contains the letters `/api`. Use a longer pattern (e.g., `/api/v1/orders`) or a glob (e.g., `**/v1/orders/**`) to be more specific.

**Modify Response doesn't run**
- `modifyResponse` is a response-phase action — it runs *after* the real server responds. If the request itself fails (network error, timeout), there is no response to modify. Use **Respond** instead to skip the network entirely.

**The panel shows the rule but the app still calls the real server**
- Confirm the mock engine is passed to the shim (`observeFetch(http, { mock })`) *and* the panel (`mockEngine={mock}`). Both must receive the **same instance**.

---

## Next Steps

- **[HTTP Observer](./http-observer.md)** — Setting up observers for Fetch, Axios, and more
- **[Debug Panel](./debug-panel.md)** — Full panel configuration reference
- **[Testing](./testing.md)** — Unit and integration testing patterns
