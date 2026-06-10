import { type PropsWithChildren, useState } from "react";
import { createModelRegistry } from "rxfy";
import { ModelRegistryContext } from "./registry-context.js";

export function StoreProvider({ children }: PropsWithChildren) {
  const [registry] = useState(() => createModelRegistry());
  return <ModelRegistryContext.Provider value={registry}>{children}</ModelRegistryContext.Provider>;
}
