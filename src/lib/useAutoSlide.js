import { useEffect, useRef } from 'react';

export function useAutoSlide(api, { delay = 4500, paused = false } = {}) {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    if (!api) return undefined;
    if (typeof window === 'undefined') return undefined;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => {
      if (!pausedRef.current) api.scrollNext();
    }, delay);
    return () => window.clearInterval(timer);
  }, [api, delay]);
}
