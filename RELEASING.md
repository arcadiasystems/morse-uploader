# Releasing

`@arcadiasystems/morse-uploader` is published to npm by [`.github/workflows/release.yml`](./.github/workflows/release.yml) when a tag `v<version>` is pushed. Nobody runs `npm publish` by hand, and there is no npm token in the repository: the workflow authenticates with npm [Trusted Publishing](https://docs.npmjs.com/trusted-publishers) (OIDC).

This covers the library only. The Uploader app in `apps/uploader` is deployed by Vercel and has no version to release.

## Steps

1. **Bump the version and the CHANGELOG in a pull request.** Set `version` in `package.json` and add a `## [<version>] - <date>` section at the top of `CHANGELOG.md`. `bun run docs-gate` fails when the CHANGELOG's newest entry is not that version, or when the README names a different morse-sdk minor than the peer range. Only `major.minor.patch` versions are released by the workflow; a prerelease tag does not start it.
2. **Merge the pull request into `main`.**
3. **Tag the merge commit and push the tag.** The tag is `v` followed by the version exactly as `package.json` has it.

   ```sh
   git switch main && git pull --ff-only
   git tag v0.5.0
   git push origin v0.5.0
   ```

4. **Wait for `verify and pack` to pass, then approve the `npm-publish` environment.** The run stops at the `publish to npm` job until a required reviewer approves it under Actions, in the run's "Review deployments" prompt. The tarball that will be published is attached to the run as the `package` artifact, so it can be downloaded and inspected before approving.
5. **Check the result.** `npm view @arcadiasystems/morse-uploader version` shows the new version, the package page on npmjs.com shows a provenance badge, and the repository has a GitHub Release for the tag with the CHANGELOG section as its notes.

## What the workflow checks

The `verify and pack` job runs first and cannot publish. It stops the release unless all of these hold:

- The tagged commit is an ancestor of `origin/main`. A tag on an unmerged branch is refused.
- The tag equals `v` plus the `version` in `package.json`, and `package.json` names `@arcadiasystems/morse-uploader`.
- The version is not on the npm registry yet. The registry must answer 404 for it; 200 means it is already published, and any other answer stops the release because nothing is known.
- `CHANGELOG.md` has a non-empty section for the version (`bun scripts/changelog-section.ts <version>`).
- `bun install --frozen-lockfile` succeeds, and `bun run prepublishOnly` passes: lint, typecheck, the docs gate, the tests, the build and the exports check.

It then runs `npm pack` and uploads the tarball. The `publish to npm` job downloads that tarball, checks that npm is at least 11.5.1, and runs `npm publish` on it. Nothing is installed or built in the job that holds the OIDC permission. npm attaches a provenance attestation automatically because the package and the repository are both public.

The last job creates the GitHub Release from the version's CHANGELOG section. If a release for the tag already exists, for example a draft written by hand, the workflow replaces its notes with the CHANGELOG section and publishes it.

## If a run fails

- **Before the publish:** fix the cause on `main` by pull request. If the fix changes the commit to release, the tag has to move, which means deleting and pushing it again by hand. If the commit is right and the failure was transient, re-run the failed jobs.
- **At the publish:** an `ENEEDAUTH` error means npm did not accept the workflow's identity. Check the trusted publisher on npmjs.com against the values below; every field is case sensitive, and npm does not validate them when they are saved.
- **After the publish:** the version is on npm and cannot be replaced. Re-run only the `create the GitHub Release` job. Re-running the whole workflow stops at the registry check, as it should.

## One-time setup

### npm

On npmjs.com, open the package `@arcadiasystems/morse-uploader`, then Settings, then Trusted Publisher, and add a GitHub Actions publisher with:

| Field | Value |
|---|---|
| Organization or user | `arcadiasystems` |
| Repository | `morse-uploader` |
| Workflow filename | `release.yml` |
| Environment name | `npm-publish` |
| Allowed actions | allow `npm publish` |

Notes from the [npm documentation](https://docs.npmjs.com/trusted-publishers), as of November 2026:

- Trusted Publishing needs npm 11.5.1 or later on Node 22.14.0 or later, on a GitHub-hosted runner. The workflow installs Node 24 and refuses an older npm.
- A new publisher allows only `npm stage publish` unless `npm publish` is also allowed. The workflow publishes directly, so allow it.
- A new publisher must complete its first successful publish within 2 days, or it expires and has to be deleted and created again. Create it shortly before the first release.
- `repository.url` in `package.json` must match this repository. It does.
- Renaming `release.yml` or the `npm-publish` environment breaks the match until the publisher is deleted and created again with the new name. A publisher cannot be edited.

Once a release has gone through, npm recommends setting the package's Publishing access to "Require two-factor authentication and disallow tokens" and revoking any automation token that is no longer needed.

### GitHub

The `npm-publish` environment exists with a required reviewer and no restriction on which branches or tags may deploy. If one is added, tags matching `v*` have to be allowed, or the publish job is rejected before it can ask for approval.

## The first release with this workflow

0.5.0 is merged on `main` and is not on npm: the newest published version is 0.4.2. The first use of this workflow is therefore the tag `v0.5.0`, after the trusted publisher above has been created. GitHub runs the workflow file as it is at the tagged commit, so the tag has to be on a commit of `main` that already contains `release.yml`, not on the older commit that first set the version to 0.5.0.
