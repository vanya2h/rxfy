import { useMemo } from "react";
import { useModelStore, useObservable } from "rxfy-react";
import { combineLatest, of } from "rxjs";
import { type Card, type CardId, cardModel } from "./models";

/** Reactively read the given card ids as entities; re-emits when any card cell changes (e.g. a patch). */
export function useCards(ids: CardId[]): Card[] {
  const store = useModelStore(cardModel);
  const key = ids.join(",");
  const source$ = useMemo(
    () => (ids.length === 0 ? of([] as Card[]) : combineLatest(ids.map((id) => store.get(id)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, key],
  );
  const initial = useMemo(
    () => ids.map((id) => store.getValue(id)).filter((c): c is Card => c != null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store, key],
  );
  return useObservable(source$, initial);
}
