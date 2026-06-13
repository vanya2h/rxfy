import { useEffect, useId } from "react";
import type { ModelDescriptor } from "rxfy";
import { useLiveClient } from "./LiveProvider.tsx";

export function useLiveQuery<T>(model: ModelDescriptor<T>, ids: string[]) {
  const client = useLiveClient();
  const sliceKey = useId();
  // Primitive key keeps the effect deps simple and exhaustive-deps happy.
  const topicsKey = model.name ? ids.map((id) => `${model.name}:${id}`).join(",") : "";

  useEffect(() => {
    if (!client) return;
    return () => client.clearSlice(sliceKey);
  }, [client, sliceKey]);

  useEffect(() => {
    if (!client) return;
    client.setSlice(sliceKey, topicsKey ? topicsKey.split(",") : []);
  }, [client, sliceKey, topicsKey]);
}
