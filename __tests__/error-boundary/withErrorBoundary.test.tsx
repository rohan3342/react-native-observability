import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { withErrorBoundary } from '../../src/error-boundary/withErrorBoundary';

beforeEach(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  jest.restoreAllMocks();
});

function MyComponent(): React.ReactElement {
  return <></>;
}

function Thrower(): React.ReactElement {
  throw new Error('wrapped-error');
}

describe('withErrorBoundary', () => {
  it('sets displayName from component name', () => {
    const Wrapped = withErrorBoundary(MyComponent);
    expect(Wrapped.displayName).toBe('withErrorBoundary(MyComponent)');
  });

  it('uses component.displayName when set', () => {
    function Anon(): React.ReactElement {
      return <></>;
    }
    Anon.displayName = 'CustomName';
    const Wrapped = withErrorBoundary(Anon);
    expect(Wrapped.displayName).toBe('withErrorBoundary(CustomName)');
  });

  it('falls back to "Component" when name is empty', () => {
    const Nameless = (() => (): React.ReactElement => <>{}</>)();
    Object.defineProperty(Nameless, 'name', { value: '' });
    const Wrapped = withErrorBoundary(Nameless);
    expect(Wrapped.displayName).toBe('withErrorBoundary(Component)');
  });

  it('renders the wrapped component when there is no error', () => {
    const Wrapped = withErrorBoundary(MyComponent);
    let tree: renderer.ReactTestRenderer | undefined;
    act(() => {
      tree = renderer.create(<Wrapped />);
    });
    expect(tree).toBeDefined();
  });

  it('catches errors and renders null (default fallback)', () => {
    const Wrapped = withErrorBoundary(Thrower);
    let tree: renderer.ReactTestRenderer | undefined;
    act(() => {
      tree = renderer.create(<Wrapped />);
    });
    expect(tree?.toJSON()).toBeNull();
  });

  it('passes options to the boundary', () => {
    const onError = jest.fn();
    const Wrapped = withErrorBoundary(Thrower, { onError });
    act(() => {
      renderer.create(<Wrapped />);
    });
    expect(onError).toHaveBeenCalledWith(new Error('wrapped-error'), expect.anything());
  });
});
