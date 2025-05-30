import PQueue from "p-queue";
import { of } from "rxjs";
import { createAtom, createState, createStore, IStore, IStoreStateJS } from "rxfy";
import { createContext, PropsWithChildren, useContext, useMemo } from "react";

export type IStoreContextProps<TInterface> = {
  store: TInterface;
};

export type IStoreConfig<TInterface> = {
  getInitial: (initial: IStore<IStoreStateJS>) => TInterface;
  queue?: PQueue;
};

export type IStoreProviderProps<TInterface> = PropsWithChildren & {
  config: IStoreConfig<TInterface>;
};

export function createStoreFactory<TInterface>(config: IStoreConfig<TInterface>) {
  const queue = config.queue ?? new PQueue({ concurrency: 5, autoStart: false });
  const initial = createStore(queue, createAtom(createState({})));
  const storeContext = createContext<IStoreContextProps<TInterface> | null>(null);

  function StoreProvider({ config, children }: IStoreProviderProps<TInterface>) {
    const store = useMemo(() => config.getInitial(initial), [config]);
    return <storeContext.Provider value={{ store: store }} children={children} />;
  }

  function useStore() {
    const ctx = useContext(storeContext);
    if (!ctx) throw new Error("StoreProvider is not found");
    return ctx.store;
  }

  return {
    StoreProvider,
    useStore,
  };
}

const test = createStoreFactory({
  getInitial: (store) => {
    const userNode = store.node("users");
    const usersEntries = userNode.factory("userEntries", () => of("1"));
    return {
      users: {
        usersEntries,
      },
    };
  },
});
