# Documentation Navigation Flow

Visual guide for navigating Observability's documentation based on user goals and experience level.

## Complete Documentation Flow

How users navigate from entry point to their goal:

```mermaid
flowchart TD
    Start["🩺 Visit Repository<br/>or npm package"] --> Choose{What's your<br/>situation?}

    Choose -->|New to Observability| GS["<b>Getting Started</b><br/>getting-started.md<br/>← Read this first"]
    Choose -->|Ready to build| QS["<b>Quick Start</b><br/>quick-start.md<br/>5 minutes"]
    Choose -->|Looking up API| API["<b>API Reference</b><br/>api-reference.md<br/>Search by export"]
    Choose -->|Troubleshooting| TS["<b>Troubleshooting</b><br/>troubleshooting.md<br/>Common issues"]
    Choose -->|Questions| FAQ["<b>FAQ</b><br/>faq.md<br/>40+ Q&A"]

    GS --> Concepts["Understand:<br/>• Transports<br/>• Adapters<br/>• Error Boundaries<br/>• Debug Panel"]

    Concepts --> Decision{Ready to<br/>implement?}
    Decision -->|Yes| Install["<b>Installation</b><br/>installation.md<br/>Peer setup"]
    Decision -->|Need details| Arch["<b>Architecture</b><br/>architecture.md<br/>System design"]

    Arch --> ArchDiag["<b>Diagrams</b><br/>diagrams.md<br/>Visual flows"]
    ArchDiag --> Install

    Install --> QS
    QS --> LoggerSetup["Logger Setup:<br/>createLogger()<br/>ConsoleTransport<br/>MemoryTransport"]

    LoggerSetup --> NeedMore{Need to<br/>go deeper?}
    NeedMore -->|Logging| LogGuide["<b>Logger Guide</b><br/>logger-guide.md<br/>Namespaces, redaction,<br/>sampling"]
    NeedMore -->|Error Handling| EB["<b>Error Boundaries</b><br/>error-boundaries.md<br/>Error isolation"]
    NeedMore -->|Network| HTTP["<b>HTTP Observer</b><br/>http-observer.md<br/>Network monitoring<br/>& mocking"]
    NeedMore -->|Continue| Config["Move to<br/>Implementation"]

    LogGuide --> Config
    EB --> Config
    HTTP --> Config

    Config --> DebugPanel["Add Debug Panel:<br/>DebugPanelProvider<br/>• Logs tab<br/>• Network tab<br/>• State tab"]

    DebugPanel --> PanelGuide{Need panel<br/>customization?}
    PanelGuide -->|Yes| Panel["<b>Debug Panel</b><br/>debug-panel.md<br/>Theming, gestures,<br/>branding"]
    PanelGuide -->|No| Features["Add Features"]

    Panel --> Features

    Features --> FeatChoice{Which features?}
    FeatChoice -->|Screen attribution| Screen["<b>Screen Tracking</b><br/>screen-tracking.md<br/>Per-screen filters"]
    FeatChoice -->|Persistence| Persist["<b>Persistence</b><br/>persistence.md<br/>MMKV, sessions,<br/>crash detection"]
    FeatChoice -->|HTTP integration| Obs["<b>Observers</b><br/>observers.md<br/>Axios, fetch,<br/>React Query..."]
    FeatChoice -->|Error forwarding| Adapt["<b>Adapters Guide</b><br/>adapters-guide.md<br/>Sentry, Datadog..."]
    FeatChoice -->|PII protection| Redact["<b>Redaction</b><br/>redaction.md<br/>Key-path & patterns"]
    FeatChoice -->|None| Production
    FeatChoice -->|Multiple| Screen

    Screen --> Screen2["Using createScreenProvider<br/>& trackScreen"]
    Screen2 --> Features

    Persist --> Persist2["Setup:<br/>createStorage()<br/>MMKVTransport<br/>SessionManager"]
    Persist2 --> Features

    Obs --> Obs2["Wire observers:<br/>observeFetch()<br/>observeAxios()<br/>etc."]
    Obs2 --> Features

    Adapt --> Adapt2["createCustomAdapter()<br/>Forward to backend"]
    Adapt2 --> Features

    Redact --> Redact2["Configure redaction<br/>keys & patterns"]
    Redact2 --> Features

    Production["Production Prep"] --> Testing["<b>Testing</b><br/>testing.md<br/>Test patterns<br/>Mock engine"]
    Testing --> Review["Review:<br/>• Logging levels<br/>• Sampling/rate limit<br/>• PII redaction<br/>• Error adapters"]
    Review --> Deploy["Deploy to<br/>Production"]

    Deploy --> Support["Need Help?"]
    Support -->|App slow| Perf["<b>Performance</b><br/>performance.md<br/>Profiling tips"]
    Support -->|Logs missing| TS
    Support -->|Other issue| FAQ

    Perf --> Done["✓ Ready"]
    TS --> Done
    FAQ --> Done

    API -.->|Deep dive| LogGuide
    API -.->|Deep dive| HTTP
    API -.->|Deep dive| Panel

    style Start fill:#e3f2fd
    style GS fill:#fff3e0
    style QS fill:#fff3e0
    style API fill:#f3e5f5
    style TS fill:#ffccbc
    style FAQ fill:#f3e5f5
    style Arch fill:#c8e6c9
    style ArchDiag fill:#c8e6c9
    style LogGuide fill:#bbdefb
    style HTTP fill:#bbdefb
    style EB fill:#bbdefb
    style Panel fill:#bbdefb
    style Obs fill:#bbdefb
    style Adapt fill:#bbdefb
    style Redact fill:#bbdefb
    style Screen fill:#bbdefb
    style Persist fill:#bbdefb
    style Perf fill:#bbdefb
    style Testing fill:#c8e6c9
    style Deploy fill:#c8e6c9
    style Done fill:#a5d6a7
```

