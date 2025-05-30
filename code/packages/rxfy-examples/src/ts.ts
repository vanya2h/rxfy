import PQueue from "p-queue";
import { of } from "rxjs";
import { createAtom, createState, createStore } from "rxfy";

const queue = new PQueue({ concurrency: 5 });
const state = createAtom(createState({}));
const store = createStore(queue, state);
const userStore = store.factory("users", (id) => of({ id }));
const user$ = userStore.get("42").toObservable();
user$.subscribe((x) => console.log(x));
