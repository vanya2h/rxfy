import { useObservable } from "rxfy-react";
import type { Observable } from "rxjs";

export function UpdatesBadge({
  available$,
  onApply,
  noun,
}: {
  available$: Observable<number>;
  onApply: () => void;
  noun: string;
}) {
  const n = useObservable(available$, 0);
  if (n <= 0) return null;
  return (
    <button className="badge-button" onClick={onApply}>
      {n} new {noun}
      {n === 1 ? "" : "s"} · click to refresh
    </button>
  );
}