## Quick Reference: Find What You Need

```mermaid
graph LR
    subgraph Start ["Getting Started"]
        GS["README"]
        GS1["Getting Started"]
        GS2["Installation"]
        GS3["Quick Start"]
    end

    subgraph Understand ["Understand System"]
        A["Architecture"]
        D["Diagrams"]
        C["Configuration"]
    end

    subgraph Features ["Core Features"]
        L["Logger Guide"]
        E["Error Boundaries"]
        H["HTTP Observer"]
        P["Debug Panel"]
    end

    subgraph Advanced ["Advanced Features"]
        S["Screen Tracking"]
        Pers["Persistence"]
        O["Observers"]
        Ad["Adapters"]
        R["Redaction"]
    end

    subgraph Production ["Production"]
        T["Testing"]
        Perf["Performance"]
        TS["Troubleshooting"]
    end

    subgraph Reference ["Reference"]
        API["API Reference"]
        FAQ["FAQ"]
    end

    Start --> Understand
    Understand --> Features
    Features --> Advanced
    Advanced --> Production

    API -.->|lookup| Features
    API -.->|lookup| Advanced
    FAQ -.->|questions| Production
    TS -.->|help| Reference

    style Start fill:#e8eaf6,stroke:#3f51b5,stroke-width:2px,color:#212121
    style Understand fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#212121
    style Features fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#212121
    style Advanced fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#212121
    style Production fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#212121
    style Reference fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#212121
```

## User Journey by Goal

Different paths based on what you want to accomplish:

