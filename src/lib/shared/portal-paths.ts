const base = import.meta.env?.VITE_DEKA_PAGES_BASE ?? '';

export function portalHref(href: string): string {
  return href.startsWith('/') && !href.startsWith('//') ? base + href : href;
}

export function portalPath(pathname: string): string {
  return base && (pathname === base || pathname.startsWith(base + '/'))
    ? pathname.slice(base.length) || '/'
    : pathname;
}
