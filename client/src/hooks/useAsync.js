import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Run an async function and track its loading and error state.
 *
 * Every screen needs the same three things — is it loading, did it fail, what
 * came back — and writing that by hand in each component is how one of them ends
 * up silently swallowing an error.
 *
 * @param {Function} fn        The async call.
 * @param {Array}    deps      Re-run when these change.
 * @param {object}   options
 * @param {boolean}  options.immediate  Run on mount (default true).
 */
export function useAsync(fn, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);

  // Keep the latest fn without making it a dependency, so an inline arrow
  // function in the caller does not cause an infinite re-run.
  const fnRef = useRef(fn);
  fnRef.current = fn;

  // Ignore a resolution that lands after the component has gone.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async (...args) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current(...args);
      if (mounted.current) setData(result);
      return result;
    } catch (caught) {
      if (mounted.current) setError(caught);
      throw caught;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!immediate) return;
    // The rejection is already captured in state; this catch only stops it
    // surfacing as an unhandled promise rejection in the console.
    run().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, run, reload: run, setData };
}
