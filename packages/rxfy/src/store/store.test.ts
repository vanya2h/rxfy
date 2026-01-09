import PQueue from "p-queue";
import { of } from "rxjs";
import { createState, createStore } from "./store.js";
import { createAtom } from "../atom/atom.js";

const mockBatch = vi.fn((ids: string[]) =>
  of(ids.reduce((acc, id) => ({ ...acc, [id]: { id } }), {} as Record<string, { id: string }>)),
);

describe("createStore", () => {
  it("should create and return an Edge from factoryBatch", async () => {
    const queue = new PQueue({
      concurrency: 5,
      autoStart: false,
    });

    const state = createAtom(createState({}));
    const store = createStore(queue, state);
    const userNode = store.node("user", (userNode) => {
      const userStore = userNode.factoryBatch("users", mockBatch);
      return userNode;
    });

    const userSub = userStore.get("42").subject$.subscribe();

    await store.collect();
    const value = JSON.stringify(state.get(), null, 2);
    expect(value).toMatchInlineSnapshot(`
      "{
        "value": {
          "user": {
            "value": {
              "users": {
                "value": {
                  "42": {
                    "value": {
                      "type": "FULFILLED",
                      "value": {
                        "id": "42"
                      }
                    },
                    "brand": "edge"
                  }
                },
                "brand": "map"
              }
            },
            "brand": "store"
          }
        },
        "brand": "store"
      }"
    `);

    userSub.unsubscribe();
  });
});
