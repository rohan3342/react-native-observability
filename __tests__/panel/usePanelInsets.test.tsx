jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  StatusBar: { currentHeight: 24 },
}));

import { renderHook } from '@testing-library/react-native';
import { usePanelInsets } from '../../src/panel/util/usePanelInsets';

describe('usePanelInsets', () => {
  it('uses a platform estimate when no insets are injected (iOS)', () => {
    const { result } = renderHook(() => usePanelInsets());
    expect(result.current.top).toBeGreaterThan(0);
    expect(result.current.bottom).toBeGreaterThan(0); // iOS home-indicator allowance
  });

  it('uses injected insets when supplied, falling back per-field', () => {
    const { result } = renderHook(() => usePanelInsets({ top: 59 }));
    expect(result.current.top).toBe(59); // injected
    expect(result.current.bottom).toBeGreaterThan(0); // estimate fallback
  });

  it('uses all injected insets when fully supplied', () => {
    const { result } = renderHook(() => usePanelInsets({ top: 59, bottom: 34, left: 0, right: 0 }));
    expect(result.current).toEqual({ top: 59, bottom: 34, left: 0, right: 0 });
  });
});
