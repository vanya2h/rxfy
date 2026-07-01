"use client";
import { RefreshCw } from "lucide-react";
import { useObservable } from "rxfy-react";
import type { Observable } from "rxjs";
import { Button } from "../ui/button.js";

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
    <Button variant="secondary" size="sm" onClick={onApply}>
      <RefreshCw data-icon="inline-start" />
      {n} new {noun}
      {n === 1 ? "" : "s"} · refresh
    </Button>
  );
}
