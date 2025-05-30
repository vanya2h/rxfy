import { Subject } from "rxjs";
import { batcher } from "./index.js";

vi.useFakeTimers();

describe("batcher operator", () => {
  it("should batch emitted values within the wait time", () => {
    const source = new Subject<number>();
    const result: number[][] = [];

    source.pipe(batcher(1000)).subscribe((x) => result.push(x.next));

    source.next(1);
    source.next(2);
    vi.advanceTimersByTime(1000);

    expect(result).toEqual([[1, 2]]);
  });

  it("should emit remaining values on completion", () => {
    const source = new Subject<number>();
    const result: number[][] = [];

    source.pipe(batcher(1000)).subscribe((x) => result.push(x.next));

    source.next(1);
    source.next(2);
    source.complete();

    expect(result).toEqual([[1, 2]]);
  });

  it("should not emit an empty batch if no values are emitted", () => {
    const source = new Subject<number>();
    const result: number[][] = [];

    source.pipe(batcher(1000)).subscribe((x) => result.push(x.next));

    vi.advanceTimersByTime(1000);
    source.complete();

    expect(result).toEqual([]);
  });

  it("should handle multiple batches correctly", () => {
    const source = new Subject<number>();
    const result: number[][] = [];

    source.pipe(batcher(1000)).subscribe((x) => result.push(x.next));

    source.next(1);
    source.next(2);
    vi.advanceTimersByTime(1000);

    source.next(3);
    source.next(4);
    vi.advanceTimersByTime(1000);

    expect(result).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("should handle `0` as a valid value in the batch", () => {
    const source = new Subject<number>();
    const result: number[][] = [];

    source.pipe(batcher(1000)).subscribe((x) => result.push(x.next));

    source.next(0);
    source.next(1);
    vi.advanceTimersByTime(1000);

    expect(result).toEqual([[0, 1]]);
  });

  it("should clean up properly on unsubscribe", () => {
    const source = new Subject<number>();
    const result: number[][] = [];
    const subscription = source.pipe(batcher(1000)).subscribe((x) => result.push(x.next));

    source.next(1);
    subscription.unsubscribe();

    vi.advanceTimersByTime(1000);
    source.next(2);

    expect(result).toEqual([]);
  });
});
