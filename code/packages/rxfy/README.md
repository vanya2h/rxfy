# rxfy

rxfy (/ɑɹ ɪks faɪ/) — stream-based data management. it utilizes rxjs under the hood.

# install

`pnpm install rxfy`

# api

- Atom — BehaviorSubject successor
- Lens — lensed atom with getter and setter
- Store — where all the data stored
- Edge — data handler and accessor

# example

```ts
import PQueue from "p-queue";
import { of } from "rxjs";
import { createAtom, createState, createStore } from "rxfy";

const queue = new PQueue({ concurrency: 5 });
const state = createAtom(createState({}));
const store = createStore(queue, state);
const userStore = store.factory("users", (id) => of({ id }));
const user$ = userStore.get("42").toObservable();
user$.subscribe((x) => console.log(x));
```
