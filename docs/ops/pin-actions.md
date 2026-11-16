# Pinning the workflows (one-time, needs internet)

The workflows were written in a session with no network access, so the third-party actions could not be
resolved to commit SHAs, and a SHA must never be guessed. Until this is done:

- every `uses:` line carries a placeholder like `actions/checkout@PIN-ME-v4.2.2`, and
- `release.yml` has `VERCEL_CLI_VERSION: PIN-ME`.

Both fail loudly on purpose: the `workflows` job in `ci.yml` rejects any `uses:` that is not a full 40-character
SHA, and `release.yml` refuses to run with an unpinned Vercel CLI. Nothing can deploy unpinned by accident.

Whoever does this needs a normal internet connection and `git`. No tokens, no secrets.

## 1. Pin the actions

Run from the repo root on branch `ops/pipeline`:

```bash
set -euo pipefail
resolve() {                       # owner/repo tag -> the commit SHA the tag points at
  local repo=$1 tag=$2 out sha
  out=$(git ls-remote "https://github.com/${repo}.git" "refs/tags/${tag}" "refs/tags/${tag}^{}")
  sha=$(printf '%s\n' "$out" | awk '/\^\{\}$/ {print $1}')          # annotated tag: use the peeled commit
  [ -n "$sha" ] || sha=$(printf '%s\n' "$out" | awk 'NR==1 {print $1}')
  [[ $sha =~ ^[0-9a-f]{40}$ ]] || { echo "cannot resolve ${repo}@${tag}" >&2; return 1; }
  printf '%s\n' "$sha"
}
for f in .github/workflows/*.yml; do
  for ref in $(grep -oE '[A-Za-z0-9._/-]+@PIN-ME-v[0-9.]+' "$f" | sort -u); do
    repo=${ref%@*}; tag=${ref#*@PIN-ME-}
    sha=$(resolve "$repo" "$tag")
    sed -i "s#${repo}@PIN-ME-${tag}#${repo}@${sha}#g" "$f"
    echo "$f: ${repo} ${tag} -> ${sha}"
  done
done
grep -rn 'PIN-ME' .github/workflows || true      # only the VERCEL_CLI_VERSION line should remain
```

The `# v4.2.2` comment after each line stays, so a human can see the version.

If a tag in the script does not exist any more, pick the current release of that action, put its tag in the
placeholder (`PIN-ME-v<tag>`), and run it again.

## 2. Pin the Vercel CLI

```bash
npm view vercel version          # the current release, e.g. 4x.y.z
```

Put that exact `x.y.z` into `VERCEL_CLI_VERSION` at the top of `.github/workflows/release.yml`.

## 3. Check

```bash
bash scripts/install-scanners.sh /tmp/scanners actionlint && /tmp/scanners/actionlint -color
```

Then commit (`.github/workflows/**` only) and push. CI's `workflows` job repeats the pin check on every push.

Bumping later: change the tag, re-resolve the SHA, and read the action's release notes first.
