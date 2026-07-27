jest.mock('react-native', () => ({}));

import { deepMerge } from '../../src/panel/theme/deepMerge';
import { darkTokens, lightTokens, themePresets } from '../../src/panel/theme/tokens';

describe('themePresets', () => {
  it('exposes the midnight preset as a partial override', () => {
    expect(themePresets.midnight.colors?.surface).toBe('#000000');
    expect(themePresets.midnight.colors?.accent).toBe('#a78bfa');
    // It's a PARTIAL — it must not carry a full palette / mode.
    expect((themePresets.midnight as { mode?: unknown }).mode).toBeUndefined();
  });

  it('deep-merges cleanly over the dark base (overrides win, rest preserved)', () => {
    const merged = deepMerge(darkTokens, themePresets.midnight);
    expect(merged.colors.surface).toBe('#000000'); // overridden
    expect(merged.colors.accent).toBe('#a78bfa'); // overridden
    expect(merged.colors.text).toBe(darkTokens.colors.text); // preserved
    expect(merged.typography.display).toEqual(darkTokens.typography.display); // preserved
  });

  it('layers over the light base too (presets are base-agnostic)', () => {
    const merged = deepMerge(lightTokens, themePresets.midnight);
    expect(merged.colors.surface).toBe('#000000');
    expect(merged.mode).toBe('light'); // base mode untouched by a colors-only preset
  });

  it('ships paper + highContrast presets as partial overrides', () => {
    // paper — warm light surfaces
    const paper = deepMerge(lightTokens, themePresets.paper);
    expect(paper.colors.surface).toBe('#fbfaf7');
    expect(paper.colors.text).toBe(lightTokens.colors.text); // text untouched

    // highContrast — pure-black text, stronger borders/accent
    const hc = deepMerge(lightTokens, themePresets.highContrast);
    expect(hc.colors.text).toBe('#000000');
    expect(hc.colors.borderStrong).toBe('#5a5a63');
    expect(hc.colors.logLevel.error).toBe('#a4161a'); // nested override merges
    expect(hc.colors.logLevel.debug).toBe('#3a3a42');
    // unset nested slots in the preset still fall back to the base
    expect(hc.colors.success).toBe(lightTokens.colors.success);
  });
});

describe('typography display step', () => {
  it('is the largest ramp step', () => {
    expect(lightTokens.typography.display.size).toBeGreaterThan(
      lightTokens.typography.heading.size
    );
    expect(darkTokens.typography.display.size).toBe(lightTokens.typography.display.size);
  });
});
