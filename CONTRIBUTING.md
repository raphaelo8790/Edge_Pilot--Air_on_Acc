# Contributing to EdgePilot AI

Thanks for helping improve EdgePilot AI. This guide is for anyone who wants to report issues or submit code.

---

## Ways to contribute

### Report a bug

1. Search existing issues so we don’t duplicate work  
2. Open a new issue with steps to reproduce, expected vs actual behavior, and environment (OS, Node version, browser if UI)  

### Suggest a feature

1. Check whether a similar request already exists  
2. Open an issue describing the use case and who benefits  

### Submit code

1. Fork the repository  
2. Create a branch from the default development branch  
3. Make a focused change  
4. Open a pull request against that development branch  

```bash
git clone https://github.com/YOUR-USERNAME/edgepilot-ai.git
cd edgepilot-ai
npm install
cp .env.example .env.local   # configure DB and keys you need
npx prisma generate && npx prisma db push
npm run dev
```

---

## Pull requests

Please keep PRs small and focused when you can.

**Before you open a PR**

- [ ] Change does what you describe  
- [ ] Tests added or updated when behavior changes  
- [ ] No secrets or API keys committed  
- [ ] No debug noise left in (`console.log` for tracing, etc.)  
- [ ] Docs updated if user-facing behavior changed  

**Commit style (preferred)**  
[Conventional Commits](https://www.conventionalcommits.org/), e.g.:

```text
feat(benchmark): add readiness score breakdown
fix(api): handle missing device profile
docs(readme): clarify Ollama optional setup
```

---

## Code expectations

- TypeScript preferred for app code; avoid `any` unless justified  
- Validate external input (e.g. Zod) on the server  
- Keep provider secrets server-side only (`NEXT_PUBLIC_` is never for keys)  
- Prefer small, testable units for scoring and comparison logic  

Deeper layout and architecture notes for maintainers live under [`docs/internal/`](docs/internal/README.md).

---

## Tests

```bash
npm test
npm run test:watch
```

---

## License

By contributing, you agree that your contributions are licensed under the same MIT License as the project.
