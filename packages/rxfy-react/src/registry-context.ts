import { createContext, useContext } from "react";
import type { IModelRegistry } from "rxfy";

export const ModelRegistryContext = createContext<IModelRegistry | null>(null);

export function useModelRegistry(): IModelRegistry {
  const ctx = useContext(ModelRegistryContext);
  if (!ctx) throw new Error("StoreProvider not found");
  return ctx;
}
