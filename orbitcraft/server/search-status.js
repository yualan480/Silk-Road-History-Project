// Query only the owner's configured search service, never a caller-supplied URL.
export function createSearchReadiness(fetcher = fetch) {
  const cache = new Map();
  return async function readiness(origin) {
    const previous = cache.get(origin);
    if (previous && previous.until > Date.now()) return previous.promise;
    const entry = {until:Date.now()+6000};
    entry.promise = (async () => {
      try {
        const response = await fetcher(origin + '/config.json', {signal:AbortSignal.timeout(5000),redirect:'error',headers:{Accept:'application/json'}});
        if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw Error('Starting');
        const config = await response.json();
        const parent = new URL(config.parent).origin;
        if (parent === 'null') throw Error('Invalid parent');
        return {ready:true,parent};
      } catch {
        entry.until = Date.now()+1000;
        return {ready:false};
      }
    })();
    cache.clear();cache.set(origin,entry);
    return entry.promise;
  };
}