```mermaid
flowchart TD
    subgraph Beginner ["New to Observability"]
        B1["README"]
        B2["Getting Started"]
        B3["Installation"]
        B4["Quick Start"]
        B5["Logger Guide"]
    end

    subgraph QuickBuild ["Fast Development"]
        Q1["Quick Start"]
        Q2["HTTP Observer"]
        Q3["Debug Panel"]
        Q4["Examples"]
    end

    subgraph Integrate ["App Integration"]
        I1["Installation"]
        I2["Configuration"]
        I3["Screen Tracking"]
        I4["Observers"]
        I5["Adapters Guide"]
    end

    subgraph Production ["Production Ready"]
        P1["Testing"]
        P2["Troubleshooting"]
        P3["Redaction"]
        P4["Persistence"]
    end

    subgraph DeepDive ["Comprehensive Learning"]
        D1["Architecture"]
        D2["Diagrams"]
        D3["API Reference"]
        D4["All Guides"]
    end

    B1 --> B2
    B2 --> B3
    B3 --> B4
    B4 --> B5

    Q1 --> Q2
    Q2 --> Q3
    Q3 --> Q4

    I1 --> I2
    I2 --> I3
    I3 --> I4
    I4 --> I5

    P1 --> P2
    P2 --> P3
    P3 --> P4

    D1 --> D2
    D2 --> D3
    D3 --> D4

    style Beginner fill:#e8eaf6,stroke:#3f51b5,stroke-width:2px,color:#212121
    style QuickBuild fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#212121
    style Integrate fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#212121
    style Production fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#212121
    style DeepDive fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#212121
```

## Content Map by Feature

Quickly find docs for the feature you're working on:

```mermaid
graph TB
    subgraph Core ["Core Systems"]
        Logger["Logger<br/>logger-guide.md"]
        Transport["Transports<br/>logger-guide.md"]
        Adapter["Adapters<br/>adapters-guide.md"]
    end

    subgraph Errors ["Error Handling"]
        EB["Error Boundaries<br/>error-boundaries.md"]
        GEH["Global Handler<br/>error-boundaries.md"]
        Crash["Crash Detection<br/>persistence.md"]
    end

    subgraph Network ["Network & HTTP"]
        HTTP["HTTP Observer<br/>http-observer.md"]
        Mock["Network Mocking<br/>http-observer.md"]
        Fetch["Fetch Observer<br/>observers.md"]
        Axios["Axios Observer<br/>observers.md"]
        GQL["GraphQL & Others<br/>observers.md"]
    end

    subgraph Panel ["Debug Panel"]
        Provider["Panel Provider<br/>debug-panel.md"]
        Tabs["Tabs & UI<br/>debug-panel.md"]
        Theme["Theming<br/>debug-panel.md"]
        Gesture["Gestures<br/>debug-panel.md"]
    end

    subgraph Data ["Data & Persistence"]
        Screen["Screen Tracking<br/>screen-tracking.md"]
        Breadcrumb["Breadcrumbs<br/>breadcrumbs.md"]
        Session["Session Manager<br/>persistence.md"]
        MMKV["MMKV Storage<br/>persistence.md"]
    end

    subgraph Security ["Security & Performance"]
        Redact["PII Redaction<br/>redaction.md"]
        Perf["Performance<br/>performance.md"]
    end

    subgraph DevOps ["Development"]
        Test["Testing<br/>testing.md"]
        Config["Configuration<br/>configuration.md"]
        API["API Reference<br/>api-reference.md"]
    end

    Logger --> Config
    Transport --> MMKV
    Adapter --> GEH

    HTTP --> Mock
    Fetch --> HTTP
    Axios --> HTTP
    GQL --> HTTP

    Provider --> Tabs
    Tabs --> Theme
    Theme --> Gesture

    Screen --> Panel
    Breadcrumb --> Session
    Session --> MMKV

    Redact --> Test
    Perf --> Test

    style Logger fill:#e8eaf6,stroke:#3f51b5,stroke-width:2px,color:#212121
    style HTTP fill:#fff3e0,stroke:#e65100,stroke-width:2px,color:#212121
    style Provider fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px,color:#212121
    style Screen fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#212121
    style Redact fill:#ffccbc,stroke:#bf360c,stroke-width:2px,color:#212121
    style Test fill:#e8f5e9,stroke:#2e7d32,stroke-width:2px,color:#212121
```

## Search by Problem

If you know what you're looking for:

