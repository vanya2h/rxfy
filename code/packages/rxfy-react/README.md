# rxfy-react

`rxfy-react` — official bindings of `rxfy` for `react`

# install

`pnpm install rxfy-react`

# api

- useEdge — use edge state
- <Edge /> — useEdge wrapped with render props pattern

# example

```tsx
import PQueue from "p-queue";
import { useMemo } from "react";
import { of } from "rxjs";
import { createAtom, createState, createStore } from "rxfy";
import { Edge } from "rxfy-react";

const queue = new PQueue({ concurrency: 5 });
const state = createAtom(createState({}));
const store = createStore(queue, state);
const userStore = store.factory("users", (id) => of({ id }));

export function User({ userId }: { userId: string }) {
  const user = useMemo(() => userStore.get(userId), [userId]);
  return (
    <Edge edge={user} pending={<span>Loading..</span>} rejected={(err) => <span>{JSON.stringify(err)}</span>}>
      {(user) => <div key={user.id}>{user.id}</div>}
    </Edge>
  );
}
```
