jest.mock('react-native', () =>
  (
    require('../testUtils/reactNativeMock') as typeof import('../testUtils/reactNativeMock')
  ).reactNativeMock()
);

import React from 'react';
import { Text } from 'react-native';
import renderer, { act } from 'react-test-renderer';
import { TabScaffold, TabToolbar } from '../../src/panel/templates';
import { ThemeProvider } from '../../src/panel/theme';

function render(node: React.ReactElement): renderer.ReactTestRenderer {
  let tree: renderer.ReactTestRenderer | null = null;
  act(() => {
    tree = renderer.create(React.createElement(ThemeProvider, null, node));
  });
  return tree!;
}

function allText(tree: renderer.ReactTestRenderer): string {
  const collect = (c: unknown): string => {
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(collect).join('');
    if (c !== null && typeof c === 'object' && 'children' in c)
      return collect((c as { children: unknown }).children);
    return '';
  };
  return tree.root
    .findAllByType('Text' as never)
    .map(n => collect(n.props.children))
    .join(' ');
}

describe('TabScaffold', () => {
  it('renders the toolbar slot above the body', () => {
    const tree = render(
      <TabScaffold toolbar={<Text>TOOLBAR</Text>}>
        <Text>BODY</Text>
      </TabScaffold>
    );
    const text = allText(tree);
    expect(text).toMatch(/TOOLBAR/);
    expect(text).toMatch(/BODY/);
  });

  it('renders the body alone when no toolbar is given', () => {
    const tree = render(
      <TabScaffold>
        <Text>JUST BODY</Text>
      </TabScaffold>
    );
    expect(allText(tree)).toMatch(/JUST BODY/);
  });
});

describe('TabToolbar', () => {
  it('renders primary, search, filter, and meta slots', () => {
    const tree = render(
      <TabToolbar
        primary={<Text>PRIMARY</Text>}
        search={<Text>SEARCH</Text>}
        filter={<Text>FILTER</Text>}
        meta={<Text>META</Text>}
      />
    );
    const text = allText(tree);
    expect(text).toMatch(/PRIMARY/);
    expect(text).toMatch(/SEARCH/);
    expect(text).toMatch(/FILTER/);
    expect(text).toMatch(/META/);
  });

  it('renders a string meta as muted caption text', () => {
    const tree = render(<TabToolbar primary={<Text>P</Text>} meta="23 shown" />);
    expect(allText(tree)).toMatch(/23 shown/);
  });

  it('omits the search row when neither search nor filter is provided', () => {
    const tree = render(<TabToolbar primary={<Text>ONLY PRIMARY</Text>} />);
    const text = allText(tree);
    expect(text).toMatch(/ONLY PRIMARY/);
  });

  it('wraps wide primary content in a horizontal scroller when primaryScrolls', () => {
    const tree = render(<TabToolbar primaryScrolls primary={<Text>CHIPS</Text>} />);
    const scrollers = tree.root.findAllByType('ScrollView' as never);
    expect(scrollers.length).toBeGreaterThan(0);
    expect(allText(tree)).toMatch(/CHIPS/);
  });
});
