#!/bin/sh

# Cuts a release for one source plugin. Each plugin carries its own semver
# (declared in sources/<id>/src/index.ts) and its own CHANGELOG.md; releases
# are independent and tagged as <id>-vX.Y.Z. The script validates the tree,
# rejects no-op releases and versions colliding with existing release tags,
# runs the build and conformance gates, folds the plugin changelog
# Unreleased section into a dated section, bumps the plugin version, then
# creates the release commit and an annotated tag.
# Nothing is pushed; the script prints the push command.
#
# A plugin that carries no release tag has never been released, so it may be
# cut at the version it already declares (scripts/release.sh <id> 1.0.0).
# Every later release has to exceed the declared version.
#
# usage: scripts/release.sh <plugin-id> <patch|minor|major>
#        scripts/release.sh <plugin-id> <x.y.z>
set -eu

fail() {
    echo "error: $1" >&2
    exit 1
}

usage() {
    echo "usage: $0 <plugin-id> <patch|minor|major>" >&2
    echo "       $0 <plugin-id> <x.y.z>" >&2
    exit 2
}

# Strict x.y.z split: exactly three non-empty numeric components without
# leading zeros. Sets _v_major, _v_minor, _v_patch on success.
parse_version() {
    rest="$1"
    case "$rest" in
        *.*) ;;
        *) return 1 ;;
    esac
    _v_major="${rest%%.*}"
    rest="${rest#*.}"
    case "$rest" in
        *.*) ;;
        *) return 1 ;;
    esac
    _v_minor="${rest%%.*}"
    _v_patch="${rest#*.}"
    case "$_v_major$_v_minor$_v_patch" in
        *[!0-9]*|"") return 1 ;;
    esac
}

# True when version $1 compares greater than version $2.
version_gt() {
    parse_version "$1" || return 1
    _a_major="$_v_major"; _a_minor="$_v_minor"; _a_patch="$_v_patch"
    parse_version "$2" || return 1
    if [ "$_a_major" -ne "$_v_major" ]; then
        [ "$_a_major" -gt "$_v_major" ]
    elif [ "$_a_minor" -ne "$_v_minor" ]; then
        [ "$_a_minor" -gt "$_v_minor" ]
    else
        [ "$_a_patch" -gt "$_v_patch" ]
    fi
}

[ "$#" -eq 2 ] || usage
id="$1"

# Plugin identifiers become path segments and tag prefixes, so restrict
# them to a conservative character set up front.
case "$id" in
    *[!A-Za-z0-9_-]*) usage ;;
    "") usage ;;
esac

bump="$2"

plugin_dir="sources/$id"
src="$plugin_dir/src/index.ts"
changelog="$plugin_dir/CHANGELOG.md"

branch="$(git rev-parse --abbrev-ref HEAD)"
[ "$branch" = "master" ] || fail "releases are cut from master (current branch: $branch)"
[ -z "$(git status --porcelain)" ] || fail "working tree is not clean"

[ -f "$plugin_dir/package.json" ] || fail "unknown plugin '$id' ($plugin_dir/package.json not found)"
[ -f "$src" ] || fail "missing plugin entry point ($src)"
grep -q '^## \[Unreleased\]' "$changelog" ||
    fail "$changelog has no [Unreleased] section"

mode="bump"
case "$bump" in
    patch|minor|major) ;;
    *) mode="set" ;;
esac

# Current version lives in the plugin metadata constant, the single
# source of truth replicated into registry manifests at index time.
read_plugin_version() {
    sed -n 's/^[[:space:]]*version:[[:space:]]*"\([0-9][0-9.]*\)".*/\1/p' "$1" | head -n 1
}

version="$(read_plugin_version "$src")"
[ -n "$version" ] || fail "could not read a numeric version from $src"
parse_version "$version" || fail "unsupported version format '$version' in $src"

if [ "$mode" = "set" ]; then
    parse_version "$bump" || fail "explicit versions expect numeric x.y.z, got '$bump'"
    next="$bump"
else
    major="$_v_major"; minor="$_v_minor"; patch="$_v_patch"
    if [ "$bump" = "major" ]; then
        major=$((major + 1)); minor=0; patch=0
    elif [ "$bump" = "minor" ]; then
        minor=$((minor + 1)); patch=0
    else
        patch=$((patch + 1))
    fi
    next="$major.$minor.$patch"
fi

# Release discipline per plugin. The script performs the version bump, so
# the guards only reject pointless releases (no source or manifest change
# and an unchanged version since the previous release tag) and versions
# that would collide with or undercut an existing release tag. --tags
# keeps lightweight tags visible to the guard as well.
prev_tag="$(git describe --abbrev=0 --tags --match "$id-v*" 2>/dev/null || true)"

if version_gt "$next" "$version"; then
    :
elif [ "$next" = "$version" ] && [ -z "$prev_tag" ]; then
    echo "first release for $id at its declared version $next"
else
    fail "new version $next must be greater than current $version"
fi
if [ -n "$prev_tag" ]; then
    tagged_version="$(git show "$prev_tag:$src" | read_plugin_version -)"
    # The built artifact embeds the workspace dependency graph, so a changed
    # manifest, such as a raised dependency floor, is itself a release-worthy
    # change even when the plugin sources are untouched.
    if [ -z "$(git diff --name-only "$prev_tag" -- "$plugin_dir/src" "$plugin_dir/package.json")" ] &&
        [ "$version" = "$tagged_version" ]; then
        fail "no changes under $plugin_dir since $prev_tag; nothing to release"
    fi
fi
for tag in $(git tag -l "$id-v*"); do
    tagged="${tag#$id-v}"
    parse_version "$tagged" || continue
    version_gt "$next" "$tagged" ||
        fail "new version $next does not exceed existing release tag $tag"
done

echo "== typecheck"
pnpm typecheck
echo "== build"
pnpm build
echo "== test $id"
pnpm test "$id"

# Rewrite only the numbers so surrounding formatting survives untouched.
sed -i "0,/^\([[:space:]]*version:[[:space:]]*\"\)[0-9][0-9.]*/s//\1$next/" "$src"
grep -Eq "^[[:space:]]*version:[[:space:]]*\"$next\"" "$src" ||
    fail "plugin version update did not apply"

today="$(date +%Y-%m-%d)"
sed -i "s/^## \[Unreleased\]\$/## [$next] - $today/" "$changelog"
grep -q "^## \[$next\] - $today" "$changelog" ||
    fail "changelog fold did not apply"

git add "$src" "$changelog"
git commit -m "chore($id): release $next"
git tag -a "$id-v$next" -m "$id-v$next"

echo ""
echo "release $id-v$next committed and tagged locally."
echo "publish when ready:"
echo "  git push --follow-tags origin master"
