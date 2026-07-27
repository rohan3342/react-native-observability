jest.mock('react-native', () =>
  (
    require('../testUtils/reactNativeMock') as typeof import('../testUtils/reactNativeMock')
  ).reactNativeMock()
);

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import {
  KeyValueEditor,
  RemoveHeadersEditor,
  headersSetToRows,
  headersRemoveToNames,
  rowsToHeadersSet,
  namesToHeadersRemove,
} from '../../src/panel/components/KeyValueEditor';
import { ThemeProvider } from '../../src/panel/theme';

function render(node: React.ReactElement): renderer.ReactTestRenderer {
  let tree: renderer.ReactTestRenderer | null = null;
  act(() => {
    tree = renderer.create(React.createElement(ThemeProvider, null, node));
  });
  return tree!;
}

// ─── Pure serialisation helpers ───────────────────────────────────────────────

describe('headersSetToRows / rowsToHeadersSet', () => {
  it('parses a single "Key: value" line', () => {
    expect(headersSetToRows('X-Mock: 1')).toEqual([{ key: 'X-Mock', value: '1' }]);
  });

  it('parses multiple lines', () => {
    expect(headersSetToRows('Authorization: Bearer t\nContent-Type: application/json')).toEqual([
      { key: 'Authorization', value: 'Bearer t' },
      { key: 'Content-Type', value: 'application/json' },
    ]);
  });

  it('skips blank and malformed lines', () => {
    expect(headersSetToRows('\nno-colon\nGood: yes\n')).toEqual([{ key: 'Good', value: 'yes' }]);
  });

  it('handles values containing colons (first colon is the separator)', () => {
    expect(headersSetToRows('Authorization: Bearer a:b:c')).toEqual([
      { key: 'Authorization', value: 'Bearer a:b:c' },
    ]);
  });

  it('round-trips rows → string → rows', () => {
    const original = [
      { key: 'X-Mock', value: '1' },
      { key: 'Authorization', value: 'Bearer test' },
    ];
    expect(headersSetToRows(rowsToHeadersSet(original))).toEqual(original);
  });

  it('ignores rows with blank keys when serialising', () => {
    const rows = [
      { key: '', value: 'orphan' },
      { key: 'Valid', value: 'yes' },
    ];
    expect(rowsToHeadersSet(rows)).toBe('Valid: yes');
  });
});

describe('headersRemoveToNames / namesToHeadersRemove', () => {
  it('splits comma-separated names', () => {
    expect(headersRemoveToNames('authorization, cookie')).toEqual(['authorization', 'cookie']);
  });

  it('trims whitespace and filters blanks', () => {
    expect(headersRemoveToNames('  x  ,  ,  y  ')).toEqual(['x', 'y']);
  });

  it('round-trips names → string → names', () => {
    const names = ['authorization', 'cookie'];
    expect(headersRemoveToNames(namesToHeadersRemove(names))).toEqual(names);
  });

  it('returns empty array for an empty string', () => {
    expect(headersRemoveToNames('')).toEqual([]);
  });
});

// ─── Component rendering ──────────────────────────────────────────────────────

describe('KeyValueEditor', () => {
  it('renders a row for each key/value pair', () => {
    const tree = render(
      <KeyValueEditor rows={[{ key: 'X-Mock', value: '1' }]} onChange={() => {}} />
    );
    const inputs = tree.root.findAllByType('TextInput' as never);
    expect(inputs.some((i: renderer.ReactTestInstance) => i.props.value === 'X-Mock')).toBe(true);
    expect(inputs.some((i: renderer.ReactTestInstance) => i.props.value === '1')).toBe(true);
  });

  it('calls onChange with updated rows when a value changes', () => {
    const onChange = jest.fn();
    const tree = render(
      <KeyValueEditor rows={[{ key: 'X-A', value: 'old' }]} onChange={onChange} />
    );
    const inputs = tree.root.findAllByType('TextInput' as never);
    const valueInput = inputs.find((i: renderer.ReactTestInstance) => i.props.value === 'old');
    act(() => valueInput!.props.onChangeText('new'));
    expect(onChange).toHaveBeenCalledWith([{ key: 'X-A', value: 'new' }]);
  });

  it('shows a "+ Add header" button', () => {
    const tree = render(<KeyValueEditor rows={[]} onChange={() => {}} />);
    const texts = tree.root.findAllByType('Text' as never);
    expect(
      texts.some((t: renderer.ReactTestInstance) => String(t.props.children).includes('Add'))
    ).toBe(true);
  });

  it('calls onChange with a new empty row when add is pressed', () => {
    const onChange = jest.fn();
    const tree = render(<KeyValueEditor rows={[]} onChange={onChange} />);
    const pressables = tree.root.findAllByType('Pressable' as never);
    const addBtn = pressables.find(
      (p: renderer.ReactTestInstance) => p.props.accessibilityLabel === '+ Add header'
    );
    act(() => addBtn!.props.onPress());
    expect(onChange).toHaveBeenCalledWith([{ key: '', value: '' }]);
  });
});

describe('RemoveHeadersEditor', () => {
  it('renders a TextInput for each name', () => {
    const tree = render(
      <RemoveHeadersEditor names={['authorization', 'cookie']} onChange={() => {}} />
    );
    const inputs = tree.root.findAllByType('TextInput' as never);
    expect(inputs.some((i: renderer.ReactTestInstance) => i.props.value === 'authorization')).toBe(
      true
    );
    expect(inputs.some((i: renderer.ReactTestInstance) => i.props.value === 'cookie')).toBe(true);
  });
});
