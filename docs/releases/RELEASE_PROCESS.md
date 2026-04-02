# Release Process

## Release Checklist

1. Confirm milestone scope is complete.
2. Run the manual pre-release checklist in docs/releases/PRE_RELEASE_CHECKLIST.md.
3. Ensure tests and validations pass.
4. Update CHANGELOG under [Unreleased].
5. Prepare release notes from template.
6. Bump VERSION.
7. Move [Unreleased] entries to new version section.
8. Create git tag and publish release.
9. Record post-release notes in DEVLOG.

## Version Bump Guide

- Patch: fixes only
- Minor: features with backward compatibility
- Major: breaking changes

## Release Artifacts

- VERSION
- CHANGELOG
- Release notes file under docs/releases
- Release record file from docs/releases/RELEASE_RECORD_TEMPLATE.md
- Tag metadata
