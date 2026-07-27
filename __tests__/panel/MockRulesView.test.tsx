jest.mock('react-native', () =>
  (
    require('../testUtils/reactNativeMock') as typeof import('../testUtils/reactNativeMock')
  ).reactNativeMock()
);

import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { MockRulesView, draftFromEntry } from '../../src/panel/tabs/MockRulesView';
import { ThemeProvider } from '../../src/panel/theme';
import { createMockEngine } from '../../src/integrations/http';
import type { MockEngine } from '../../src/integrations/http';

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
function findAll(tree: renderer.ReactTestRenderer, type: string) {
  return tree.root.findAllByType(type as never);
}
function byLabel(tree: renderer.ReactTestRenderer, type: string, label: string) {
  return findAll(tree, type).find(n => String(n.props.accessibilityLabel ?? '') === label);
}
function byLabelStarts(tree: renderer.ReactTestRenderer, type: string, prefix: string) {
  return findAll(tree, type).find(n => String(n.props.accessibilityLabel ?? '').startsWith(prefix));
}
function text(tree: renderer.ReactTestRenderer): string {
  const collect = (c: unknown): string => {
    if (typeof c === 'string') return c;
    if (Array.isArray(c)) return c.map(collect).join('');
    if (c !== null && typeof c === 'object' && 'children' in c)
      return collect((c as { children: unknown }).children);
    return '';
  };
  return findAll(tree, 'Text')
    .map(n => collect(n.props.children))
    .join(' ');
}

describe('MockRulesView', () => {
  it('lists existing rules with a summary', () => {
    const engine = createMockEngine({
      rules: [{ id: 'r1', match: { method: 'GET', url: '/orders' }, action: { type: 'block' } }],
    });
    const tree = render(<MockRulesView engine={engine} />);
    expect(text(tree)).toContain('GET /orders → BLOCK');
    expect(text(tree)).toContain('r1');
  });

  it('shows an empty state when there are no rules', () => {
    const engine = createMockEngine();
    const tree = render(<MockRulesView engine={engine} />);
    expect(text(tree)).toContain('No mock rules');
  });

  it('toggles a rule via its Switch', () => {
    const engine = createMockEngine({
      rules: [{ id: 'r1', match: { url: '/x' }, action: { type: 'block' } }],
    });
    const tree = render(<MockRulesView engine={engine} />);
    const sw = findAll(tree, 'Switch')[0];
    act(() => sw!.props.onValueChange(false));
    expect(engine.getRules()[0]?.enabled).toBe(false);
  });

  it('deletes a rule', () => {
    const engine = createMockEngine({
      rules: [{ id: 'r1', match: { url: '/x' }, action: { type: 'block' } }],
    });
    const tree = render(<MockRulesView engine={engine} />);
    act(() => byLabel(tree, 'Pressable', 'Delete rule r1')!.props.onPress());
    expect(engine.getRules()).toHaveLength(0);
  });

  it('adds a respond rule through the editor', () => {
    const engine = createMockEngine();
    const tree = render(<MockRulesView engine={engine} />);
    // Open the editor.
    act(() => byLabel(tree, 'Pressable', '+ Add rule')!.props.onPress());
    // Fill the URL + status fields (the visible TextInputs).
    const inputs = findAll(tree, 'TextInput');
    const urlInput = inputs.find(i => String(i.props.placeholder ?? '').includes('/api/orders'));
    act(() => urlInput!.props.onChangeText('/api/orders'));
    // Save.
    act(() => byLabel(tree, 'Pressable', 'Save rule')!.props.onPress());

    const rules = engine.getRules();
    expect(rules).toHaveLength(1);
    expect(rules[0]?.match.url).toBe('/api/orders');
    expect(rules[0]?.action.type).toBe('respond');
  });

  it('opens pre-filled from a "Mock this" draft', () => {
    const engine = createMockEngine();
    const draft = draftFromEntry('POST', 'https://api/x', 201, { ok: true });
    const tree = render(<MockRulesView engine={engine} initialDraft={draft} />);
    // The editor is open with the URL pre-filled and a Save button present.
    expect(byLabel(tree, 'Pressable', 'Save rule')).toBeDefined();
    const inputs = findAll(tree, 'TextInput');
    expect(inputs.some(i => i.props.value === 'https://api/x')).toBe(true);
    expect(inputs.some(i => i.props.value === '201')).toBe(true);
  });

  it('edits an existing rule (tap row → editor → save replaces)', () => {
    const engine = createMockEngine({
      rules: [{ id: 'r1', match: { url: '/x' }, action: { type: 'respond', status: 200 } }],
    });
    const tree = render(<MockRulesView engine={engine} />);
    act(() => byLabelStarts(tree, 'Pressable', 'Edit rule r1')!.props.onPress());
    const statusInput = findAll(tree, 'TextInput').find(i => i.props.value === '200');
    act(() => statusInput!.props.onChangeText('404'));
    act(() => byLabel(tree, 'Pressable', 'Save rule')!.props.onPress());

    const rule = engine.getRules().find(r => r.id === 'r1');
    expect(rule?.action.type === 'respond' && rule.action.status).toBe(404);
    expect(engine.getRules()).toHaveLength(1); // replaced, not duplicated
  });
});

