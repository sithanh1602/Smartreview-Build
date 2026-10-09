import React, { useRef, useState } from 'react';
import { refreshSession } from '../../lib/api';
// Retry once after renewing the session when a protected SVG image cannot load.
export function SessionImage({
  href,
  onError,
  ...props
}: Omit<React.SVGProps<SVGImageElement>, 'href' | 'onError'> & {
  href: string;
  onError?: () => void;
}) {
  const attempted = useRef(false);
  const [retry, setRetry] = useState(false);
  return (
    <image
      {...props}
      href={retry ? `${href}${href.includes('?') ? '&' : '?'}session_retry=1` : href}
      onError={async () => {
        if (attempted.current) {
          onError?.();
          return;
        }
        attempted.current = true;
        try {
          await refreshSession();
          setRetry(true);
        } catch {
          onError?.();
        }
      }}
    />
  );
}
