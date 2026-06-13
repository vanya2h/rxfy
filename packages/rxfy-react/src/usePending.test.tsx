import { act, renderHook } from "@testing-library/react";
import { markSync, StatusEnum } from "rxfy";
import { BehaviorSubject, Observable, of, Subject, throwError } from "rxjs";
import { describe, expect, it } from "vitest";
import { usePending } from "./usePending.js";

describe("usePending sync probe", () => {
  it("starts fulfilled for a sync-marked source that emits synchronously", () => {
    const source$ = markSync(new BehaviorSubject(42));
    const { result } = renderHook(() => usePending(source$));
    // first render — must already be fulfilled (hydration correctness)
    expect(result.current).toEqual({ type: StatusEnum.FULFILLED, value: 42 });
  });

  it("starts rejected for a sync-marked source that errors synchronously", () => {
    const source$ = markSync(throwError(() => new Error("boom")));
    const { result } = renderHook(() => usePending(source$));
    expect(result.current.type).toBe(StatusEnum.REJECTED);
  });

  it("starts pending for unmarked sources (unchanged behavior)", () => {
    const { result } = renderHook(() => usePending(new Subject<number>()));
    expect(result.current).toEqual({ type: StatusEnum.PENDING });
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

  it("returns PENDING then FULFILLED for an async source", () => {
    // source$ must be referentially stable across renders (see usePending JSDoc)
    const source$ = new Subject<number>();
    const { result } = renderHook(() => usePending(source$));
    expect(result.current.type).toBe(StatusEnum.PENDING);
    act(() => source$.next(7));
    expect(result.current).toEqual({ type: StatusEnum.FULFILLED, value: 7 });
  });

  it("resolves a synchronous non-marked observable to FULFILLED without a pending flash", async () => {
    // hoisted: source$ must be referentially stable across renders (see usePending JSDoc) —
    // a completing observable recreated inline would restart pending→fulfilled forever
    const source$ = of(7);
    const { result } = renderHook(() => usePending(source$));
    expect(result.current).toEqual({ type: StatusEnum.FULFILLED, value: 7 });
  });
});
