import React, { act } from "react";
import PQueue from "p-queue";
import { of } from "rxjs";
import { createAtom, createState, createStore } from "rxfy";
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { getErrorMessage } from "rxfy-utils/common";
import { Edge } from "./index";

describe("Edge", () => {
  it("should render proper status with no data and with data persisted in store", async () => {
    const queue = new PQueue({ concurrency: 1, autoStart: false });
    const state = createAtom(createState({}));
    const store = createStore(queue, state);
    const userStore = store.factory("users", (id) => of({ id }));
    const edge = userStore.get("test");

    function getRendererd() {
      return render(
        <Edge
          edge={edge}
          pending={<div data-testid="pending" />}
          rejected={(x) => <div data-testid="rejected" data-error={getErrorMessage(x)} />}
          children={(x) => (
            <div key={x.id} data-testid="fulfilled">
              {x.id}
            </div>
          )}
        />,
      );
    }

    const firstRender = getRendererd();

    expect(firstRender.getByTestId("pending")).toBeInTheDocument();
    await act(() => queue.start().onIdle());
    expect(firstRender.getByTestId("fulfilled")).toBeInTheDocument();

    firstRender.unmount();

    const secondRender = getRendererd();
    expect(secondRender.getByTestId("fulfilled")).toBeInTheDocument();
  });
});
