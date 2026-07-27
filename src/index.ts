/**
 * react-native-observability
 *
 * Production-grade observability and debugging toolkit for React Native.
 * Transport-based structured logger, observability adapters, error boundaries,
 * and an on-device debug panel — all with zero forced dependencies.
 *
 * Fully automated release pipeline with GitHub Actions + Changesets.
 * @packageDocumentation
 */

// Logger system — core public API
export {
  Logger,
  createLogger,
  setDefaultLogger,
  getLogger,
  LogLevel,
  ConsoleTransport,
  MemoryTransport,
  getInternalMetrics,
  setKillSwitch,
  clearKillSwitch,
  clearPanic,
  configurePanic,
  installConsoleProxy,
} from './logger';

// Types
export type {
  LogEntry,
  ITransport,
  IObservabilityAdapter,
  ObservabilityUser,
  RedactConfig,
  LoggerConfig,
  SamplingConfig,
  RateLimitConfig,
  InternalMetrics,
  ConsoleTransportOptions,
  MemoryTransportOptions,
  InstallConsoleProxyOptions,
  UninstallConsoleProxy,
} from './logger';

// Adapters — wire any remote backend via createCustomAdapter
export { createCustomAdapter } from './adapters';

// Config — singleton + feature flags
export { ObservabilityConfig, FeatureFlagManager } from './config';

export type { StorageConfig, DebugPanelTab } from './config';

// Error boundary system + JS crash capture (plan S14, layers 1–2)
export {
  AppErrorBoundary,
  ScreenErrorBoundary,
  withErrorBoundary,
  useErrorHandler,
  installGlobalErrorHandler,
} from './error-boundary';

export type {
  AppErrorBoundaryProps,
  ScreenErrorBoundaryProps,
  ErrorBoundaryFallbackProps,
  InstallGlobalErrorHandlerOptions,
} from './error-boundary';

// Provider-agnostic integration primitives — see plan S15.
// Vendor shims (axios, fetch, react-navigation, react-query) feed events
// into these and ship under react-native-observability/observers/*.
//
// NOTE: `NetworkLogStore` and `ScreenMountStore` are intentionally NOT
// re-exported here. They are internal backing stores — reach the network
// store via `createHttpObserver({...}).store`, and the screen store via the
// panel's `screenSource` (populated by `trackScreen`). See plan S3 / DR-9.
export { createHttpObserver, createMockEngine } from './integrations/http';
export type {
  CreateHttpObserverOptions,
  HttpObserver,
  HttpEventStart,
  HttpEventEnd,
  HttpRedactOptions,
  NetworkLogEntry,
  NetworkLogPatch,
  MockEngine,
  MockRule,
  MockAction,
  MockRequest,
  MockResolution,
  MockResponse,
  MockResponseResolution,
  MockFaultKind,
  HeaderPatch,
  CreateMockEngineOptions,
} from './integrations/http';

export { trackScreen, createScreenProvider, touchScreenActivity } from './integrations/screen';
export type {
  TrackScreenOptions,
  CreateScreenProviderOptions,
  ScreenLifecycleEvent,
  ScreenSummary,
} from './integrations/screen';

export { trackAsyncOperation } from './integrations/asyncOp';
export type { TrackAsyncOperationOptions, AsyncOperationHandle } from './integrations/asyncOp';

// Breadcrumb timeline / crash trail (plan S25, T5-6).
export {
  BreadcrumbStore,
  getBreadcrumbStore,
  BreadcrumbTransport,
} from './integrations/breadcrumbs';
export type {
  Breadcrumb,
  BreadcrumbKind,
  BreadcrumbLevel,
  BreadcrumbPersistence,
  BreadcrumbTransportOptions,
} from './integrations/breadcrumbs';

// Performance spans (plan S? perf monitoring). `getPerfStore()` is the
// singleton the panel's Performance tab reads.
export { trackPerformance, getPerfStore, PerfStore } from './integrations/perf';
export type { TrackPerformanceOptions, PerfSpanHandle, PerfSpan } from './integrations/perf';

// Persistence — MMKV-backed sessions + storage helpers + transport.
// All exports here are also reachable via `react-native-observability/storage`.
export {
  createStorage,
  MMKVTransport,
  initSessionManager,
  getCurrentSessionId,
  getSessions,
  endCurrentSession,
  reopenCurrentSession,
} from './storage';
export type {
  MMKVLike,
  MMKVTransportOptions,
  CreateStorageOptions,
  SessionMeta,
  InitSessionManagerOptions,
  EndSessionManagerFn,
  SessionAwareTransport,
} from './storage';

// Version is exposed in the `exports` map. Read the version from the package
// manifest directly:
//
//   import pkg from 'react-native-observability/package.json';
//   console.log(pkg.version);
