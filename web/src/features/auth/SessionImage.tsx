import React, { useEffect, useState } from 'react';
import { acquireImage, cachedImage, releaseImage } from '../../lib/imageCache';
// A protected SVG image, downloaded once per URL however many viewers show it. The cache
// renews the session and retries once when the request is rejected.
export function SessionImage({
  href,
  onError,
  ...props
}: Omit<React.SVGProps<SVGImageElement>, 'href' | 'onError'> & {
  href: string;
  onError?: () => void;
}) {
  const [loaded, setLoaded] = useState<{ href: string; src: string } | null>(null);
  useEffect(() => {
    if (!href) return;
    let active = true;
    acquireImage(href).then(
      (src) => active && setLoaded({ href, src }),
      () => active && onError?.(),
    );
    return () => {
      active = false;
      releaseImage(href);
    };
  }, [href]);
  const src = loaded?.href === href ? loaded.src : cachedImage(href);
  return <image {...props} href={src} onError={() => onError?.()} />;
}
