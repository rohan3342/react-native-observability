/**
 * Shared `react-native` mock factory for panel/component tests (audit TEST-3).
 *
 * The 20 panel test files historically each hand-rolled an inline
 * `jest.mock('react-native', () => {...})` with a slightly different subset of
 * stubbed primitives, which drifted over time. This is the single source of
 * truth: a comprehensive passthrough stub covering every RN primitive the panel
 * touches. Use it from a test like:
 *
 * ```ts
 * jest.mock('react-native', () => require('../testUtils/reactNativeMock').reactNativeMock());
 * ```
 *
 * `passthrough` renders each component as a host element named after the RN
 * component, so `tree.root.findAllByType('Text')` etc. keep working exactly as
 * with the inline stubs.
 */

export function reactNativeMock(): Record<string, unknown> {
  const React = jest.requireActual('react') as typeof import('react');

  const passthrough = (name: string) =>
    function Stub(props: { children?: unknown }) {
      return React.createElement(name, props as any, (props as any).children);
    };

  // Animated.View etc. behave like passthroughs; Animated.Value/timing/etc. are
  // inert no-ops sufficient for render-only assertions.
  // A regular function (not an arrow) so it works both as `Animated.Value(0)`
  // and `new Animated.Value(0)` — the latter is how most components create one.
  function animatedValue() {
    return {
      setValue: () => undefined,
      interpolate: () => 0,
      addListener: () => '0',
      removeAllListeners: () => undefined,
    };
  }
  const animatedAnim = () => ({ start: (cb?: () => void) => cb?.(), stop: () => undefined });

  return {
    View: passthrough('View'),
    Text: passthrough('Text'),
    Pressable: passthrough('Pressable'),
    TouchableOpacity: passthrough('TouchableOpacity'),
    ScrollView: passthrough('ScrollView'),
    Switch: passthrough('Switch'),
    TextInput: passthrough('TextInput'),
    Modal: passthrough('Modal'),
    FlatList: function FlatListStub(props: {
      data?: readonly unknown[];
      renderItem?: (info: { item: unknown; index: number }) => unknown;
      keyExtractor?: (item: unknown, index: number) => string;
      ListHeaderComponent?: unknown;
      ListEmptyComponent?: unknown;
    }) {
      const data = props.data ?? [];
      // Mirror the real FlatList: render the header always, the empty component
      // when there are no items, and items otherwise.
      const renderSlot = (slot: unknown): unknown =>
        typeof slot === 'function'
          ? React.createElement(slot as React.ComponentType)
          : (slot ?? null);
      const children: unknown[] = [];
      const headerSlot = renderSlot(props.ListHeaderComponent);
      if (headerSlot !== null) {
        children.push(React.createElement('FlatListHeader', { key: '__header' }, headerSlot));
      }
      if (data.length === 0) {
        const emptySlot = renderSlot(props.ListEmptyComponent);
        if (emptySlot !== null) {
          children.push(React.createElement('FlatListEmpty', { key: '__empty' }, emptySlot));
        }
      } else {
        for (const [index, item] of data.entries()) {
          children.push(
            React.createElement(
              'FlatListItem',
              { key: props.keyExtractor ? props.keyExtractor(item, index) : index },
              props.renderItem ? (props.renderItem({ item, index }) as any) : null
            )
          );
        }
      }
      return React.createElement('FlatList', props as any, children as any);
    },
    StyleSheet: {
      create: <T extends Record<string, unknown>>(s: T) => s,
      hairlineWidth: 1,
      flatten: (s: unknown) => s,
      absoluteFillObject: {},
    },
    Animated: {
      View: passthrough('View'),
      Text: passthrough('Text'),
      ScrollView: passthrough('ScrollView'),
      Value: animatedValue,
      timing: animatedAnim,
      spring: animatedAnim,
      parallel: animatedAnim,
      sequence: animatedAnim,
      loop: animatedAnim,
    },
    // Easing functions are inert identities — sufficient for render-only tests
    // that build a transition with `Easing.bezier(...)`.
    Easing: {
      bezier: () => (x: number) => x,
      linear: (x: number) => x,
      ease: (x: number) => x,
      out: (fn: unknown) => fn,
      in: (fn: unknown) => fn,
      inOut: (fn: unknown) => fn,
    },
    Dimensions: { get: () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }) },
    useWindowDimensions: () => ({ width: 390, height: 844, scale: 2, fontScale: 1 }),
    Platform: { OS: 'ios', select: (o: Record<string, unknown>) => o['ios'] ?? o['default'] },
    StatusBar: { currentHeight: 24 },
    PanResponder: { create: () => ({ panHandlers: {} }) },
    findNodeHandle: () => 1,
    AccessibilityInfo: {
      isReduceMotionEnabled: () => Promise.resolve(false),
      addEventListener: () => ({ remove: () => undefined }),
      setAccessibilityFocus: () => undefined,
    },
    BackHandler: {
      addEventListener: () => ({ remove: () => undefined }),
      removeEventListener: () => undefined,
    },
    Share: { share: () => Promise.resolve({ action: 'sharedAction' }) },
  };
}
