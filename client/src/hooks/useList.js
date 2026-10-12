import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Drives a paginated, filterable list screen.
 *
 * Holds the filter and page state, calls the fetcher whenever either changes,
 * and resets to page 1 when a filter moves — otherwise you filter down to three
 * results while sitting on page 4 and the screen looks empty.
 *
 * @param {Function} fetcher  (params) => Promise<{ data, meta }>
 * @param {object}   options
 * @param {object}   options.initialFilters
 * @param {number}   options.perPage
 */
export function useList(fetcher, { initialFilters = {}, perPage = 25 } = {}) {
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetcherRef.current({ ...filters, page, perPage });
      if (!mounted.current) return;
      setItems(response.data || []);
      setMeta(response.meta || null);
    } catch (caught) {
      if (mounted.current) {
        setError(caught);
        setItems([]);
        setMeta(null);
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [filters, page, perPage]);

  useEffect(() => {
    load();
  }, [load]);

  /** Change one filter and go back to the first page. */
  const setFilter = useCallback((key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(initialFilters);
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasActiveFilters = Object.entries(filters).some(
    ([key, value]) => value !== '' && value !== undefined && value !== initialFilters[key]
  );

  return {
    items,
    meta,
    loading,
    error,
    filters,
    setFilter,
    resetFilters,
    hasActiveFilters,
    page,
    setPage,
    reload: load,
  };
}
