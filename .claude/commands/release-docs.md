Generate release documentation by analyzing changes since the last release, then open a pull request.

**Important:** This command must be run from the `staging` branch (releases promote `staging` → `main`). Verify the current branch is `staging` before proceeding. If not on `staging`, stop and tell the user.

Follow these steps:

1. Determine today's date in ISO format: `date +%Y-%m-%d`. This is `{date}`.

2. Find the last release point. Try these in order:

   - **Git tags** — `changeset publish` creates per-package tags like `rxfy@0.2.1`. If any exist, use the most recent:
     ```
     git tag -l "rxfy@*" "rxfy-react@*" "rxfy-utils@*" --sort=-version:refname | head -5
     ```
   - **Version commit** — otherwise find the most recent changesets version bump commit (default message `Version Packages`):
     ```
     git log --oneline -50 --grep="Version Packages"
     ```
   - If neither exists (first release), use the repo's first commit.

   Call the resolved hash/tag `<last-release-ref>`.

3. Run `git log <last-release-ref>..HEAD --oneline` to get all commits since the last release.

4. Run `git diff <last-release-ref>..HEAD --name-only` to get all changed files.

5. Read each pending changeset file in `.changeset/` (ignore `README.md` and `config.json`) to understand which packages are being bumped and what kind of changes they contain.

6. For each meaningfully changed source file (ignore `CHANGELOG.md`, `package.json` version fields, lockfiles, and changeset files), run `git diff <last-release-ref>..HEAD -- <file>` to understand the actual code changes. Focus on:
   - New exports, functions, types, or modules added
   - Breaking changes (removed or renamed exports, changed signatures)
   - Bug fixes
   - Dependency changes

7. Create the directory `docs/releases/` if it doesn't exist.

8. Write a file at `docs/releases/{date}.md` with the following structure:

```markdown
# Release {date}

## Packages

| Package | Version |
| ------- | ------- |
| `rxfy` | `0.3.0` |

<!-- List every package being published in this release with its new version.
     Derive each new version from: the package's current version in its
     packages/<pkg>/package.json + the highest bump type for that package
     across the pending changesets (patch / minor / major). -->

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

   The publishable packages are `rxfy`, `rxfy-react`, and `rxfy-utils`. Packages under `examples/` and `apps/` are private and are never released.

9. Omit any section that has no entries rather than leaving it empty.

10. Keep descriptions concise but informative. Reference specific files/modules when relevant.

11. Create a new branch named `release/{date}` from the current branch and push it:

    ```
    git checkout -b release/{date}
    git add docs/releases/{date}.md
    git commit -m "docs: add release notes for {date}"
    git push -u origin release/{date}
    ```

12. Read the content of `docs/releases/{date}.md` and create a pull request using the `gh` CLI with:
    - Title: `Release {date}`
    - Base branch: `main`
    - Body: the full content of the release notes file

    ```
    gh pr create --title "Release {date}" --base main --body "$(cat docs/releases/{date}.md)"
    ```

13. Return the PR URL to the user.
