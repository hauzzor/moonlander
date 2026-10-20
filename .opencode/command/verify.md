---
description: Run the full Moonlander verification suite and report results.
agent: lead
---

Run:

```powershell
npm.cmd run verify
```

This covers typecheck, unit tests, local Playwright tests, and the production
build. Do not edit files. Report the exact command, pass/fail counts, failing
test names with file references, and the build result. If a failure is caused by
a known, unrelated baseline issue, say so explicitly and do not hide it.
