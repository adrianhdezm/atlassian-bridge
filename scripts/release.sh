#!/bin/bash
set -e

# Usage: ./scripts/release.sh [major|minor|patch]
release_type=${1:-patch}
if [[ "$release_type" != "major" && "$release_type" != "minor" && "$release_type" != "patch" ]]; then
  echo "Usage: $0 [major|minor|patch]"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo "Error: jq is required but not installed"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "Error: working tree is not clean — commit or stash changes first"
  exit 1
fi

current_branch=$(git branch --show-current)
if [ "$current_branch" != "main" ]; then
  echo "Error: releases must be created from the main branch (currently on '$current_branch')"
  exit 1
fi

current_version=$(jq -r '.version' package.json)
if [ -z "$current_version" ]; then
  echo "Error: unable to read version from package.json"
  exit 1
fi

tag="v$current_version"
if git rev-parse "$tag" &> /dev/null; then
  echo "Error: tag '$tag' already exists"
  exit 1
fi

IFS='.' read -r major minor patch <<< "$current_version"

case "$release_type" in
  major)
    major=$((major + 1))
    minor=0
    patch=0
    ;;
  minor)
    minor=$((minor + 1))
    patch=0
    ;;
  patch)
    patch=$((patch + 1))
    ;;
esac

new_version="${major}.${minor}.${patch}"

echo "Current version: $current_version"
echo "New version:     $new_version"
echo ""
echo "This will:"
echo "  1. Tag the current commit as $tag"
echo "  2. Bump package.json to $new_version and commit"
echo "  3. Push the commit and tag to origin/main"
echo ""
read -rp "Proceed? [y/N] " confirm
if [[ "$confirm" != [yY] ]]; then
  echo "Aborted"
  exit 0
fi

git tag "$tag"

jq --arg v "$new_version" '.version = $v' package.json > tmp.$$.json && mv tmp.$$.json package.json

git add package.json
git commit -m "chore(release): 🔧 bump version to $new_version"

git push origin main
git push origin "$tag"

echo ""
echo "Released $tag and bumped to $new_version"
