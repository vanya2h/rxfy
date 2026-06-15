Generate release documentation by analyzing changes since the last release, then open a pull request.

**Important:** This command must be run from the `staging` branch (releases promote `staging` → `main`). Verify the current branch is `staging` before proceeding. If not on `staging`, stop and tell the user.

Follow these steps:

1. Determine the release version. Read `packages/rxfy/package.json` and extract the `version` field. This is `{version}`.
   - If the version contains a pre-release suffix (e.g. `1.1.0-rc.1`), strip it to get the stable version (e.g. `1.1.0`). Use the stable version as `{version}`.
   - If the version has no pre-release suffix, apply the highest bump type from the pending changesets (patch / minor / major) to derive the next version. Use that as `{version}`.

2. Find the last release point. Try these in order:

   - **Git tags** — `changeset publish` creates per-package tags like `rxfy@0.2.1`. Sort by date (not version) to get the most recently created tag:
     ```
     git tag -l "rxfy@*" "rxfy-react@*" --sort=-creatordate | head -5
     ```
     Use the most recently created stable tag (ignore pre-release tags like `rxfy@1.1.0-rc.1`) as `<last-release-ref>`.
   - **Version commit** — otherwise find the most recent changesets version bump commit (default message `Version Packages`):
     ```
     git log --oneline -50 --grep="Version Packages"
     ```
   - If neither exists (first release), use the repo's first commit.

   Call the resolved hash/tag `<last-release-ref>`.

3. Run `git log <last-release-ref>..HEAD --oneline` to get all commits since the last release.

4. Run `git diff <last-release-ref>..HEAD --name-only` to get all changed files.

5. Read each pending changeset file in `.changeset/` (ignore `README.md`, `config.json`, and `pre.json`) to understand which packages are being bumped and what kind of changes they contain.

6. For each meaningfully changed source file (ignore `CHANGELOG.md`, `package.json` version fields, lockfiles, and changeset files), run `git diff <last-release-ref>..HEAD -- <file>` to understand the actual code changes. Focus on:
   - New exports, functions, types, or modules added
   - Breaking changes (removed or renamed exports, changed signatures)
   - Bug fixes
   - Dependency changes

7. Create the directory `docs/releases/` if it doesn't exist.

8. Write a file at `docs/releases/{version}.md` with the following structure:

```markdown
# Release {version}

## Packages

| Package | Version |
| ------- | ------- |
| `rxfy` | `{version}` |

<!-- List every package being published in this release with its new version. -->

## Highlights

<!-- 2-3 sentence summary of the most important changes -->

## Changes

### New Features

<!-- List new features with brief descriptions. Reference the relevant source files. -->

### Bug Fixes

<!-- List bug fixes. Omit this section if there are none. -->

### Breaking Changes

<!-- List breaking changes with migration instructions. Omit this section if there are none. -->

### Dependencies

<!-- Note any dependency additions, removals, or version bumps. Omit if none. -->
```

   The publishable packages are `rxfy` and `rxfy-react`. Packages under `examples/` and `apps/` are private and are never released.

9. Omit any section that has no entries rather than leaving it empty.

10. Keep descriptions concise but informative. Reference specific files/modules when relevant.

11. Create a new branch named `release/{version}` from the current branch and push it:

    ```
    git checkout -b release/{version}
    git add docs/releases/{version}.md
    git commit -m "docs: add release notes for {version}"
    git push -u origin release/{version}
    ```

12. Read the content of `docs/releases/{version}.md` and create a pull request using the `gh` CLI with:
    - Title: `Release {version}`
    - Base branch: `main`
    - Body: the full content of the release notes file

    ```
    gh pr create --title "Release {version}" --base main --body "$(cat docs/releases/{version}.md)"
    ```

13. Return the PR URL to the user.