describe('draftFromEntry', () => {
  it('builds a respond draft pre-filled from a captured entry', () => {
    const d = draftFromEntry('GET', '/users/1', 200, { id: 1 });
    expect(d.method).toBe('GET');
    expect(d.url).toBe('/users/1');
    expect(d.status).toBe('200');
    expect(d.actionType).toBe('respond');
    expect(d.body).toContain('"id": 1');
  });
});

describe('MockRulesView — advanced action types', () => {
  it('lists a modifyResponse rule with a MODIFY RES summary', () => {
    const engine = createMockEngine({
      rules: [{ id: 'mr', match: { url: '/x' }, action: { type: 'modifyResponse', status: 503 } }],
    });
    const tree = render(<MockRulesView engine={engine} />);
    expect(text(tree)).toContain('MODIFY RES 503');
  });

  it('lists a fault rule with a FAULT summary', () => {
    const engine = createMockEngine({
      rules: [{ id: 'f', match: {}, action: { type: 'fault', kind: 'timeout' } }],
    });
    const tree = render(<MockRulesView engine={engine} />);
    expect(text(tree)).toContain('FAULT timeout');
  });

  it('round-trips a modifyResponse rule through the editor (edit → save)', () => {
    const engine = createMockEngine({
      rules: [
        {
          id: 'mr',
          match: { url: '/x' },
          action: { type: 'modifyResponse', status: 503, headers: { set: { 'X-A': '1' } } },
        },
      ],
    });
    const tree = render(<MockRulesView engine={engine} />);
    act(() => byLabelStarts(tree, 'Pressable', 'Edit rule mr')!.props.onPress());
    // The status field is pre-filled with 503; change it and save.
    const statusInput = findAll(tree, 'TextInput').find(i => i.props.value === '503');
    expect(statusInput).toBeDefined();
    act(() => statusInput!.props.onChangeText('418'));
    act(() => byLabel(tree, 'Pressable', 'Save rule')!.props.onPress());

    const rule = engine.getRules().find(r => r.id === 'mr');
    expect(rule?.action.type).toBe('modifyResponse');
    expect(rule?.action.type === 'modifyResponse' && rule.action.status).toBe(418);
    // Header patch preserved through the round-trip.
    expect(rule?.action.type === 'modifyResponse' && rule.action.headers?.set).toEqual({
      'X-A': '1',
    });
  });
});

// Type-only: ensure the engine type is what the view expects.
const _typecheck: MockEngine = createMockEngine();
void _typecheck;
