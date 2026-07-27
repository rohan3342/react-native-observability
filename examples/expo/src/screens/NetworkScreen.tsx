/**
 * Network — fires varied API calls. Because the screen provider (Track 5) tags
 * each request with the active screen, everything fired here shows up under
 * `Network` in the panel's Network → SCREEN filter, distinct from requests fired
 * on other tabs.
 */

import { useDebugPanel } from 'react-native-observability/panel';
import { apiClient, logger } from '../observability';
import { Button, Card, Hero, Screen } from '../ui';

export function NetworkScreen() {
  const { openPanel } = useDebugPanel();

  const onFireGet = async (): Promise<void> => {
    try {
      await apiClient.get('/posts/1');
      logger.info('GET /posts/1 succeeded');
    } catch (err) {
      logger.error('Request failed', err instanceof Error ? err : new Error(String(err)));
    }
  };
  const onFirePost = async (): Promise<void> => {
    await apiClient.post('/posts', { title: 'hi', body: 'demo', userId: 1 });
    logger.info('POST /posts sent');
  };
  const onFirePut = async (): Promise<void> => {
    await apiClient.put('/posts/1', { id: 1, title: 'updated' });
    logger.info('PUT /posts/1 sent');
  };
  const onFireDelete = async (): Promise<void> => {
    await apiClient.delete('/posts/1');
    logger.info('DELETE /posts/1 sent');
  };
  const onFireFail = async (): Promise<void> => {
    try {
      await apiClient.get('/nope-404');
    } catch {
      logger.warn('GET /nope-404 failed (expected)');
    }
  };
  const onFetch = async (): Promise<void> => {
    await fetch('https://jsonplaceholder.typicode.com/todos/1').catch(() => undefined);
    logger.info('fetch /todos/1 (mockable via Network → Rules)');
  };
  const onBurst = async (): Promise<void> => {
    // Fire several at once so the Network tab has a busy moment to inspect.
    await Promise.allSettled([
      apiClient.get('/users/1'),
      apiClient.get('/users/2'),
      apiClient.get('/comments/3'),
      apiClient.get('/albums/4'),
    ]);
    logger.info('Burst of 4 requests sent');
  };

  return (
    <Screen>
      <Hero
        icon="globe"
        title="Network"
        subtitle="Fire requests, then open the panel → Network. Filter by SCREEN to see only the calls made from this tab. Two demo mock rules are seeded (disabled) under Rules."
        cta="Open Network tab"
        onPressCta={() => openPanel('network')}
      />

      <Card
        title="Requests"
        hint="Each tags itself with screen=Network."
        icon="swap-vertical-outline"
      >
        <Button
          label="GET /posts/1"
          icon="arrow-down-outline"
          variant="success"
          onPress={onFireGet}
        />
        <Button label="POST /posts" icon="add-outline" onPress={onFirePost} />
        <Button label="PUT /posts/1" icon="create-outline" variant="warn" onPress={onFirePut} />
        <Button
          label="DELETE /posts/1"
          icon="trash-outline"
          variant="danger"
          onPress={onFireDelete}
        />
        <Button label="GET 404" icon="warning-outline" variant="danger" onPress={onFireFail} />
        <Button label="fetch /todos/1" icon="cloud-download-outline" onPress={onFetch} />
        <Button label="Burst ×4" icon="flash-outline" variant="primary" onPress={onBurst} />
      </Card>
    </Screen>
  );
}
