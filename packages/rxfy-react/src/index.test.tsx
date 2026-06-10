import { render, screen } from "@testing-library/react";
import PQueue from "p-queue";
import React, { act } from "react";
import { createAtom, createEdge, createIdle, IEdgeState } from "rxfy";
import { of } from "rxjs";
import { describe, expect, it } from "vitest";
import { Edge } from "./index.js";

describe("Edge", () => {
  it("renders pending then fulfilled once edge resolves", async () => {
    const queue = new PQueue({ concurrency: 1, autoStart: false });
    const state$ = createAtom<IEdgeState<{ id: string }>>(createIdle());
    const edge = createEdge(state$, queue, () => of({ id: "test" }));

    render(
      <Edge edge={edge} pending={<div data-testid="pending" />} rejected={() => <div data-testid="rejected" />}>
        {(x) => <div data-testid="fulfilled">{x.id}</div>}
      </Edge>,
    );

    expect(screen.getByTestId("pending")).toBeInTheDocument();
    await act(() => queue.start().onIdle());
    expect(screen.getByTestId("fulfilled")).toHaveTextContent("test");
  });
});
