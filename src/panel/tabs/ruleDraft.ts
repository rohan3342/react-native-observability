/**
 * Form-state model and draft ↔ rule conversion helpers for the Network Rules
 * editor. Extracted here so the list view (MockRulesView) and the editor
 * (RuleEditor) can both import without a require cycle.
 */

import type { HeaderPatch, MockAction, MockRule } from '../../integrations/http';
import type { Theme } from '../theme';

/** The five rule action kinds the editor can compose. */
export type ActionType = 'block' | 'respond' | 'modifyRequest' | 'modifyResponse' | 'fault';

export const ACTION_OPTIONS: ReadonlyArray<{ value: ActionType; label: string }> = [
  { value: 'respond', label: 'Respond' },
  { value: 'modifyRequest', label: 'Modify Req' },
  { value: 'modifyResponse', label: 'Modify Res' },
  { value: 'block', label: 'Block' },
  { value: 'fault', label: 'Fault' },
];

/**
 * Form state for the add/edit rule editor. String-typed for `TextInput`; fields
 * are shared across action types and only the relevant ones are shown/applied.
 */
export interface RuleDraft {
  id: string;
  /** Match. */
  method: string;
  url: string;
  actionType: ActionType;
  /** respond / modifyResponse. */
  status: string;
  /** respond / modifyRequest / modifyResponse. */
  body: string;
  delayMs: string;
  /** Header patch — `Key: value` per line (set) + comma-separated names (remove). */
  headersSet: string;
  headersRemove: string;
  /** modifyRequest overrides. */
  reqMethod: string;
  reqUrl: string;
  /** fault. */
  faultKind: 'networkError' | 'timeout';
  everyN: string;
}

let draftCounter = 0;

export function emptyDraft(): RuleDraft {
  return {
    id: '',
    method: '',
    url: '',
    actionType: 'respond',
    status: '200',
    body: '',
    delayMs: '0',
    headersSet: '',
    headersRemove: '',
    reqMethod: '',
    reqUrl: '',
    faultKind: 'networkError',
    everyN: '1',
  };
}

// ─── Draft ↔ rule conversion ─────────────────────────────────────────────────

/** Parse a JSON/text body field into a value (object when parseable, else raw). */
export function parseBody(raw: string): unknown {
  const trimmed = raw.trim();
  if (trimmed === '') return undefined;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return raw;
  }
}

/** Parse "Key: value" lines + a comma list into a {@link HeaderPatch} (or undefined). */
export function parseHeaderPatch(setText: string, removeText: string): HeaderPatch | undefined {
  const set: Record<string, string> = {};
  for (const line of setText.split('\n')) {
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key !== '') set[key] = value;
  }
  const remove = removeText
    .split(',')
    .map(s => s.trim())
    .filter(s => s !== '');
  const hasSet = Object.keys(set).length > 0;
  if (!hasSet && remove.length === 0) return undefined;
  return { ...(hasSet ? { set } : {}), ...(remove.length > 0 ? { remove } : {}) };
}

export function toInt(s: string, fallback: number): number {
  const n = Number.parseInt(s, 10);
  return Number.isNaN(n) ? fallback : n;
}

/** Build a {@link MockRule} from a draft (id generated if blank). */
export function draftToRule(d: RuleDraft): MockRule {
  const id = d.id !== '' ? d.id : `rule-${++draftCounter}`;
  const match: MockRule['match'] = {
    ...(d.method.trim() !== '' ? { method: d.method.trim() } : {}),
    ...(d.url.trim() !== '' ? { url: d.url.trim() } : {}),
  };
  const headers = parseHeaderPatch(d.headersSet, d.headersRemove);
  const body = parseBody(d.body);
  const delayMs = toInt(d.delayMs, 0);

  let action: MockAction;
  switch (d.actionType) {
    case 'block':
      action = { type: 'block' };
      break;
    case 'fault':
      action = {
        type: 'fault',
        kind: d.faultKind,
        ...(delayMs > 0 ? { delayMs } : {}),
        ...(toInt(d.everyN, 1) > 1 ? { everyN: toInt(d.everyN, 1) } : {}),
      };
      break;
    case 'modifyRequest':
      action = {
        type: 'modifyRequest',
        ...(d.reqMethod.trim() !== '' ? { method: d.reqMethod.trim() } : {}),
        ...(d.reqUrl.trim() !== '' ? { url: d.reqUrl.trim() } : {}),
        ...(headers !== undefined ? { headers } : {}),
        ...(d.body.trim() !== '' ? { body } : {}),
        ...(delayMs > 0 ? { delayMs } : {}),
      };
      break;
    case 'modifyResponse':
      action = {
        type: 'modifyResponse',
        ...(d.status.trim() !== '' ? { status: toInt(d.status, 200) } : {}),
        ...(headers !== undefined ? { headers } : {}),
        ...(d.body.trim() !== '' ? { body } : {}),
        ...(delayMs > 0 ? { delayMs } : {}),
      };
      break;
    default: // respond
      action = {
        type: 'respond',
        status: toInt(d.status, 200),
        ...(d.body.trim() !== '' ? { body } : {}),
        ...(headers?.set !== undefined ? { headers: headers.set } : {}),
        ...(delayMs > 0 ? { delayMs } : {}),
      };
  }
  return { id, match, action };
}