```mermaid
graph LR
    subgraph Problem ["Problem or Goal"]
        P1["My app is slow"]
        P2["Logs aren't showing"]
        P3["Errors not reaching backend"]
        P4["Can't open the panel"]
        P5["Need persistent logs"]
        P6["Protect sensitive data"]
        P7["Mock network requests"]
        P8["Track user actions"]
    end

    subgraph Solution ["Solution Document"]
        P1 --> Perf["Performance<br/>troubleshooting.md"]
        P2 --> LogGuide["Logger Guide<br/>troubleshooting.md"]
        P3 --> Adapt["Adapters Guide<br/>troubleshooting.md"]
        P4 --> Panel["Debug Panel<br/>troubleshooting.md"]
        P5 --> Persist["Persistence<br/>persistence.md"]
        P6 --> Redact["Redaction<br/>redaction.md"]
        P7 --> HTTP["HTTP Observer<br/>http-observer.md"]
        P8 --> Screen["Screen Tracking<br/>screen-tracking.md"]
    end

    style P1 fill:#ffcdd2
    style P2 fill:#ffcdd2
    style P3 fill:#ffcdd2
    style P4 fill:#ffcdd2
    style P5 fill:#fff3e0
    style P6 fill:#fff3e0
    style P7 fill:#fff3e0
    style P8 fill:#fff3e0
    style Perf fill:#c8e6c9
    style LogGuide fill:#c8e6c9
    style Adapt fill:#c8e6c9
    style Panel fill:#c8e6c9
    style Persist fill:#bbdefb
    style Redact fill:#bbdefb
    style HTTP fill:#bbdefb
    style Screen fill:#bbdefb
```

## How to Use This Documentation

**Start here:**

1. Read the [README](../README.md) for overview
2. Follow [Getting Started](./getting-started.md)
3. Do [Quick Start](./quick-start.md) (5 minutes)

**Then choose your path:**

- **Learning** → [Architecture](./architecture.md) → [Diagrams](./diagrams.md)
- **Building** → [Configuration](./configuration.md) → [Feature Guides](./logger-guide.md)
- **Reference** → [API Reference](./api-reference.md)
- **Help** → [Troubleshooting](./troubleshooting.md) or [FAQ](./faq.md)

**Check examples:**

- [Expo Example](../examples/expo/README.md) — Go-safe, no native build
- [Bare Example](../examples/bare/README.md) — Full native surface

## Document Index

| Document                                  | Purpose                  | Best For               |
| ----------------------------------------- | ------------------------ | ---------------------- |
| [README](../README.md)                    | Package overview         | First impression       |
| [Getting Started](./getting-started.md)   | Concepts & minimum setup | Beginners              |
| [Installation](./installation.md)         | Peer dependencies        | Setup                  |
| [Quick Start](./quick-start.md)           | 5-minute integration     | Fast builders          |
| [Architecture](./architecture.md)         | System design            | Deep understanding     |
| [Diagrams](./diagrams.md)                 | Visual flows             | Visual learners        |
| [Configuration](./configuration.md)       | All config options       | Reference              |
| [API Reference](./api-reference.md)       | Complete API             | Developers             |
| [Logger Guide](./logger-guide.md)         | Logging mastery          | Advanced logging       |
| [Adapters Guide](./adapters-guide.md)     | Error forwarding         | Backend integration    |
| [Error Boundaries](./error-boundaries.md) | Error handling           | Error recovery         |
| [HTTP Observer](./http-observer.md)       | Network monitoring       | HTTP integration       |
| [Observers](./observers.md)               | Vendor integrations      | Library-specific setup |
| [Persistence](./persistence.md)           | MMKV & sessions          | Local storage          |
| [Debug Panel](./debug-panel.md)           | Panel customization      | UI personalization     |
| [Screen Tracking](./screen-tracking.md)   | Screen attribution       | Navigation             |
| [Breadcrumbs](./breadcrumbs.md)           | Timeline & crash trail   | Crash analysis         |
| [Performance](./performance.md)           | Performance spans        | Metrics & monitoring   |
| [Redaction](./redaction.md)               | PII protection           | Security               |
| [Testing](./testing.md)                   | Test patterns            | QA & testing           |
| [Troubleshooting](./troubleshooting.md)   | Common issues            | Problem solving        |
| [FAQ](./faq.md)                           | 40+ Q&A                  | Quick answers          |
