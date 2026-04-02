# Pre-Release Checklist (Manual)

Use this checklist before any version release.

## 1. Scope and Readiness

- [ ] Milestone scope is complete or explicitly de-scoped
- [ ] Open critical blockers are resolved or accepted with mitigation
- [ ] Weekly goals and sprint records are updated

## 2. Documentation Alignment

- [ ] CHANGELOG includes all user-visible changes
- [ ] VERSION reflects correct semantic bump
- [ ] Release notes draft created from template
- [ ] Relevant ADR entries updated for architecture-impacting changes

## 3. Quality Gates

- [ ] Local build succeeds
- [ ] Core test suite passes
- [ ] Smoke scenarios pass for main workflow
- [ ] Regression checks completed for recent changes
- [ ] Known issues recorded with impact and workaround

## 4. Security and Permissions

- [ ] Sensitive operations still require expected confirmation
- [ ] No new unsafe default permissions introduced
- [ ] Secrets and credentials are not present in tracked files

## 5. Observability and Logs

- [ ] Error logs reviewed for unresolved critical issues
- [ ] Key metrics snapshot recorded (success rate, latency, failure rate)
- [ ] Release identifier is traceable in logs

## 6. Version Finalization

- [ ] Move [Unreleased] entries into new version section in CHANGELOG
- [ ] Update release date in notes and changelog
- [ ] Confirm VERSION file and release notes version are consistent

## 7. Publish Steps

- [ ] Create release commit
- [ ] Create version tag
- [ ] Publish release notes
- [ ] Announce release and link migration notes if needed

## 8. Post-Release Verification

- [ ] Verify install and startup in a clean environment
- [ ] Run one end-to-end workflow successfully
- [ ] Record post-release summary in DEVLOG
- [ ] Open follow-up tasks for deferred items

## Pre-Release Sign-Off

- Release version:
- Release owner:
- Date:
- Go/No-Go decision:
- Notes:
