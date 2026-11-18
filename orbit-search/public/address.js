export function normalizeAddress(value) {
  value = String(value || '').trim();
  if (!value || value.length > 4096) throw new Error('Enter a search or website address.');
  const candidate = /^https?:\/\//i.test(value) ? value : /^[\w.-]+\.[a-z]{2,}(?::\d+)?(?:\/\S*)?$/i.test(value) ? 'https://' + value : null;
  if (!candidate) {
    if (/^[a-z][\w+.-]*:/i.test(value)) throw new Error('Only HTTP and HTTPS websites are supported.');
    return 'https://www.google.com/search?q=' + encodeURIComponent(value);
  }
  const url = new URL(candidate);
  if (url.username || url.password) throw new Error('Use an address without embedded credentials.');
  return url.href;
}
