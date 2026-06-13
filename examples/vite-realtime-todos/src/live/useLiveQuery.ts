import { useEffect, useId } from "react";
import type { ModelDescriptor } from "rxfy";
import { useLiveClient } from "./LiveProvider.tsx";

export function useLiveQuery<T>(model: ModelDescriptor<T>, ids: string[]) {
  const client = useLiveClient();
  const sliceKey = useId();
  const topics = model.name ? ids.map((id) => `${model.name}:${id}`) : [];
  const idsKey = topics.join("\n"); // primitive effect dep that tracks the id set

  useEffect(() => {
    if (!client) return;
    return () => client.clearSlice(sliceKey);
  }, [client, sliceKey]);

  useEffect(() => {
    if (!client) return;
    client.setSlice(sliceKey, topics);
    // topics is recomputed each render; idsKey is the stable primitive that captures it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, sliceKey, idsKey]);
}
