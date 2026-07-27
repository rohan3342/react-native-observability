/**
 * Errors & performance — measured spans, an unhandled rejection (caught by
 * `installGlobalErrorHandler`), and a render error (caught by AppErrorBoundary).
 * Spans + error logs fired here are tagged `screen=Errors` (Track 5).
 */

import { useState } from 'react';
import { trackPerformance } from 'react-native-observability';
import { useDebugPanel } from 'react-native-observability/panel';
import { logger } from '../observability';
import { Bomb, Button, Card, Hero, Screen } from '../ui';

export function ErrorsScreen() {
  const { openPanel } = useDebugPanel();
  const [boom, setBoom] = useState(false);

  const onMeasure = (): void => {
    const span = trackPerformance('expensive-loop', { logger });
    let n = 0;
    for (let i = 0; i < 2_000_000; i++) n += i;
    span.end({ result: n });
  };
  const onMeasureNested = (): void => {
    const outer = trackPerformance('render-list', { logger });
    for (let row = 0; row < 3; row++) {
      const inner = trackPerformance('render-row', { logger });
      let n = 0;
      for (let i = 0; i < 500_000; i++) n += i;
      inner.end({ row, sum: n });
    }
    outer.end({ rows: 3 });
  };
  const onReject = (): void => {
    // Unhandled rejection — caught by installGlobalErrorHandler (layer 2).
    void Promise.reject(new Error('Demo unhandled rejection'));
  };

  return (
    <Screen>
      <Hero
        icon="flash"
        title="Errors & performance"
        subtitle="Spans land in the Performance tab; the rejection lands in Logs; the render error is caught by AppErrorBoundary. All tagged screen=Errors."
        cta="Open Performance tab"
        onPressCta={() => openPanel('performance')}
      />

      <Card
        title="Performance"
        hint="trackPerformance() spans → Performance tab."
        icon="speedometer-outline"
        tint="#0ea5e9"
      >
        <Button label="Measure span" icon="timer-outline" onPress={onMeasure} />
        <Button label="Nested spans" icon="git-branch-outline" onPress={onMeasureNested} />
      </Card>

      <Card
        title="Errors"
        hint="Both reach your logger / boundary."
        icon="warning-outline"
        tint="#dc2626"
      >
        <Button
          label="Unhandled rejection"
          icon="alert-circle-outline"
          variant="danger"
          onPress={onReject}
        />
        <Button
          label="Render error"
          icon="bug-outline"
          variant="danger"
          onPress={() => setBoom(true)}
        />
      </Card>

      <Bomb shouldThrow={boom} />
    </Screen>
  );
}
