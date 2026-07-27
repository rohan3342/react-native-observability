# Architecture Diagrams

Visual representations of Observability's core systems and data flows.

## Core Data Flow

How an entry flows from app code through Observability to transports, adapters, and the panel:

```mermaid
graph TD
    A["Application Code"] -->|Logging Call| B["Logger Core<br/>Hot Path"]
    B -->|Apply Filtering| C{Pass<br/>Level?}
    C -->|No| D["Drop Entry"]
    C -->|Yes| E["Apply Sampling"]
    E -->|Sample Out| D
    E -->|Sample In| F["Apply Redaction<br/>PII Protection"]
    F -->|Add Context| G["Stamp with Screen/Session"]

    G -->|Dispatch| H["Transports<br/>Write Destinations"]
    G -->|Queue| I["Adapters<br/>Async Deferred"]

    H -->|Console| J["Console Output"]
    H -->|Memory| K["Memory Transport<br/>Ring Buffer"]
    H -->|MMKV| L["MMKV Transport<br/>Persistent Storage"]

    I -->|Deferred| M["Drain Queue"]
    M -->|Per Adapter| N["Isolated Error Handling"]
    N -->|Success| O["Remote Backends<br/>Sentry/Datadog"]
    N -->|Error| P["Internal Metrics"]

    K -->|Subscribe| Q["Debug Panel<br/>Logs Tab"]
    L -->|Query| R["Past Sessions"]

    style A fill:#f5f5f5,stroke:#424242,stroke-width:2px,color:#212121
    style B fill:#e8eaf6,stroke:#3f51b5,stroke-width:2px,color:#212121
    style Q fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#212121
    style O fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#212121
    style H fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#212121
    style I fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#212121
```

## Error Capture Flow

How an uncaught error gets captured, logged, and reported:

```mermaid
sequenceDiagram
    participant App as App Code
    participant GEH as Global Error<br/>Handler
    participant Logger as Logger Core
    participant Transport as Transports
    participant Adapter as Adapters
    participant Backend as Remote Backend

    App->>GEH: Uncaught Error thrown
    GEH->>Logger: logger.error(err, ctx)

    Logger->>Logger: Redact PII
    Logger->>Logger: Filter by level
    Logger->>Logger: Apply sampling

    Logger->>Transport: Write to transports
    Transport->>Transport: Console write
    Transport->>Transport: Memory append
    Transport->>Transport: MMKV persist

    Logger->>Adapter: Queue error (async)
    Note over Adapter: Deferred via<br/>microtask

    Adapter->>Adapter: try/catch wrap
    Adapter->>Backend: Send to backend

    alt Success
        Backend-->>Adapter: ✓ Captured
        Adapter-->>Logger: Done
    else Failure
        Backend--xAdapter: ✗ Timeout/Error
        Adapter->>Logger: Log failure internally
    end

    Logger->>App: Done (non-blocking)
```

## Screen Attribution Model

How the idle-window model attributes logs and requests to screens:

```mermaid
graph LR
    subgraph Timeline ["Timeline (1 second window shown)"]
        T0["0ms<br/>HomeScreen<br/>mount"]
        T100["100ms<br/>request<br/>start"]
        T200["200ms<br/>request<br/>end"]
        T300["300ms<br/>user idle<br/>no activity"]
        T1000["1000ms<br/>window<br/>closed"]
        T1100["1100ms<br/>background<br/>request"]
    end

    subgraph Attribution ["Screen Attribution"]
        A0["HomeScreen<br/>active"]
        A100["HomeScreen<br/>active"]
        A200["HomeScreen<br/>active"]
        A300["HomeScreen<br/>active"]
        A1000["undefined<br/>idle window<br/>expired"]
        A1100["undefined<br/>background<br/>task"]
    end

    T0 -.-> A0
    T100 -.-> A100
    T200 -.-> A200
    T300 -.-> A300
    T1000 -.-> A1000
    T1100 -.-> A1100

    style T0 fill:#bbdefb
    style T100 fill:#bbdefb
    style T200 fill:#bbdefb
    style T300 fill:#bbdefb
    style T1000 fill:#ffccbc
    style T1100 fill:#ffccbc
```

## Panel Architecture

How the debug panel reads from stores and displays data:

```mermaid
graph TB
    subgraph Stores ["Data Stores - Read Only Sources"]
        MT["Memory Transport<br/>Entries"]
        NHS["HTTP Log Store<br/>Entries"]
        SMS["Screen Mount Store<br/>History"]
        PBS["Performance Store<br/>Spans"]
        BS["Breadcrumb Store<br/>Timeline"]
        FS["Feature Flag Manager<br/>State"]
    end

    subgraph Panel ["Debug Panel<br/>React Native Components"]
        LT["Logs Tab"]
        NT["Network Tab"]
        ST["State Tab"]
        NavT["Navigation Tab"]
        PT["Performance Tab"]
        SetT["Settings Tab"]
    end

    subgraph Hooks ["Subscription & Listeners"]
        USE["useSyncExternalStore"]
        SListen["Screen Listener"]
        NListen["Network Listener"]
    end

    MT -->|subscribe| USE
    USE -->|real-time| LT

    NHS -->|subscribe| NListen
    NListen -->|real-time| NT

    SMS -->|subscribe| SListen
    SListen -->|real-time| NavT

    PBS -->|subscribe| PT
    BS -->|subscribe| SetT
    FS -->|read| ST

    LT -->|Display Filter Search| User["User Interaction"]
    NT -->|Display Mock Rules| User
    SetT -->|Clear Export Health| User

    style MT fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#212121
    style NHS fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#212121
    style SMS fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#212121
    style USE fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#212121
    style LT fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#212121
    style NT fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#212121
    style SetT fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#212121
```

