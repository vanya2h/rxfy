import { fireEvent, render, screen } from "@testing-library/react";
import { useMemo } from "react";
import { createLens, createModel, createModelRegistry, keyLens } from "rxfy";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ModelRegistryContext } from "./registry-context.js";
import { useAtom } from "./useAtom.js";
import { useModelStore } from "./useModelStore.js";

type PostT = { id: string; title: string };
const Post = createModel<PostT, string>({
  schema: z.object({ id: z.string(), title: z.string() }),
  getKey: (p) => p.id,
  name: "post",
});

function TitleInput({ id }: { id: string }) {
  const store = useModelStore(Post);
  const post$ = store.get(id); // the entity's cell — stable across renders
  const title$ = useMemo(() => createLens(post$, keyLens<PostT, "title">("title")), [post$]);
  const [title, setTitle] = useAtom(title$);
  return <input aria-label="title" value={title} onChange={(e) => setTitle(e.target.value)} />;
}

function TitleLabel({ id }: { id: string }) {
  const store = useModelStore(Post);
  const post$ = store.get(id); // the entity's cell — stable across renders
  const [post] = useAtom(post$);
  return <span data-testid="label">{post.title}</span>;
}

describe("two-way form sync", () => {
  it("editing an input propagates to an independent subscriber of the same entity", () => {
    const registry = createModelRegistry();
    registry.model(Post).set("p1", { id: "p1", title: "Hello" });
    render(
      <ModelRegistryContext.Provider value={registry}>
        <TitleInput id="p1" />
        <TitleLabel id="p1" />
      </ModelRegistryContext.Provider>,
    );
    expect(screen.getByTestId("label").textContent).toBe("Hello");

    fireEvent.change(screen.getByLabelText("title"), { target: { value: "World" } });

    expect(screen.getByTestId("label").textContent).toBe("World");
    expect((screen.getByLabelText("title") as HTMLInputElement).value).toBe("World");
    expect(registry.model(Post).getValue("p1")).toEqual({ id: "p1", title: "World" });
  });
});
