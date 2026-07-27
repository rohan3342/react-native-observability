jest.mock('react-native', () =>
  (
    require('../testUtils/reactNativeMock') as typeof import('../testUtils/reactNativeMock')
  ).reactNativeMock()
);

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { VirtualList } from '../../src/panel/components/VirtualList';

function render(node: React.ReactElement): renderer.ReactTestRenderer {
  let tree: renderer.ReactTestRenderer | null = null;
  act(() => {
    tree = renderer.create(node);
  });
  return tree!;
}

function texts(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType('Text' as never)
    .map(n => {
      const collect = (c: unknown): string =>
        typeof c === 'string' ? c : Array.isArray(c) ? c.map(collect).join('') : '';
      return collect((n.props as { children: unknown }).children);
    })
    .join(' ');
}

describe('VirtualList', () => {
  it('renders one item per data entry', () => {
    const tree = render(
      <VirtualList<string>
        data={['a', 'b', 'c']}
        keyExtractor={s => s}
        renderItem={({ item }) => <Text>{item}</Text>}
      />
    );
    expect(texts(tree)).toContain('a');
    expect(texts(tree)).toContain('c');
  });

  it('renders the empty component when data is empty', () => {
    const tree = render(
      <VirtualList<string>
        data={[]}
        keyExtractor={s => s}
        renderItem={({ item }) => <Text>{item}</Text>}
        ListEmptyComponent={<Text>Nothing here</Text>}
      />
    );
    expect(texts(tree)).toContain('Nothing here');
  });

  it('renders the header component', () => {
    const tree = render(
      <VirtualList<string>
        data={['x']}
        keyExtractor={s => s}
        renderItem={({ item }) => <Text>{item}</Text>}
        ListHeaderComponent={<Text>Header</Text>}
      />
    );
    expect(texts(tree)).toContain('Header');
  });
});

// Local Text (the RN mock provides a passthrough 'Text' host element).
function Text({ children }: { children: React.ReactNode }) {
  return React.createElement('Text', null, children);
}
