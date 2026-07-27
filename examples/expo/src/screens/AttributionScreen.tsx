/**
 * Screen attribution demo — the three cases Observability's per-screen tagging has
 * to get right. Open the panel → Logs / Network and use the SCREEN filter
 * ("By screen") to see where each call lands.
 *
 * The model is Sentry-style: a navigation opens an idle window; ambient tagging
 * applies only while activity is recent; an explicit `screen` at the call site
 * overrides the ambient value (`null` = detach).
 */

import { useEffect } from 'react';
import { useDebugPanel } from 'react-native-observability/panel';
import { apiClient, globalApiCall, logger, taggedApiCall } from '../observability';
import { Badge, Button, Card, Hero, Screen } from '../ui';

export function AttributionScreen() {
  const { openPanel } = useDebugPanel();

  // Case 1 — calls fired right after this screen mounts are tagged with it
  // (they're inside the idle window opened by the navigation to Attribution).
  useEffect(() => {
    logger.info('Attribution screen mounted — firing initial load');
    void apiClient.get('/posts/1');
    void apiClient.get('/posts/2');
  }, []);

  return (
    <Screen>
      <Hero
        icon="locate"
        title="Screen attribution"
        subtitle="Three cases. Fire each, then open Logs / Network → SCREEN filter (By screen) and check where it lands. Idle window default is 1s."
        cta="Open Network tab"
        onPressCta={() => openPanel('network')}
      />

      <Card
        title="Case 1 — owned by this screen"
        hint="Fired right after mount → inside the idle window → tagged 'Attribution'. (Also runs on mount.)"
        icon="checkmark-circle-outline"
        tint="#16a34a"
      >
        <Badge label="→ Attribution" tone="success" />
        <Button
          label="Fire 2 calls now"
          icon="play-outline"
          onPress={() => {
            void apiClient.get('/posts/3');
            void apiClient.get('/posts/4');
          }}
        />
      </Card>

      <Card
        title="Case 2 — global / background"
        hint="A JWT-refresh-style call from a global interceptor. Forced untagged (screen: null) → shows under 'All', never under this screen."
        icon="planet-outline"
        tint="#d97706"
      >
        <Badge label="→ All (untagged)" tone="warn" />
        <Button
          label="Global JWT refresh"
          icon="refresh-outline"
          variant="warn"
          onPress={() => void globalApiCall('/users/1')}
        />
      </Card>

      <Card
        title="Case 3 — owned by another screen"
        hint="Simulates Screen A still in the stack firing a background poll. Explicitly tagged 'Home' even though you're on Attribution."
        icon="swap-horizontal-outline"
        tint="#0ea5e9"
      >
        <Badge label="→ Home (explicit)" tone="info" />
        <Button
          label="Background poll as Home"
          icon="home-outline"
          onPress={() => void taggedApiCall('/comments/1', 'Home')}
        />
      </Card>

      <Card
        title="Try the idle window"
        hint="Wait >1s after navigating here, then fire a plain call below."
        icon="hourglass-outline"
      >
        <Button
          label="Delayed plain call"
          icon="time-outline"
          variant="ghost"
          onPress={() => {
            logger.info('Delayed call — untagged if the window went idle');
            void apiClient.get('/albums/1');
          }}
        />
      </Card>
    </Screen>
  );
}
