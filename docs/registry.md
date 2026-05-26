# Sharing experiences

OpenExpertise can install + run experiences hosted on GitHub, similar to npm packages or Anthropic skills.

## Install a curated experience

```bash
oe registry              # see what's available
oe install deep-research # installs to .openexpertise/experiences/deep-research/
oe run .openexpertise/experiences/deep-research
```

## Install any GitHub repo

```bash
oe install gh:owner/repo
oe install gh:owner/repo@v1.0.0
oe install gh:owner/repo --ref abc123
```

The repo must contain an `experience.yaml` at the root (or use `subpath` if it's a monorepo).

## Submit your experience to the registry

1. Push your experience to a public GitHub repo with `experience.yaml` at the root (or in a subpath).
2. Open a PR against `registry.json` in [xingchengxu/OpenExpertise](https://github.com/xingchengxu/OpenExpertise) adding an entry:

   ```json
   {
     "name": "your-experience",
     "owner": "your-gh-username",
     "repo": "your-repo",
     "ref": "v1.0.0",
     "description": "What it does in one sentence.",
     "tags": ["..."]
   }
   ```

3. Pin a tag (not just `main`) so installs are reproducible.

## Where installs live

`.openexpertise/experiences/<name>/` (gitignored). Each install is a snapshot at the pinned ref — re-run `oe install` against an updated ref to upgrade.

## Limits in v0.1.0

- No signature verification (yet). Inspect what you install.
- No transitive dependencies between experiences (yet).
- No `oe upgrade` to update an installed experience — just remove and reinstall.