/** Render a header map / patch back into the editor's "Key: value" lines. */
export function headersToText(headers: Record<string, string> | undefined): string {
  if (headers === undefined) return '';
  return Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

export function bodyToText(body: unknown): string {
  if (body === undefined) return '';
  return typeof body === 'string' ? body : JSON.stringify(body, null, 2);
}

/** Turn an existing rule into an editable draft (for "edit"). */
export function ruleToDraft(rule: MockRule): RuleDraft {
  const d = emptyDraft();
  d.id = rule.id;
  d.method = rule.match.method ?? '';
  d.url = typeof rule.match.url === 'string' ? rule.match.url : (rule.match.url?.source ?? '');
  const a = rule.action;
  d.actionType = a.type;
  if (a.type === 'respond') {
    d.status = String(a.status ?? 200);
    d.body = bodyToText(a.body);
    d.headersSet = headersToText(a.headers);
    d.delayMs = String(a.delayMs ?? 0);
  } else if (a.type === 'modifyResponse') {
    d.status = a.status !== undefined ? String(a.status) : '';
    d.body = bodyToText(a.body);
    d.headersSet = headersToText(a.headers?.set);
    d.headersRemove = (a.headers?.remove ?? []).join(', ');
    d.delayMs = String(a.delayMs ?? 0);
  } else if (a.type === 'modifyRequest') {
    d.reqMethod = a.method ?? '';
    d.reqUrl = a.url ?? '';
    d.body = bodyToText(a.body);
    d.headersSet = headersToText(a.headers?.set);
    d.headersRemove = (a.headers?.remove ?? []).join(', ');
    d.delayMs = String(a.delayMs ?? 0);
  } else if (a.type === 'fault') {
    d.faultKind = a.kind;
    d.delayMs = String(a.delayMs ?? 0);
    d.everyN = String(a.everyN ?? 1);
  }
  return d;
}

/** Short colour for the action badge in the rule list. */
export function actionColor(t: Theme, type: ActionType): string {
  switch (type) {
    case 'block':
    case 'fault':
      return t.colors.danger;
    case 'modifyRequest':
      return t.colors.method.put;
    case 'modifyResponse':
      return t.colors.method.patch;
    default:
      return t.colors.success; // respond
  }
}

/** Human one-liner for a rule row. */
export function summarise(rule: MockRule): string {
  const m = rule.match.method ? `${rule.match.method.toUpperCase()} ` : 'ANY ';
  const u =
    rule.match.url === undefined
      ? '*'
      : typeof rule.match.url === 'string'
        ? rule.match.url
        : rule.match.url.source;
  const a = rule.action;
  let tail: string;
  switch (a.type) {
    case 'block':
      tail = 'BLOCK';
      break;
    case 'fault':
      tail = `FAULT ${a.kind}`;
      break;
    case 'modifyRequest':
      tail = 'MODIFY REQ';
      break;
    case 'modifyResponse':
      tail = `MODIFY RES${a.status !== undefined ? ` ${a.status}` : ''}`;
      break;
    default:
      tail = `RESPOND ${a.status ?? 200}`;
  }
  return `${m}${u} → ${tail}`;
}

/** Exposed so the Network tab can build a "Mock this" draft from an entry. */
export function draftFromEntry(
  method: string,
  url: string,
  status: number,
  body: unknown
): RuleDraft {
  const d = emptyDraft();
  d.method = method;
  d.url = url;
  d.actionType = 'respond';
  d.status = String(status || 200);
  d.body = bodyToText(body);
  return d;
}
