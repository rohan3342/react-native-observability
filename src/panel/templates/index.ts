/**
 * Panel layout templates. Internal to `src/panel`.
 *
 * `TabScaffold` is the shared frame every tab sits in (edge-bleed wrapper +
 * sticky toolbar slot + body slot); `TabToolbar` is the shared sub-header
 * grammar (primary control row + search/filter row + meta line). Together they
 * give all six tabs one consistent rhythm.
 */
export { TabScaffold } from './TabScaffold';
export type { TabScaffoldProps } from './TabScaffold';
export { TabToolbar } from './TabToolbar';
export type { TabToolbarProps } from './TabToolbar';
