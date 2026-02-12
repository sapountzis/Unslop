# Extension Release Setup

This document explains how to release new versions of the Unslop extension.

## Prerequisites

1. **Create the public releases repository**:
   - Go to GitHub → New repository
   - Name: `Unslop-releases`
   - Visibility: **Public**
   - **License**: Select **"None"** (or skip license selection) — this defaults to "All Rights Reserved" (copyright retained by you).
   - Initialize with a README
   - **Upload the contents of `extension/PUBLIC_REPO_LICENSE.md` as `LICENSE`**
   - **Upload the contents of `extension/PUBLIC_REPO_README.md` as `README.md`**

2. **Create a Personal Access Token**:
   - Go to GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Click "Generate new token (classic)"
   - Name: `RELEASES_REPO_TOKEN`
   - Scopes: Check `repo` (full control of private repositories)
   - Click "Generate token"
   - Copy the token

3. **Add the token to your private repo**:
   - Go to your private `Unslop` repo → Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `RELEASES_REPO_TOKEN`
   - Value: Paste the token you copied
   - Click "Add secret"

## How to Release

### 1. Update the version

Edit `extension/manifest.json` and bump the version:

```json
{
  "version": "0.2.0",
  ...
}
```

### 2. Merge to release branch

```bash
# Make sure you're on main with your changes committed
git checkout main
git pull

# Merge to release branch
git checkout release
git merge main
git push origin release
```

### 3. Automatic release

The GitHub Action will automatically:
- Build the extension
- Extract the version from `manifest.json`
- Create a zip file
- Create a release in the public `Unslop-releases` repo with installation instructions

### 4. Check the release

Go to `https://github.com/sapountzis/Unslop-releases/releases` to see your new release.

## First-time setup

Create the `release` branch:

```bash
git checkout -b release
git push -u origin release
```

Then follow the "How to Release" steps above.
