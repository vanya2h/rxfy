import type { ModelDescriptor, ModelStore } from "rxfy";
import { useModelRegistry } from "./registry-context.js";

export function useModelStore<T>(descriptor: ModelDescriptor<T>): ModelStore<T> {
  const registry = useModelRegistry();
  return registry.model(descriptor);
}
