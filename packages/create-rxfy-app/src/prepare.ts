type PackageJson = Record<string, unknown> & {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/**
 * Replace every `workspace:*` range with `^<published version>` so a scaffolded app
 * installs the rxfy release this CLI build was cut against.
 */
export function rewriteWorkspaceDeps(pkg: PackageJson, versions: Record<string, string>): PackageJson {
  const out = structuredClone(pkg);
  for (const field of ["dependencies", "devDependencies", "peerDependencies"] as const) {
    const deps = out[field];
    if (!deps) continue;
    for (const [name, range] of Object.entries(deps)) {
      if (!range.startsWith("workspace:")) continue;
      const version = versions[name];
      if (!version) throw new Error(`No published version known for workspace dependency "${name}"`);
      deps[name] = `^${version}`;
    }
  }
  return out;
}
