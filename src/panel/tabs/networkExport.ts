import type { NetworkLogEntry } from '../../integrations/http';

/**
 * Decides how a captured body should render in the detail sheet. Structured
 * values (objects/arrays) and JSON-parseable strings become a `tree` (drillable
 * via `JsonTree`); everything else (plain text, numbers, already-failed parses)
 * stays `text`. Returns the value to feed the tree, or the raw text.
 */
export function parseBodyForTree(
  body: unknown
): { kind: 'tree'; value: unknown } | { kind: 'text'; value: string } {
  if (body !== null && typeof body === 'object') return { kind: 'tree', value: body };
  if (typeof body === 'string') {
    const trimmed = body.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return { kind: 'tree', value: JSON.parse(trimmed) as unknown };
      } catch {
        // not valid JSON — fall through to text
      }
    }
    return { kind: 'text', value: body };
  }
  return { kind: 'text', value: formatBody(body) };
}

/** Stringify a body that may be a string or a structured value. */
export function formatBody(body: unknown): string {
  if (typeof body === 'string') return body;
  try {
    return JSON.stringify(body, null, 2);
  } catch {
    return String(body);
  }
}

/** Stringify a header map as `Key: value` lines, sorted for stable output. */
export function formatHeaders(headers: Record<string, string> | undefined): string {
  if (headers === undefined) return '';
  return Object.keys(headers)
    .sort()
    .map(k => `${k}: ${headers[k] ?? ''}`)
    .join('\n');
}

/**
 * Builds a single human-readable export of an entire network entry — request
 * line, timing, both header sets, both bodies, the error (if any), and the
 * reproducing cURL. Used by the Network detail sheet's "Export" action (shared
 * via the OS share sheet).
 *
 * The values are already redacted at capture time by `createHttpObserver`, so
 * this export never re-introduces unredacted data.
 */
export function formatNetworkExport(entry: NetworkLogEntry): string {
  const lines: string[] = [];
  const status =
    entry.state === 'pending'
      ? 'pending'
      : entry.state === 'cancelled'
        ? 'cancelled'
        : entry.statusCode !== undefined
          ? String(entry.statusCode)
          : entry.state === 'error'
            ? 'error'
            : 'unknown';

  lines.push(`${entry.method} ${entry.url}`);
  lines.push(`Status: ${status}`);
  lines.push(`Started: ${new Date(entry.timestamp).toISOString()}`);
  if (entry.durationMs !== undefined) lines.push(`Duration: ${entry.durationMs}ms`);
  if (entry.source !== undefined) lines.push(`Source: ${entry.source}`);
  if (entry.screen !== undefined) lines.push(`Screen: ${entry.screen}`);

  const reqHeaders = formatHeaders(entry.requestHeaders);
  if (reqHeaders !== '') lines.push('', '── Request Headers ──', reqHeaders);
  if (entry.requestBody !== undefined)
    lines.push('', '── Request Body ──', formatBody(entry.requestBody));

  const resHeaders = formatHeaders(entry.responseHeaders);
  if (resHeaders !== '') lines.push('', '── Response Headers ──', resHeaders);
  if (entry.responseBody !== undefined)
    lines.push('', '── Response Body ──', formatBody(entry.responseBody));

  if (entry.error !== undefined) lines.push('', '── Error ──', entry.error);

  lines.push('', '── cURL ──', entry.toCurl());

  return lines.join('\n');
}

/**
 * Builds a single human-readable export of every captured network entry —
 * concatenating {@link formatNetworkExport} for each, newest first, with a
 * numbered separator and a summary header. Used by the Network tab's
 * "Export all" action (shared via the OS share sheet).
 *
 * Entries are already redacted at capture time, so this never re-introduces
 * unredacted data. Returns a short notice when there is nothing to export.
 *
 * @param entries - The captured entries (typically `networkSource.getSnapshot()`).
 * @param generatedAt - Timestamp for the header. Pass `Date.now()` at call time.
 */
export function formatNetworkExportAll(
  entries: readonly NetworkLogEntry[],
  generatedAt: number
): string {
  if (entries.length === 0) return 'No network requests captured.';

  // Newest first — matches the on-screen order of the Network list.
  const ordered = entries.slice().reverse();
  const header = [
    `Observability network export — ${ordered.length} request${ordered.length === 1 ? '' : 's'}`,
    `Generated: ${new Date(generatedAt).toISOString()}`,
  ].join('\n');

  const blocks = ordered.map(
    (entry, i) =>
      `${'═'.repeat(60)}\n# ${i + 1} of ${ordered.length}\n${'═'.repeat(60)}\n${formatNetworkExport(entry)}`
  );

  return [header, ...blocks].join('\n\n');
}
