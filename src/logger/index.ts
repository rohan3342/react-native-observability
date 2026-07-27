export { Logger } from './Logger';
export type { ResolvedLoggerConfig } from './Logger';
export { createLogger, setDefaultLogger, getLogger, _resetDefaultLogger } from './createLogger';
export {
  LogLevel,
  type LogEntry,
  type ITransport,
  type IObservabilityAdapter,
  type ObservabilityUser,
  type RedactConfig,
  type LoggerConfig,
  type SamplingConfig,
  type RateLimitConfig,
} from './types';
// Self-telemetry + kill switch + panic mode (plan S18).
export {
  getInternalMetrics,
  setKillSwitch,
  clearKillSwitch,
  clearPanic,
  configurePanic,
  type InternalMetrics,
} from './internal/metrics';
export { ConsoleTransport, type ConsoleTransportOptions } from './transports/ConsoleTransport';
export { MemoryTransport, type MemoryTransportOptions } from './transports/MemoryTransport';
// console.* migration on-ramp (experimental).
export {
  installConsoleProxy,
  type InstallConsoleProxyOptions,
  type UninstallConsoleProxy,
} from './installConsoleProxy';
// MMKVTransport lives in src/storage/ — exported via the main barrel
// alongside other storage helpers (see src/index.ts).
