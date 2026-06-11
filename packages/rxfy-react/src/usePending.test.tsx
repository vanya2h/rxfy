import { renderHook } from "@testing-library/react";
import { attachReload, markSync } from "rxfy";
import { BehaviorSubject, Observable, of, Subject, throwError } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { usePending } from "./usePending.js";

describe("usePending sync probe", () => {
  it("starts fulfilled for a sync-marked source that emits synchronously", () => {
    const source$ = markSync(new BehaviorSubject(42));
    const { result } = renderHook(() => usePending(source$));
    // first render — must already be fulfilled (hydration correctness)
    expect(result.current).toEqual({ status: "fulfilled", value: 42 });
  });

  it("starts rejected for a sync-marked source that errors synchronously", () => {
    const source$ = markSync(throwError(() => new Error("boom")));
    const { result } = renderHook(() => usePending(source$));
    expect(result.current.status).toBe("rejected");
  });

  it("starts pending for unmarked sources (unchanged behavior)", () => {
    const { result } = renderHook(() => usePending(new Subject<number>()));
    expect(result.current).toEqual({ status: "pending" });
  });

  it("does not subscribe unmarked cold observables during the probe", () => {
    let subscriptions = 0;
    const cold$ = new Observable<number>(() => {
      subscriptions += 1;
    });
    renderHook(() => usePending(cold$));
    // exactly one subscription — from the pipeline, not the probe
    expect(subscriptions).toBe(1);
  });

  it("onReload calls the attached reload instead of re-subscribing", () => {
    const reload = vi.fn();
    const source$ = attachReload(markSync(throwError(() => new Error("boom"))), reload);
    const { result } = renderHook(() => usePending(source$));
    expect(result.current.status).toBe("rejected");
    if (result.current.status === "rejected") result.current.onReload();
    expect(reload).toHaveBeenCalledOnce();
  });

  it("still resolves async sources (unchanged behavior)", async () => {
    // hoisted: source$ must be referentially stable across renders (see usePending JSDoc) —
    // a completing observable recreated inline would restart pending→fulfilled forever
    const source$ = of(7);
    const { result } = renderHook(() => usePending(source$));
    await vi.waitFor(() => expect(result.current).toEqual({ status: "fulfilled", value: 7 }));
  });
});
