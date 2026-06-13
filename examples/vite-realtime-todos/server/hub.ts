import type { WSContext } from "hono/ws";

// One set of dependency topics per connection — the entire subscription state.
// topic = `${model.name}:${id}`, e.g. "todo:1".
const deps = new Map<WSContext, Set<string>>();

export function addClient(ws: WSContext) {
  deps.set(ws, new Set());
}

export function removeClient(ws: WSContext) {
  deps.delete(ws);
}

export function addDeps(ws: WSContext, topics: string[]) {
  const set = deps.get(ws);
  if (set) for (const topic of topics) set.add(topic);
}

export function removeDeps(ws: WSContext, topics: string[]) {
  const set = deps.get(ws);
  if (set) for (const topic of topics) set.delete(topic);
}

// Push one entity to the connections whose dependency set includes it. O(connections).
export function publish(name: string, id: string, entity: unknown) {
  const topic = `${name}:${id}`;
  const message = JSON.stringify({ name, entities: [entity] });
  for (const [ws, set] of deps) {
    if (!set.has(topic)) continue;
    try {
      ws.send(message);
    } catch {
      // connection is closing; its onClose will reap it
    }
  }
}
