import React from 'react';
import { FlatList } from 'react-native';
import type { ListRenderItem } from 'react-native';

/**
 * Thin, virtualized list wrapper used by tab bodies so any list gets the same
 * windowing config (and so a tab can't accidentally fall back to a
 * non-virtualized `ScrollView` + `.map()` for a high-cardinality data source —
 * audit G3). Carries the panel's standard `FlatList` tuning and forwards a
 * header / empty component.
 *
 * Keep it minimal: tabs that need richer layout still compose this with their
 * own header content via `ListHeaderComponent`.
 */
export interface VirtualListProps<T> {
  readonly data: readonly T[];
  readonly renderItem: ListRenderItem<T>;
  readonly keyExtractor: (item: T, index: number) => string;
  readonly ListHeaderComponent?: React.ComponentType | React.ReactElement | null;
  readonly ListEmptyComponent?: React.ComponentType | React.ReactElement | null;
  readonly ItemSeparatorComponent?: React.ComponentType | null;
  /** Padding around the scroll content (applied as `contentContainerStyle`). */
  readonly contentPadding?: number;
}

export function VirtualList<T>({
  data,
  renderItem,
  keyExtractor,
  ListHeaderComponent,
  ListEmptyComponent,
  ItemSeparatorComponent,
  contentPadding,
}: VirtualListProps<T>): React.ReactElement {
  return (
    <FlatList<T>
      data={data as T[]}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      {...(ListHeaderComponent !== undefined ? { ListHeaderComponent } : {})}
      {...(ListEmptyComponent !== undefined ? { ListEmptyComponent } : {})}
      {...(ItemSeparatorComponent != null ? { ItemSeparatorComponent } : {})}
      initialNumToRender={20}
      windowSize={11}
      removeClippedSubviews
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={
        contentPadding !== undefined ? { padding: contentPadding, flexGrow: 1 } : { flexGrow: 1 }
      }
    />
  );
}
