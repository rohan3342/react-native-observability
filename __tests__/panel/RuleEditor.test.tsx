jest.mock('react-native', () =>
  (
    require('../testUtils/reactNativeMock') as typeof import('../testUtils/reactNativeMock')
  ).reactNativeMock()
);

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { RuleEditor } from '../../src/panel/tabs/RuleEditor';
import { emptyDraft } from '../../src/panel/tabs/ruleDraft';
import { ThemeProvider } from '../../src/panel/theme';

const g = globalThis as { __DEV__?: boolean };
beforeEach(() => {
  g.__DEV__ = true;
});

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
    .map((n: renderer.ReactTestInstance) => collect(n.props.children))
    .join(' ');
}

function byLabel(tree: renderer.ReactTestRenderer, type: string, label: string) {
  return tree.root
    .findAllByType(type as never)
    .find((n: renderer.ReactTestInstance) => String(n.props.accessibilityLabel ?? '') === label);
}

describe('RuleEditor', () => {
  it('renders section titles: MATCH, ACTION, CONFIGURATION', () => {
    const tree = render(<RuleEditor draft={emptyDraft()} onSave={() => {}} onCancel={() => {}} />);
    const text = allText(tree).toUpperCase();
    expect(text).toContain('MATCH');
    expect(text).toContain('ACTION');
    expect(text).toContain('CONFIGURATION');
  });

  it('renders Save rule and Cancel buttons', () => {
    const tree = render(<RuleEditor draft={emptyDraft()} onSave={() => {}} onCancel={() => {}} />);
    expect(byLabel(tree, 'Pressable', 'Save rule')).toBeDefined();
    expect(byLabel(tree, 'Pressable', 'Cancel')).toBeDefined();
  });

  it('calls onSave with the current draft when Save rule is pressed', () => {
    const onSave = jest.fn();
    const draft = { ...emptyDraft(), url: '/api/test' };
    const tree = render(<RuleEditor draft={draft} onSave={onSave} onCancel={() => {}} />);
    act(() => byLabel(tree, 'Pressable', 'Save rule')!.props.onPress());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0].url).toBe('/api/test');
  });

  it('calls onCancel when Cancel is pressed', () => {
    const onCancel = jest.fn();
    const tree = render(<RuleEditor draft={emptyDraft()} onSave={() => {}} onCancel={onCancel} />);
    act(() => byLabel(tree, 'Pressable', 'Cancel')!.props.onPress());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows a URL TextInput with placeholder containing /api/orders', () => {
    const tree = render(<RuleEditor draft={emptyDraft()} onSave={() => {}} onCancel={() => {}} />);
    const inputs = tree.root.findAllByType('TextInput' as never);
    const urlInput = inputs.find((i: renderer.ReactTestInstance) =>
      String(i.props.placeholder ?? '').includes('/api/orders')
    );
    expect(urlInput).toBeDefined();
  });

  it('reflects the draft URL value in the URL TextInput', () => {
    const draft = { ...emptyDraft(), url: 'https://api/x' };
    const tree = render(<RuleEditor draft={draft} onSave={() => {}} onCancel={() => {}} />);
    const inputs = tree.root.findAllByType('TextInput' as never);
    expect(inputs.some((i: renderer.ReactTestInstance) => i.props.value === 'https://api/x')).toBe(
      true
    );
  });

  it('reflects the draft status in a TextInput for the Respond action', () => {
    const draft = { ...emptyDraft(), actionType: 'respond' as const, status: '404' };
    const tree = render(<RuleEditor draft={draft} onSave={() => {}} onCancel={() => {}} />);
    const inputs = tree.root.findAllByType('TextInput' as never);
    expect(inputs.some((i: renderer.ReactTestInstance) => i.props.value === '404')).toBe(true);
  });

  it('shows the Block action description when Block is selected', () => {
    const draft = { ...emptyDraft(), actionType: 'block' as const };
    const tree = render(<RuleEditor draft={draft} onSave={() => {}} onCancel={() => {}} />);
    expect(allText(tree)).toContain('Request Blocked');
  });

  it('does not show status or body fields for Block action', () => {
    const draft = { ...emptyDraft(), actionType: 'block' as const };
    const tree = render(<RuleEditor draft={draft} onSave={() => {}} onCancel={() => {}} />);
    const inputs = tree.root.findAllByType('TextInput' as never);
    // Only the URL field and the test-rule inputs; no status or body TextInput
    const statusInput = inputs.find(
      (i: renderer.ReactTestInstance) =>
        i.props.accessibilityLabel === 'Status code' || i.props.keyboardType === 'number-pad'
    );
    expect(statusInput).toBeUndefined();
  });

  it('shows Fault Type segmented when Fault action is selected', () => {
    const draft = { ...emptyDraft(), actionType: 'fault' as const };
    const tree = render(<RuleEditor draft={draft} onSave={() => {}} onCancel={() => {}} />);
    expect(allText(tree)).toContain('Fault Type');
  });

  it('shows Timeout Delay field when fault kind is timeout', () => {
    const draft = { ...emptyDraft(), actionType: 'fault' as const, faultKind: 'timeout' as const };
    const tree = render(<RuleEditor draft={draft} onSave={() => {}} onCancel={() => {}} />);
    expect(allText(tree)).toContain('Timeout Delay');
  });

  it('does not show Timeout Delay field when fault kind is networkError', () => {
    const draft = {
      ...emptyDraft(),
      actionType: 'fault' as const,
      faultKind: 'networkError' as const,
    };
    const tree = render(<RuleEditor draft={draft} onSave={() => {}} onCancel={() => {}} />);
    expect(allText(tree)).not.toContain('Timeout Delay');
  });
});
