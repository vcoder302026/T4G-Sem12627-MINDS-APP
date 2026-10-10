# Implementation instructions

## Objective and source of truth
Implement the first local MINDS staff prototype described in PLAN.md. Read the entire plan before editing. PLAN.md defines architecture, workflows, database rules, routes and acceptance criteria. If this file conflicts with it, follow PLAN.md. Later explicit user instructions take precedence.

## Working rules
- Work inside this repository. Sibling repositories are read-only references; the delivered app must run without them.
- Implement all five modules and the shared directories using the reduced workflows in PLAN.md. Do not equate dashboard links or mock UI with working backend functionality.
- Use Node.js 24, Express 5, built-in node:sqlite and plain browser JavaScript. Do not introduce a framework, ORM, external API or build system.
- Implement in the plan's phase order. Do not replace real database writes with browser storage, hardcoded success responses or disappearing in-memory records.
- Preserve demo data on restart. Store only fictional sample records. Never copy cached personal data, credentials, deployed service URLs or .git folders from reference projects.
- Use server-side validation, prepared SQL, transactions and protected API routes. Render user text safely. Keep password/session secrets out of responses and logs.
- If a reference implementation behaves differently, follow the prototype contract in PLAN.md. Do not infer missing features from repository names.
- Resolve ordinary implementation details consistently with the plan. Ask only when a genuine blocker or material requirement conflict prevents progress.
- Keep changes focused. No deployment, git push, live Google access, mobile work or production-readiness claims.
- Do not create sub-agents unless the user explicitly requests them.

## Validation and reporting
Run the tests and browser walkthrough required by PLAN.md during implementation. If a browser tool is unavailable, complete feasible automated checks and explicitly identify the manual checks still unperformed; do not claim them as passed.
Finish with a concise report of implemented workflows, startup commands, demo credentials, validation results and remaining limitations. Keep README accurate to the final app.
