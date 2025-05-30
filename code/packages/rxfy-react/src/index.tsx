import { IEdge, StatusEnum } from "rxfy";
import { useEffect, useState } from "react";

export function useEdge<TData>(edge: IEdge<TData>) {
  const [state, setState] = useState(edge.subject$.get());

  useEffect(() => {
    const sub = edge.subject$.subscribe((x) => setState(x));
    return () => sub.unsubscribe();
  }, [edge]);

  return state;
}

type IEdgeProps<TData> = {
  edge: IEdge<TData>;
  children: IRenderFn<TData>;
  rejected?: IRenderFn<unknown>;
  pending?: React.ReactNode;
};

export function Edge<TData>({ edge, children, rejected = null, pending = null }: IEdgeProps<TData>) {
  const state = useEdge(edge);

  switch (state.type) {
    case StatusEnum.REJECTED:
      return renderWithParams(rejected, state.error);
    case StatusEnum.FULFILLED:
      return renderWithParams(children, state.value);
    default:
      return pending;
  }
}

export type IRenderFn<TData> = React.ReactNode | ((data: TData) => React.ReactNode);

function renderWithParams<TData>(fn: IRenderFn<TData>, data: TData): React.ReactNode {
  if (typeof fn === "function") {
    return fn(data);
  }
  return fn;
}
