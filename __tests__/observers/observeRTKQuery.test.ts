import { observeRTKQuery } from '../../src/observers/rtk-query/observeRTKQuery';
import { Logger } from '../../src/logger/Logger';
import { LogLevel } from '../../src/logger/types';
import type { LogEntry, ITransport } from '../../src/logger/types';

function captureTransport(): ITransport & { entries: LogEntry[] } {
  const entries: LogEntry[] = [];
  return { name: 'capture', minLevel: LogLevel.DEBUG, write: e => entries.push(e), entries };
}

function makeMiddleware(logger: Logger) {
  const passed: unknown[] = [];
  const next = (action: unknown) => {
    passed.push(action);
    return action;
  };
  const dispatch = observeRTKQuery({ logger })({})(next);
  return { dispatch, passed };
}

describe('observeRTKQuery', () => {
  it('reports a rejected request keyed by endpoint name', () => {
    const t = captureTransport();
    const logger = new Logger({ namespace: 'app', level: LogLevel.DEBUG, transports: [t] });
    const { dispatch } = makeMiddleware(logger);

    dispatch({
      type: 'api/executeQuery/rejected',
      error: { message: 'timeout' },
      meta: { requestStatus: 'rejected', arg: { endpointName: 'getUser' } },
    });

    expect(t.entries).toHaveLength(1);
    expect(t.entries[0]?.level).toBe(LogLevel.ERROR);
    expect(t.entries[0]?.context?.key).toBe('rtkq:getUser');
  });

  it('ignores pending and fulfilled actions', () => {
    const t = captureTransport();
    const logger = new Logger({ namespace: 'app', level: LogLevel.DEBUG, transports: [t] });
    const { dispatch } = makeMiddleware(logger);

    dispatch({ type: 'api/executeQuery/pending', meta: { requestStatus: 'pending' } });
    dispatch({ type: 'api/executeQuery/fulfilled', meta: { requestStatus: 'fulfilled' } });
    expect(t.entries).toHaveLength(0);
  });

  it('passes every action through to next() unchanged', () => {
    const logger = new Logger({ namespace: 'app', level: LogLevel.DEBUG, transports: [] });
    const { dispatch, passed } = makeMiddleware(logger);
    const action = { type: 'plain/action' };
    const result = dispatch(action);
    expect(result).toBe(action);
    expect(passed).toContain(action);
  });

  it('falls back to <unknown> when no endpoint name is present', () => {
    const t = captureTransport();
    const logger = new Logger({ namespace: 'app', level: LogLevel.DEBUG, transports: [t] });
    const { dispatch } = makeMiddleware(logger);
    dispatch({ type: 'api/x/rejected', meta: { requestStatus: 'rejected' } });
    expect(t.entries[0]?.context?.key).toBe('rtkq:<unknown>');
  });
});
