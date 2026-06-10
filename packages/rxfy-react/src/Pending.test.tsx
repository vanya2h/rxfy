import { render, screen } from "@testing-library/react";
import { Subject } from "rxjs";
import { describe, expect, it } from "vitest";
import { Pending } from "./Pending.js";

describe("Pending", () => {
  it("shows pending state before observable emits", () => {
    const subject = new Subject<string>();
    render(
      <Pending value$={subject.asObservable()} pending={<div data-testid="loading" />}>
        {(val) => <div data-testid="done">{val}</div>}
      </Pending>,
    );
    expect(screen.getByTestId("loading")).toBeInTheDocument();
  });

  it("shows fulfilled value after observable emits", async () => {
    const subject = new Subject<string>();
    render(
      <Pending value$={subject.asObservable()} pending={<div data-testid="loading" />}>
        {(val) => <div data-testid="done">{val}</div>}
      </Pending>,
    );
    subject.next("hello");
    expect(await screen.findByTestId("done")).toHaveTextContent("hello");
  });

  it("renders immediately with getDefaultValue", () => {
    const subject = new Subject<string>();
    render(
      <Pending value$={subject.asObservable()} getDefaultValue={() => "default"}>
        {(val) => <div data-testid="done">{val}</div>}
      </Pending>,
    );
    expect(screen.getByTestId("done")).toHaveTextContent("default");
  });
});
