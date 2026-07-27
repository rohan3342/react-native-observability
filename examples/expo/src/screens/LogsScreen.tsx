/**
 * Logs — emits log lines across levels and namespaces. Everything fired here is
 * tagged `screen=Logs` by the screen provider (Track 5), so the panel's Logs →
 * SCREEN filter isolates this tab's output. Child loggers demonstrate the
 * NAMESPACE filter at the same time.
 */

import { useDebugPanel } from 'react-native-observability/panel';
import { logger } from '../observability';
import { Button, Card, Hero, Screen } from '../ui';

// Child loggers inherit the parent's screenProvider (Track 5) — so these are
// tagged with the active screen too, and split out under the NAMESPACE filter.
const authLog = logger.child('auth');
const paymentsLog = logger.child('payments');

export function LogsScreen() {
  const { openPanel } = useDebugPanel();

  return (
    <Screen>
      <Hero
        icon="list"
        title="Logs"
        subtitle="Emit across levels + namespaces. Open the panel → Logs and combine the SCREEN filter (=Logs) with the NAMESPACE filter (auth / payments / example)."
        cta="Open Logs tab"
        onPressCta={() => openPanel('logs')}
      />

      <Card
        title="Levels"
        hint="The example namespace, across all four levels."
        icon="layers-outline"
      >
        <Button
          label="debug"
          icon="bug-outline"
          onPress={() => logger.debug('Debug detail', { trace: 'abc' })}
        />
        <Button
          label="info"
          icon="information-circle-outline"
          onPress={() => logger.info('User viewed the Logs screen')}
        />
        <Button
          label="warn"
          icon="alert-outline"
          variant="warn"
          onPress={() => logger.warn('Cache nearly full')}
        />
        <Button
          label="error"
          icon="close-circle-outline"
          variant="danger"
          onPress={() => logger.error('Checkout failed', new Error('gateway timeout'))}
        />
      </Card>

      <Card
        title="Namespaces"
        hint="Child loggers → filter by namespace in the Logs tab."
        icon="pricetags-outline"
        tint="#7c3aed"
      >
        <Button
          label="auth.info"
          icon="key-outline"
          onPress={() => authLog.info('Token refreshed')}
        />
        <Button
          label="auth.warn"
          icon="key-outline"
          variant="warn"
          onPress={() => authLog.warn('Session expiring soon')}
        />
        <Button
          label="payments.info"
          icon="card-outline"
          onPress={() => paymentsLog.info('Charge authorised')}
        />
        <Button
          label="payments.error"
          icon="card-outline"
          variant="danger"
          onPress={() => paymentsLog.error('Charge declined', new Error('insufficient_funds'))}
        />
      </Card>

      <Card
        title="Redaction"
        hint="PII in context is scrubbed before any transport sees it."
        icon="eye-off-outline"
        tint="#16a34a"
      >
        <Button
          label="Log with secrets"
          icon="lock-closed-outline"
          onPress={() =>
            logger.info('Signed in', {
              email: 'ada@example.com',
              password: 'hunter2',
              token: 'sk_live_abc123',
            })
          }
        />
      </Card>
    </Screen>
  );
}
