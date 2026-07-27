/**
 * Observability BARE React Native example — the full v0.1.0 surface.
 *
 * Unlike ../expo (which is limited to the Expo Go-safe subset), this bare app
 * wires the native-dependent features that need a real build:
 *
 *  - createStorage → initSessionManager → MMKVTransport  (persistent logs +
 *    session correlation; the transport is told the session id BEFORE the
 *    logger writes anything — see the ordering note below)
 *  - createLogger with sessionIdProvider: getCurrentSessionId  (every entry is
 *    stamped with the active session)
 *  - createHttpObserver + observeAxios                   (provider-agnostic HTTP)
 *  - trackScreen on mount/unmount                        (screen primitive)
 *  - AppErrorBoundary at the root                        (render-error capture)
 *  - <DebugPanelProvider openOn={['shake']} accelerometer={...}>  (shake-to-open)
 *
 * Sentry is DOCUMENTED, NOT WIRED — see the commented `sentryAdapter` block.
 * Adding it is two lines plus installing `@sentry/react-native`; we keep it out
 * of this example's install so the native setup stays light.
 *
 * NOTE ON VERIFICATION: this file is authored to be type-correct and
 * copy-pasteable. It has not been run through a native iOS/Android build in
 * this repo; treat it as the reference wiring, not a CI-built binary.
 */

