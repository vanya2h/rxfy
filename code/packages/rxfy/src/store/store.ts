import PQueue from "p-queue";
import { Map as IM } from "immutable";
import { EMPTY, map, Observable, of, scan, shareReplay, Subject, switchMap } from "rxjs";
import { createEdge, IBranded, IEdge, IEdgeJS, toBranded } from "../edge/edge.js";
import { createIdle } from "../wrapped/wrapped.js";
import { batcher } from "../batcher/index.js";
import { createLens, keyLens } from "../lens/lens.js";
import { IAtom } from "../atom/atom.js";

export type IMapJS = IBranded<"map", { [K in string]: IMapJS | IEdgeJS<unknown> }>;

export type IStoreState = { [K in string]: IStoreStateJS | IMapJS | IEdgeJS<unknown> };

export type IStoreStateJS = IBranded<"store", IStoreState>;

export type IFactory<TData> = {
  get: (key: string) => IEdge<TData>;
};

export type IStore<TState extends IStoreStateJS> = {
  state$: IAtom<TState>;
  collect: () => Promise<void>;
  node: (name: string, project: (store: IStore<IStoreStateJS>) => IStore<IStoreStateJS>) => IStore<IStoreStateJS>;
  factory: <TData>(name: string, loader: (key: string) => Observable<TData>) => IFactory<TData>;
  factoryBatch: <TData>(name: string, batch: (key: string[]) => Observable<Record<string, TData>>) => IFactory<TData>;
};

export function createState(val: IStoreState): IStoreStateJS {
  return toBranded("store", val);
}

export function createStore<TState extends IStoreStateJS>(queue: PQueue, state$: IAtom<TState>): IStore<TState> {
  return {
    state$: state$,
    collect: () => queue.start().onIdle(),
    node: (name: string, project: (node: IStore<IStoreStateJS>) => IStore<IStoreStateJS>) => {
      const lens = createLens(state$, {
        get: (x) => (x.value[name] as IStoreStateJS) ?? toBranded("store", {}),
        set: (x, xs) => ({
          ...xs,
          value: { ...xs.value, [name]: x },
        }),
      });
      return project(createStore(queue, lens));
    },
    factory: <TData>(name: string, loader: (key: string) => Observable<TData>) => {
      const cache = IM<string, IEdge<TData>>().asMutable();

      return {
        get: (key: string) => {
          if (!cache.has(key)) {
            const lens = createLens(
              createLens(state$, {
                get: (x) => {
                  const value = x.value[name] as IEdgeJS<TData>;
                  return value ?? toBranded("edge", createIdle());
                },
                set: (x, xs) => ({
                  ...xs,
                  value: { ...xs.value, [name]: x },
                }),
              }),
              keyLens("value"),
            );
            const edge = createEdge(lens, queue, () => loader(key));
            cache.set(key, edge);
          }

          return cache.get(key) as IEdge<TData>;
        },
      };
    },
    factoryBatch: <TData>(name: string, batch: (key: string[]) => Observable<Record<string, TData>>) => {
      const lens = createLens(state$, {
        get: (x) => (x.value[name] as IMapJS) ?? toBranded("map", {}),
        set: (x, xs) => ({
          ...xs,
          value: { ...xs.value, [name]: x },
        }),
      });
      return createFactory(batch, queue, lens);
    },
  };
}

function createFactory<TData>(
  batch: (key: string[]) => Observable<Record<string, TData>>,
  queue: PQueue,
  state$: IAtom<IMapJS>,
) {
  const cache = IM<string, IEdge<TData>>().asMutable();
  const keys$ = new Subject<string>();

  const map$ = keys$.pipe(
    batcher(250),
    switchMap(({ next, loaded }) => batch(subtractArrays(next, loaded))),
    scan((acc, val) => ({ ...acc, ...val }), {} as Record<string, TData>),
    shareReplay(1),
  );

  map$.subscribe();

  return {
    get: (key: string) => {
      if (!cache.has(key)) {
        keys$.next(key);

        const lens = createLens(
          createLens(state$, {
            get: (x) => {
              const value = x.value[key] as IEdgeJS<TData>;
              return value ?? toBranded("edge", createIdle());
            },
            set: (x, xs) => ({
              ...xs,
              value: { ...xs.value, [key]: x },
            }),
          }),
          keyLens("value"),
        );
        const edge = createEdge(lens, queue, () =>
          map$.pipe(
            map((x) => x[key]),
            switchMap((x) => (x ? of(x) : EMPTY)),
          ),
        );
        cache.set(key, edge);
      }

      return cache.get(key) as IEdge<TData>;
    },
  };
}

function subtractArrays(arrayA: string[], arrayB: string[]) {
  return arrayA.filter((item) => !arrayB.includes(item));
}
