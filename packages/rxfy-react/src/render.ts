export type IRenderable<TData> = React.ReactNode | ((data: TData) => React.ReactNode);

export function render<TData>(data: TData, renderable: IRenderable<TData>): React.ReactNode {
  if (typeof renderable === "function") {
    return renderable(data);
  }
  return renderable;
}
