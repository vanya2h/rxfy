import { useEffect, useRef } from "react";

/** Calls `onVisible` whenever it scrolls into view — drives infinite scroll. */
export function LoadMoreSentinel({ onVisible }: { onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) onVisible();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [onVisible]);

  return <div ref={ref} className="sentinel" aria-hidden="true" />;
}
