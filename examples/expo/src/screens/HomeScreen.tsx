/**
 * Home — the full showcase. Logging, rich State slices, feature flags, the
 * error-boundary demo, and jump-to-tab shortcuts. The Network / Logs / Errors
 * tabs each fire their own activity, so the panel's per-screen SCREEN filter
 * (Track 5) shows distinct entries per tab.
 */

import { useEffect, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { FeatureFlagManager } from 'react-native-observability';
import { useDebugPanel } from 'react-native-observability/panel';
import { clearPersistentStorage, getSessionInfo, logger } from '../observability';
import { Badge, Bomb, Button, Card, Hero, InfoRow, Screen } from '../ui';

interface CartItem {
  id: number;
  name: string;
  qty: number;
}

const CATALOG = ['Observability', 'Tripod', 'Eyepiece', 'Filter', 'Star map'];

export function HomeScreen() {
  const { openPanel, registerStateSlice } = useDebugPanel();
  const [boom, setBoom] = useState(false);

  // ── Rich demo state, exposed as State slices of varied shapes ─────────────
  const [tapCount, setTapCount] = useState(0);
  const [user, setUser] = useState<{ id: string; name: string; roles: string[] } | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [settings, setSettings] = useState({ darkMode: false, notifications: true, beta: false });
  const [flags, setFlags] = useState({ new_checkout_ui: false, dark_mode: true });

  // Primitive, object, array, boolean-map, and a deeply-nested slice — so the
  // State tab's JSON tree, diff, and previews all have something to show.
  useEffect(() => {
    const offs = [
      registerStateSlice('counter', () => tapCount),
      registerStateSlice('user', () => user),
      registerStateSlice('cart', () => cart),
      registerStateSlice('settings', () => settings),
      registerStateSlice('config', () => ({
        api: { baseURL: 'https://jsonplaceholder.typicode.com', timeoutMs: 5000, retries: 2 },
        ui: { theme: settings.darkMode ? 'dark' : 'light', density: 'comfortable' },
        device: { platform: 'expo-go', online: true, locale: 'en-US' },
        session: { items: cart.length, signedIn: user !== null },
      })),
    ];
    return () => offs.forEach(off => off());
  }, [registerStateSlice, tapCount, user, cart, settings]);

  const addToCart = (): void => {
    const name = CATALOG[cart.length % CATALOG.length]!;
    setCart(c => [...c, { id: c.length + 1, name, qty: 1 }]);
    logger.info('Added to cart', { name });
  };
  const toggleSetting = (key: keyof typeof settings): void =>
    setSettings(s => ({ ...s, [key]: !s[key] }));
  const toggleFlag = (key: keyof typeof flags): void => {
    setFlags(f => {
      const next = !f[key];
      FeatureFlagManager.override(key, next); // reflected live in State → Flags
      return { ...f, [key]: next };
    });
  };

  return (
    <Screen>
      <Hero
        icon="telescope"
        title="Observability showcase"
        subtitle="Multi-screen demo. Each tab tags its logs + network with its screen — open the panel and try the SCREEN filter. Tap the top-right corner 5× to open the panel."
        cta="Open debug panel"
        onPressCta={() => openPanel('logs')}
      />

      <StorageCard />

      <Card
        title="Logging"
        hint="All levels + the console proxy. Watch the Logs tab."
        icon="terminal-outline"
      >
        <Button
          label="debug"
          icon="bug-outline"
          onPress={() => logger.debug('A debug line', { i: 1 })}
        />
        <Button
          label="info"
          icon="information-circle-outline"
          onPress={() => logger.info('Hello from Observability')}
        />
        <Button
          label="warn"
          icon="alert-outline"
          variant="warn"
          onPress={() => logger.warn('Heads up')}
        />
        <Button
          label="error"
          icon="close-circle-outline"
          variant="danger"
          onPress={() => logger.error('Something broke', new Error('demo error'))}
        />
        <Button
          label="console.log"
          icon="chatbox-ellipses-outline"
          variant="ghost"
          onPress={() => console.log('via console proxy', { ok: true })}
        />
      </Card>

      <Card
        title="State demo"
        hint="Each control drives a State slice — open State to drill in."
        icon="cube-outline"
        tint="#7c3aed"
      >
        <Button
          label={`Counter: ${tapCount}`}
          icon="add-circle-outline"
          onPress={() => setTapCount(c => c + 1)}
        />
        <Button
          label={user !== null ? `Logout (${user.name})` : 'Login as Ada'}
          icon={user !== null ? 'log-out-outline' : 'log-in-outline'}
          variant={user !== null ? 'ghost' : 'primary'}
          onPress={() =>
            setUser(curr =>
              curr !== null ? null : { id: 'u-42', name: 'Ada', roles: ['admin', 'beta'] }
            )
          }
        />
        <Button label={`Cart +1 (${cart.length})`} icon="cart-outline" onPress={addToCart} />
        <Button
          label="Cart clear"
          icon="trash-outline"
          variant="ghost"
          disabled={cart.length === 0}
          onPress={() => setCart([])}
        />
        <Button
          label={`Dark mode: ${settings.darkMode ? 'on' : 'off'}`}
          icon="moon-outline"
          variant={settings.darkMode ? 'primary' : 'secondary'}
          onPress={() => toggleSetting('darkMode')}
        />
        <Button
          label={`Notifications: ${settings.notifications ? 'on' : 'off'}`}
          icon="notifications-outline"
          variant={settings.notifications ? 'primary' : 'secondary'}
          onPress={() => toggleSetting('notifications')}
        />
        <Button
          label={`Beta: ${settings.beta ? 'on' : 'off'}`}
          icon="flask-outline"
          variant={settings.beta ? 'primary' : 'secondary'}
          onPress={() => toggleSetting('beta')}
        />
      </Card>

      <Card
        title="Feature flags"
        hint="Toggles persist to FeatureFlagManager → State → Flags."
        icon="flag-outline"
        tint="#0ea5e9"
      >
        <Button
          label={`new_checkout_ui: ${flags.new_checkout_ui ? 'on' : 'off'}`}
          icon="toggle-outline"
          variant={flags.new_checkout_ui ? 'primary' : 'secondary'}
          onPress={() => toggleFlag('new_checkout_ui')}
        />
        <Button
          label={`dark_mode: ${flags.dark_mode ? 'on' : 'off'}`}
          icon="toggle-outline"
          variant={flags.dark_mode ? 'primary' : 'secondary'}
          onPress={() => toggleFlag('dark_mode')}
        />
      </Card>

      <Card
        title="Error boundary"
        hint="Throws inside this screen — caught by AppErrorBoundary."
        icon="warning-outline"
        tint="#dc2626"
      >
        <Button
          label="Render error"
          icon="flash-outline"
          variant="danger"
          onPress={() => setBoom(true)}
        />
      </Card>

      <Card title="Jump to a tab" icon="grid-outline">
        <Button
          label="Logs"
          icon="list-outline"
          variant="ghost"
          onPress={() => openPanel('logs')}
        />
        <Button
          label="Network"
          icon="globe-outline"
          variant="ghost"
          onPress={() => openPanel('network')}
        />
        <Button
          label="State"
          icon="cube-outline"
          variant="ghost"
          onPress={() => openPanel('state')}
        />
        <Button
          label="Navigation"
          icon="git-network-outline"
          variant="ghost"
          onPress={() => openPanel('navigation')}
        />
        <Button
          label="Perf"
          icon="speedometer-outline"
          variant="ghost"
          onPress={() => openPanel('performance')}
        />
        <Button
          label="Settings"
          icon="settings-outline"
          variant="ghost"
          onPress={() => openPanel('settings')}
        />
      </Card>

      <Bomb shouldThrow={boom} />
    </Screen>
  );
}

/**
 * Storage & sessions — shows whether MMKV persistence is active. In an Expo dev
 * build (`npx expo run:ios` / EAS) react-native-mmkv is available, so logs
 * persist, sessions are correlated + crash-detected across launches, and the
 * breadcrumb crash trail survives restarts. In Expo Go it falls back to memory.
 */
function StorageCard() {
  // Read once on mount — session id is fixed for the run; the prior-crash flag
  // is resolved at launch by the session manager.
  const info = useMemo(() => getSessionInfo(), []);
  return (
    <Card
      title="Storage & sessions"
      hint={
        info.persistent
          ? 'MMKV is active — logs, sessions, and the crash trail persist across restarts.'
          : 'Expo Go: in-memory only. Run a dev build (npx expo run:ios) to persist via MMKV.'
      }
      icon={info.persistent ? 'save-outline' : 'cloud-offline-outline'}
      tint={info.persistent ? '#16a34a' : '#d97706'}
    >
      <InfoRow
        label="Persistence"
        value={
          info.persistent ? (
            <Badge label="MMKV" tone="success" />
          ) : (
            <Badge label="In-memory" tone="warn" />
          )
        }
      />
      {info.persistent ? (
        <>
          <InfoRow label="Session" value={info.sessionId?.slice(0, 8) ?? '—'} />
          <InfoRow label="Sessions stored" value={String(info.sessionCount)} />
          <InfoRow
            label="Prior crash"
            value={
              info.priorCrash ? (
                <Badge label="Detected" tone="danger" />
              ) : (
                <Badge label="None" tone="neutral" />
              )
            }
          />
          <Button
            label="Clear MMKV storage"
            icon="trash-outline"
            variant="danger"
            onPress={() =>
              Alert.alert(
                'Clear persisted storage?',
                'Removes all sessions, persisted logs, panel prefs, and breadcrumb trails from MMKV. Reload the app afterwards for a clean start.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Clear',
                    style: 'destructive',
                    onPress: () => {
                      const removed = clearPersistentStorage();
                      Alert.alert(
                        'Storage cleared',
                        `${removed} keys removed. Reload to start clean.`
                      );
                    },
                  },
                ]
              )
            }
          />
        </>
      ) : null}
    </Card>
  );
}
