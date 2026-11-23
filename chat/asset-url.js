// Scramjet 1.x can expose a module's physical /service/<encoded URL> as
// import.meta.url. Resolve its assets against the original module location.
export function moduleAsset(path,moduleUrl) {
  let base=new URL(moduleUrl);
  if(base.pathname.startsWith('/service/')) {
    try {
      const original=new URL(decodeURIComponent(base.pathname.slice('/service/'.length)));
      if(['https:','http:'].includes(original.protocol))base=original;
    } catch { /* An ordinary /service/ directory is not an encoded proxy URL. */ }
  }
  return new URL(path,base).href;
}
