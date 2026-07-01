let setPath: ((p: string) => void) | undefined;

/** App binds its path setter here so any component can navigate without prop-drilling. */
export function bindNavigation(fn: (p: string) => void): () => void {
  setPath = fn;
  return () => {
    if (setPath === fn) setPath = undefined;
  };
}

export function navigate(path: string): void {
  history.pushState(null, "", path);
  setPath?.(path);
}
