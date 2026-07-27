/**
 * Panel icon barrel. Internal to `src/panel`.
 *
 * Exposes the {@link Icon} atom and its {@link IconName} vocabulary — the single
 * place the panel's structural glyphs are defined, so a later swap to a vector
 * icon set is a one-file change.
 */
export { Icon } from './Icon';
export type { IconName, IconProps } from './Icon';
export { IconSetProvider, useIconSet } from './IconSet';
export type { IconSet, IconRenderer, IconRenderProps } from './IconSet';
