import { render, screen } from "@testing-library/react";
import { createModel, createModelRegistry, type StoreKey } from "rxfy";
import { expect, it } from "vitest";
import { z } from "zod";
import { StoreProvider } from "./StoreProvider.js";
import { useModelStoreValue } from "./useModelStoreValue.js";

const cat = createModel({
  schema: z.object({ id: z.string(), name: z.string() }),
  getKey: (c) => c.id,
  name: "uv-cat",
});

function Name({ id }: { id: StoreKey<{ id: string; name: string }> | null }) {
  const c = useModelStoreValue(cat, id);
  return <span>{c ? c.name : "—"}</span>;
}

it("renders a fallback when absent and the value once present", () => {
  const registry = createModelRegistry(cat);
  registry.model(cat).set("c1", { id: "c1", name: "News" });
  render(
    <StoreProvider registry={registry}>
      <Name id={"c1" as StoreKey<{ id: string; name: string }>} />
      <Name id={null} />
    </StoreProvider>,
  );
  expect(screen.getByText("News")).toBeTruthy();
  expect(screen.getByText("—")).toBeTruthy();
});