## Session & Crash Detection Flow

How sessions are managed and crashes are detected across launches:

```mermaid
graph TD
    subgraph Launch1 ["Application Launch 1"]
        L1A["Initialize Session Manager"]
        L1B["Create Session ID"]
        L1C["Start Logging"]
        L1D["Application Crash"]
        L1E["Session State<br/>No End Time"]
    end

    subgraph Launch2 ["Application Launch 2"]
        L2A["Initialize Session Manager"]
        L2B["Check Prior Sessions"]
        L2C["Detect Crash<br/>Mark as Crashed"]
        L2D["Create New Session"]
        L2E["Log Recovery Event"]
    end

    subgraph Panel ["Debug Panel"]
        P1["Settings Tab"]
        P2["Show Crash Trail<br/>Previous Session"]
        P3["Show Current Logs<br/>Active Session"]
    end

    L1A --> L1B
    L1B --> L1C
    L1C --> L1D
    L1D --> L1E

    L1E -->|Persisted| L2A
    L2A --> L2B
    L2B --> L2C
    L2C --> L2D
    L2D --> L2E

    L2E -->|User Opens| P1
    L2C -->|Read from Storage| P2
    L2E -->|Read from Storage| P3

    style L1D fill:#ffebee,stroke:#c62828,stroke-width:2px,color:#212121
    style L2B fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#212121
    style L2C fill:#ffccbc,stroke:#bf360c,stroke-width:2px,color:#212121
    style P2 fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#212121
    style P3 fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#212121
```

## Redaction Pipeline

How PII is redacted before any transport or adapter sees data:

```mermaid
graph LR
    A["Input Data<br/>Sensitive Fields"]

    B["Key Pattern Matcher"]

    C["Value Pattern Matcher<br/>Regex"]

    D{Redaction<br/>Mode}

    E["Omit Mode<br/>Remove Key"]
    F["Replace Mode<br/>Replace Value"]

    G["Redacted Output<br/>PII Protected"]

    H["Transports"]

    I["Adapters"]

    J["Panel UI"]

    A --> B
    B --> D
    A --> C
    C --> D

    D -->|Omit| E
    D -->|Replace| F

    E --> G
    F --> G

    G --> H
    G --> I
    G --> J

    style A fill:#ffebee,stroke:#c62828,stroke-width:2px,color:#212121
    style B fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#212121
    style C fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#212121
    style G fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#212121
    style H fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#212121
    style I fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#212121
    style J fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#212121
```

## Mock Engine Request Interception

How the mock engine intercepts and modifies requests:

```mermaid
sequenceDiagram
    participant App as App/Vendor
    participant Mock as Mock Engine
    participant HTTP as HttpObserver
    participant Network as Real Network

    App->>Mock: resolve({ method, url, headers })

    alt Rule Matches
        Mock->>Mock: Check enabled rules
        Mock-->>App: resolution object

        alt type: block
            App->>HTTP: onEnd({ error })
        else type: fault
            App->>HTTP: onEnd({ error: injected })
        else type: respond
            App->>HTTP: onEnd({ status, body })
            App-->>App: Return synthetic response
        else type: modifyRequest
            Mock-->>App: Modified request
            App->>Network: Send modified request
            Network-->>App: Real response
            App->>HTTP: onEnd({ status, body })
        else type: modifyResponse
            App->>Network: Send real request
            Network-->>App: Real response
            Mock-->>App: Modify response
            App->>HTTP: onEnd({ status, body: modified })
        end
    else No Match
        Mock-->>App: null
        App->>Network: Send request normally
        Network-->>App: Response
        App->>HTTP: onEnd({ status, body })
    end
```

## Backpressure & Sampling

How backpressure and sampling prevent runaway logging:

```mermaid
graph TD
    A["Log Entry Created"]

    B["LogLevel Filter<br/>Check Threshold"]
    B -->|Below Threshold| D["Drop Entry"]
    B -->|Pass| C["Sampling Check<br/>Random < Rate"]

    C -->|Sample Out| D
    C -->|Sample In| E["Rate Limit Check<br/>Tokens Available"]

    E -->|No Token| D
    E -->|Has Token| F["Consume Token"]

    F --> G["Queue for<br/>Transports"]

    G --> H{Queue<br/>Full?}
    H -->|Yes| D
    H -->|No| I["Enqueue Entry"]

    I --> J["Write to Transports"]

    I --> K["Queue for Adapters<br/>Async Microtask"]

    K --> L["Drain Queue"]
    L --> M["Per-Adapter<br/>Processing"]
    M --> O["Success or<br/>Error Caught"]

    D --> P["Count in<br/>Internal Metrics"]

    style A fill:#e8eaf6,stroke:#3f51b5,stroke-width:2px,color:#212121
    style B fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#212121
    style C fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#212121
    style E fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#212121
    style D fill:#ffebee,stroke:#c62828,stroke-width:2px,color:#212121
    style J fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#212121
    style O fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#212121
    style P fill:#ffccbc,stroke:#bf360c,stroke-width:2px,color:#212121
```

## Next Steps

- [Architecture](./architecture.md) — Detailed explanations of these flows
- [API Reference](./api-reference.md) — Complete API documentation
- [Logger Guide](./logger-guide.md) — Deep dive into logging system
