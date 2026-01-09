import { atom, createStore } from "jotai";

export const store = createStore();
export const counter = atom(0);

store.set(counter, 1);
