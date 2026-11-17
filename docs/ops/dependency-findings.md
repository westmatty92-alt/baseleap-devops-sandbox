# Dependency findings: upgrade suggestions

For the architect and backend lanes. DevOps doesn't edit `package.json`.
Source: OSV-Scanner on `package-lock.json`, CI run 43982095442 (8 findings, 4 High). All are in
**dev-only** packages, so none ship to users. Under `docs/ops/osv-policy.md` they warn but don't block.

| Package (found) | Severity | Advisory | Fixed in | Note |
|---|---|---|---|---|
| @faker-js/faker 5.5.3 | High | GHSA-qxc2-j82w-r537 | 10.5.0 | Code execution via `faker.helpers.fake` on crafted patterns. Two versions are in the tree (5.5.3 and 6.3.1), so something pulls in an old copy. Find it with `npm ls @faker-js/faker`. |
| @faker-js/faker 6.3.1 | High | GHSA-qxc2-j82w-r537 | 10.5.0 | Same advisory. |
| lodash 4.17.21 | High | GHSA-r5fr-rjxr-66jc | 4.18.0 | |
| lodash 4.17.21 | Medium | GHSA-xxjr-mmjv-4gpg | 4.17.23 (or 4.18.0) | Fixed by the same upgrade as above. |
| uuid 8.3.2 | High (CVSS 7.5; advisory label Moderate) | GHSA-w5hq-g745-h8pq | 11.1.1, 12.0.1 or 13.0.1 | Pick the line that matches the parent's major. Likely transitive. |
| fast-xml-parser 4.5.7 | Medium | GHSA-gh4j-gqv2-49f6 | 5.7.0 | |
| fast-xml-parser 4.5.7 | Low | GHSA-474x-hrwr-fgx4 | 5.12.0 | |
| minimatch 10.2.6 | Medium | GHSA-g3hv-75wg-m249 | 11.0.1 | |

Suggestions, in order of value:

1. Upgrade `@faker-js/faker` to `>=10.5.0`. It is the only direct dev dependency with a code-execution
   advisory. Check for API changes between 5/6 and 10 in the seed/fixture code first.
2. For transitive packages (`lodash`, `uuid`, `fast-xml-parser`, `minimatch`), run `npm ls <pkg>` to find
   the parent and upgrade that. Use `overrides` in `package.json` only if the parent has no fixed release.
3. A major-version jump may break the parent. Take it through the normal lane tests.

When these land, the next CI run drops the warnings from the job summary. Nothing in the workflow needs to change.
