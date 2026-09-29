# Specs

The living specs for the Syllables Drag Into Place game. Read and update them in chain order:

`PRD → DEVSPEC → UISPEC → TESTSPEC`

| Document | Question it answers | Role |
|---|---|---|
| [PRD](PRD.md) | What is the product, for whom, and why? | Intent, scope and non-goals |
| [DEVSPEC](DEVSPEC.md) | What must be built, and how must it behave? | **Authoritative** behavior, schemas, constants, offline rules |
| [UISPEC](UISPEC.md) | What does the child see, hear and do? | Visual and interaction contract; cites DEVSPEC for behavior |
| [TESTSPEC](TESTSPEC.md) | How is it verified? | Test cases, gates and coverage map |

Rationale for implementation choices lives in [DECISIONS.md](../../DECISIONS.md).

## Change rules

- When product intent changes, update the PRD first, then each downstream document in order.
- When only an implementation detail changes, start at the earliest affected document and reconcile everything after it.
- If a summary (README, agent.md) disagrees with DEVSPEC, DEVSPEC wins; fix the summary.
- Inspect the code before trusting a spec: specs can lag behind the code.
