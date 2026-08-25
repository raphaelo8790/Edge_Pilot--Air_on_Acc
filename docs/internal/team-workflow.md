# Workflow Guide

## 📋 Table of Contents

- [Branching Strategy](#branching-strategy)
- [Issue Management](#issue-management)
- [Pull Request Process](#pull-request-process)
- [Code Review Guidelines](#code-review-guidelines)
- [Commit Standards](#commit-standards)
- [Daily Workflow](#daily-workflow)

---

## 🌿 Branching Strategy

### Branch Types

| Branch | Purpose | Naming Convention | Example |
|--------|---------|-------------------|---------|
| `main` | Production-ready code | `main` | `main` |
| `dev` | Development integration | `dev` | `dev` |
| `feature/*` | New features | `feature/[issue-id]-description` | `feature/12-benchmark-runner` |
| `fix/*` | Bug fixes | `fix/[issue-id]-description` | `fix/45-latency-calculation` |
| `hotfix/*` | Emergency fixes | `hotfix/[issue-id]-description` | `hotfix/78-security-patch` |

### Branch Rules

**Main Branch (Protected)**
- ✅ Always deployable
- ✅ All tests pass
- ✅ Code reviewed and approved
- ❌ No direct pushes
- ❌ No force pushes

**Dev Branch**
- ✅ Integration branch
- ✅ All features merge here first
- ✅ Tests must pass
- ❌ No direct pushes (except hotfixes)

**Feature Branches**
- ✅ One feature per branch
- ✅ Created from `dev`
- ✅ Merged back to `dev` via PR
- ✅ Deleted after merge

### Branch Workflow

```
main ← dev ← feature/[name]
                ↓
            Pull Request
                ↓
            Code Review
                ↓
            Merge to dev
                ↓
            Release to main
```

---

## 📋 Issue Management

### Issue Types

**1. Task Issue**
```markdown
## Task: [Title]

### Description
[What needs to be done]

### Acceptance Criteria
- [ ] Criterion 1
- [ ] Criterion 2

### Technical Details
- **Module:** [benchmark/device/workload]
- **Priority:** [High/Medium/Low]
- **Estimated Time:** [X hours]

### Dependencies
- [ ] Issue #X

### Evidence Required
- [ ] Code changes
- [ ] Tests passing
- [ ] Documentation updated
```

**2. Bug Report**
```markdown
## Bug: [Title]

### Description
[What's wrong]

### Steps to Reproduce
1. [Step 1]
2. [Step 2]

### Expected Behavior
[What should happen]

### Actual Behavior
[What happens instead]

### Environment
- OS: [OS]
- Browser: [Browser]
- Node: [Version]
```

---

## 🔄 Pull Request Process

### PR Template

```markdown
## Description
[What this PR does]

## Related Issues
Closes #[issue-number]

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Changes Made
- [Change 1]
- [Change 2]

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing done

## Checklist
- [ ] Code follows style guidelines
- [ ] Self-review completed
- [ ] Documentation updated
- [ ] No console.log statements
- [ ] No hardcoded values
```

### PR Workflow

```bash
# 1. Create feature branch from dev
git checkout dev
git pull origin dev
git checkout -b feature/[issue-id]-[description]

# 2. Make changes and commit
git add .
git commit -m "feat(module): description"

# 3. Push to remote
git push origin feature/[issue-id]-[description]

# 4. Create Pull Request
# - Target: dev branch
# - Fill PR template
# - Link issue
# - Request reviewers

# 5. Code Review
# - At least 1 approval required
# - All comments addressed
# - All checks pass

# 6. Merge
# - Squash and merge (recommended)
# - Delete branch after merge
```

### PR Rules

**Size Limits**
- ✅ Small, focused PRs (< 400 lines)
- ✅ One feature per PR
- ❌ No "mega PRs"

**Requirements**
- ✅ All tests pass
- ✅ Code reviewed
- ✅ No conflicts
- ✅ Documentation updated

**Reviewers**
- **Required:** At least 1 approval
- **Recommended:** the integration owner for all PRs
- **Optional:** Module owner for related PRs

---

## 👀 Code Review Guidelines

### Review Checklist

**Functionality:**
- [ ] Code works as expected
- [ ] Edge cases handled
- [ ] Error handling implemented
- [ ] No hardcoded values

**Code Quality:**
- [ ] TypeScript types defined
- [ ] No `any` types
- [ ] Functions are pure when possible
- [ ] Single responsibility principle

**Security:**
- [ ] No API keys in client code
- [ ] Input validation present
- [ ] No SQL injection risks
- [ ] No XSS vulnerabilities

**Testing:**
- [ ] Unit tests written
- [ ] Tests are meaningful
- [ ] Coverage adequate

**Documentation:**
- [ ] Code comments where needed
- [ ] README updated if needed
- [ ] API docs updated if needed

---

## 📝 Commit Standards

### Conventional Commits

**Format:**
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types:**
| Type | Description | Example |
|------|-------------|---------|
| `feat` | New feature | `feat(benchmark): add readiness score` |
| `fix` | Bug fix | `fix(api): handle timeout error` |
| `docs` | Documentation | `docs(readme): update setup instructions` |
| `style` | Formatting | `style(ui): fix button alignment` |
| `refactor` | Refactoring | `refactor(providers): extract base class` |
| `test` | Tests | `test(benchmark): add unit tests` |
| `chore` | Maintenance | `chore(deps): update dependencies` |

**Scopes:**
- `benchmark` - Benchmark module
- `device` - Device module
- `workload` - Workload module
- `provider` - Provider module
- `ui` - User interface
- `api` - API routes
- `db` - Database
- `config` - Configuration

**Examples:**
```bash
# Good
git commit -m "feat(benchmark): add readiness_score() function"
git commit -m "fix(api): handle missing device error"
git commit -m "docs(architecture): add hexagonal diagram"

# Bad
git commit -m "fixed stuff"
git commit -m "WIP"
git commit -m "updates"
```

---

## 📅 Daily Workflow

### Morning Standup (Async via Telegram)

**Each member posts:**
1. What I did yesterday
2. What I'll do today
3. Any blockers

**Example:**
```
📋 Daily Standup - [Name] - [Date]

✅ Yesterday:
- Implemented Ollama provider
- Added unit tests

🔜 Today:
- Add Gemini provider
- Create integration tests

🚧 Blockers:
- None
```

### End of Day

**Each member:**
1. Push all changes
2. Create PR if ready
3. Update issue status
4. Post standup summary

---

## 🚨 Emergency Procedures

### Hotfix Process

**When:** Critical bug in production

```bash
# 1. Create hotfix branch from main
git checkout main
git pull origin main
git checkout -b hotfix/[id]-[description]

# 2. Fix the bug
# ... make changes ...

# 3. Test the fix
npm test

# 4. Commit
git commit -m "fix(scope): description"

# 5. Merge to main
git checkout main
git merge hotfix/[id]-[description]
git tag -a v1.0.1 -m "Hotfix v1.0.1"

# 6. Merge to dev
git checkout dev
git merge hotfix/[id]-[description]

# 7. Delete hotfix branch
git branch -d hotfix/[id]-[description]

# 8. Deploy
git push origin main --tags
```

---

## 📚 References

- [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow)
- [Conventional Commits](https://www.conventionalcommits.org/)
- [Hexagonal Architecture](https://matias-suez.com/blog/hexagonal-architecture-nextjs)

---

**Last Updated:** July 21, 2026
