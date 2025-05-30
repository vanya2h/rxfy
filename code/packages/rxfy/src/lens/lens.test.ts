import { describe, it, expect, vi, beforeEach } from "vitest";
import { get as getValue, set as setValue } from "lodash";
import { createLens, ILens } from "./lens.js";
import { Atom, createAtom } from "../atom/atom.js";
import { Subscription } from "rxjs";

function createData() {
  return {
    user: {
      name: "Alice",
      age: 30,
    },
    settings: {
      theme: "dark",
    },
  };
}

type IData = ReturnType<typeof createData>;

describe("Lens", () => {
  let root$: Atom<IData>;

  beforeEach(() => {
    root$ = createAtom(createData());
  });

  const nameLens: ILens<IData, string> = {
    get: (source) => getValue(source, ["user", "name"]),
    set: (value, source) => setValue(source, ["user", "name"], value),
  };

  it("should emit initial value from root", () => {
    const name$ = createLens(root$, nameLens);
    const spy = vi.fn();

    const sub = name$.subscribe(spy);
    expect(spy).toHaveBeenCalledWith("Alice");

    sub.unsubscribe();
  });

  it("should update when root changes", () => {
    const name$ = createLens(root$, nameLens);
    const values: string[] = [];

    const sub = name$.subscribe((val) => values.push(val));
    root$.set(setValue(root$.get(), ["user", "name"], "Bob"));

    expect(values).toEqual(["Alice", "Bob"]);
    sub.unsubscribe();
  });

  it("should update root when lens changes", () => {
    const name$ = createLens(root$, nameLens);

    const sub = name$.subscribe();
    name$.set("Charlie");

    expect(getValue(root$.get(), ["user", "name"])).toBe("Charlie");
    sub.unsubscribe();
  });

  it("should not emit duplicate values from root changes", () => {
    const name$ = createLens(root$, nameLens);
    const spy = vi.fn();

    const sub = name$.subscribe(spy);
    // Emit same value
    root$.set(setValue(root$.get(), ["user", "name"], "Alice"));
    expect(spy).toHaveBeenCalledTimes(1); // Only initial call
    sub.unsubscribe();
  });

  it.skip("should teardown subscriptions after last unsubscribe", () => {
    const name$ = createLens(root$, nameLens);
    const sub = new Subscription();

    sub.add(name$.subscribe());
    sub.add(name$.subscribe());

    expect((name$ as any).subCount).toEqual(2);
    expect((name$ as any).sub).toBeDefined();
    sub.unsubscribe();
    // @todo here is the problem
    expect((name$ as any).subCount).toEqual(0);
    expect((name$ as any).sub).toBeUndefined();
  });
});