import { useEffect, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';
import axios from 'axios';
import { accelerometer, setUpdateIntervalForType, SensorTypes } from 'react-native-sensors';

import {
  createLogger,
  ConsoleTransport,
  MemoryTransport,
  MMKVTransport,
  LogLevel,
  ObservabilityConfig,
  AppErrorBoundary,
  createHttpObserver,
  trackScreen,
  createStorage,
  initSessionManager,
  getCurrentSessionId,
  getSessions,
} from 'react-native-observability';
import { observeAxios } from 'react-native-observability/observers/axios';
import {
  DebugPanelProvider,
  useDebugPanel,
  type AccelerometerSource,
} from 'react-native-observability/panel';

// ─── 1. Storage + session (native; runs once at module load) ────────────────
// createStorage() throws if react-native-mmkv is not installed — in a bare app
// it always is, so no guard is needed here. In a library you'd guard the call.

const storage = createStorage({ id: 'observability-example-bare' });

const memoryTransport = new MemoryTransport({ maxEntries: 200 });
const mmkvTransport = new MMKVTransport({ storage, minLevel: LogLevel.WARN });

// ─── 2. Logger — sessionIdProvider resolves through the SessionManager ──────
// The provider is read lazily on every write(), so it is safe to construct the
// logger before initSessionManager() runs: by the time the first log fires,
// the id is set.

const logger = createLogger({
  namespace: 'example',
  level: LogLevel.DEBUG,
  transports: [new ConsoleTransport(), memoryTransport, mmkvTransport],
  sessionIdProvider: getCurrentSessionId,
});

// ─── 3. Init the session manager — wires the session id INTO the MMKV ───────
// transport so persisted entries land under t:l:{sessionId}:{seq}. Detects a
// prior crash (a session with no endTime) and writes an end marker on
// AppState 'background'.

initSessionManager(storage, {
  appVersion: '0.1.0',
  buildNumber: 1,
  transports: [mmkvTransport],
});

logger.info('Observability bare example booted', {
  sessionId: getCurrentSessionId(),
  priorSessions: getSessions().length,
});

ObservabilityConfig.init({
  app: {
    name: 'Observability Bare Example',
    version: '0.1.0',
    buildNumber: 1,
    buildType: 'development',
  },
  logger: { namespace: 'example', level: LogLevel.DEBUG, transports: [] },
});

// ─── 4. HTTP observer (provider-agnostic) + axios shim ──────────────────────

const http = createHttpObserver({
  logger,
  redact: { headerKeys: ['Authorization'], bodyKeys: ['password', 'token'] },
});

const apiClient = axios.create({ baseURL: 'https://jsonplaceholder.typicode.com' });
observeAxios(apiClient, http);

// ─── 5. Shake gesture — wrap react-native-sensors' Observable in the ────────
// provider-agnostic AccelerometerSource shape the panel expects.

setUpdateIntervalForType(SensorTypes.accelerometer, 100);
const shakeSource: AccelerometerSource = {
  addListener: cb => {
    const sub = accelerometer.subscribe(({ x, y, z }) => cb({ x, y, z }));
    return { remove: () => sub.unsubscribe() };
  },
};

// ─── 6. Custom adapter (any remote backend) ─────────────────────────────────
// Use `createCustomAdapter` from `react-native-observability/adapters` to forward
// errors to any backend — Datadog, your own service, etc.
//
//   import { createCustomAdapter } from 'react-native-observability/adapters';
//   const logger = createLogger({
//     ...,
//     adapters: [createCustomAdapter({
//       name: 'datadog',
//       captureException: (err, ctx) => DdLogs.error(err.message, ctx),
//     })],
//   });

// ─── UI ─────────────────────────────────────────────────────────────────────

function HomeScreen() {
  useEffect(() => trackScreen('Home', undefined, { logger, sessionId: getCurrentSessionId() }), []);

  const { openPanel } = useDebugPanel();
  const [boom, setBoom] = useState(false);

  const onFireRequest = async (): Promise<void> => {
    try {
      await apiClient.get('/posts/1');
      logger.info('Request succeeded');
    } catch (err) {
      logger.error('Request failed', err instanceof Error ? err : new Error(String(err)));
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>🩺 Observability (bare RN)</Text>
      <Text style={styles.subtitle}>
        Full surface — persistent MMKV logs, session correlation, HTTP observer, shake-to-open
      </Text>

      <Section title="Actions">
        <Button label="Log INFO" onPress={() => logger.info('Hello', { source: 'button' })} />
        <Button label="Log WARN (persists to MMKV)" onPress={() => logger.warn('Heads up')} />
        <Button label="Fire HTTP request" onPress={onFireRequest} />
        <Button label="Trigger render error" onPress={() => setBoom(true)} variant="danger" />
      </Section>

      <Section title="Open the panel">
        <Text style={styles.hint}>Shake the device, or use the buttons:</Text>
        <Button label="🩺 Open Observability" onPress={() => openPanel('logs')} />
        <Button label="Open at Settings (session info)" onPress={() => openPanel('settings')} />
      </Section>

      <Bomb shouldThrow={boom} />
    </ScrollView>
  );
}

function Bomb({ shouldThrow }: { shouldThrow: boolean }): null {
  if (shouldThrow) throw new Error('Demo render error from <Bomb />');
  return null;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Button({
  label,
  onPress,
  variant,
}: {
  label: string;
  onPress: (e: GestureResponderEvent) => void;
  variant?: 'danger';
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.button,
        variant === 'danger' && styles.buttonDanger,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export default function App() {
  return (
    <AppErrorBoundary logger={logger} FallbackComponent={ErrorFallback}>
      <DebugPanelProvider
        enabled
        logSource={memoryTransport}
        networkSource={http.store}
        openOn={['shake']}
        accelerometer={shakeSource}
        gestureTab="logs"
        // Persist the panel's active tab + filter selections across app
        // restarts, reusing the same MMKV instance the logger already uses.
        // PanelPersistence is just { getItem, setItem } — no extra dependency.
        persist={{
          getItem: key => storage.getString(key) ?? null,
          setItem: (key, value) => storage.set(key, value),
        }}
      >
        <View style={styles.app}>
          <HomeScreen />
        </View>
      </DebugPanelProvider>
    </AppErrorBoundary>
  );
}

function ErrorFallback({ error, retry }: { error: Error; retry: () => void }) {
  return (
    <View style={styles.fallback}>
      <Text style={styles.fallbackTitle}>Caught by AppErrorBoundary</Text>
      <Text style={styles.fallbackBody}>{error.message}</Text>
      <Button label="Retry" onPress={retry} />
    </View>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1, backgroundColor: '#fff', paddingTop: 50 },
  scroll: { padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 13, color: '#666', marginBottom: 8 },
  hint: { fontSize: 12, color: '#888' },
  section: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 12, gap: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '600' },
  button: {
    backgroundColor: '#0a7aff',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  buttonDanger: { backgroundColor: '#c33' },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: '#fff', fontWeight: '600', textAlign: 'center' },
  fallback: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, gap: 8 },
  fallbackTitle: { fontSize: 18, fontWeight: '700' },
  fallbackBody: { fontSize: 14, color: '#666', textAlign: 'center' },
});
