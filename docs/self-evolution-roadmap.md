# Self-Evolution Roadmap

Chinese source: [zh-CN/self-evolution-roadmap.md](zh-CN/self-evolution-roadmap.md)

The self-evolution vision is intentionally split into permission stages. Only stage 1 is implemented now.

## Stage 1: Auditable Foundation

- The hourly Worker cron reads open GitHub pull requests and stores snapshots plus deterministic risk signals in D1.
- It does not comment, approve, merge, or modify GitHub state.
- `POST /api/donations/api-keys` is an operator-mediated intake endpoint using a dedicated bearer token; it is not a public anonymous donation form.
- Donated keys are encrypted with AES-GCM, deduplicated by SHA-256 fingerprint, and never returned by an HTTP API.
- Missing optional configuration safely skips the subsystem and never interrupts the basic Telegram service.

See the [Chinese roadmap](zh-CN/self-evolution-roadmap.md) for acceptance criteria, configuration, and the planned validation, routing, AI-review, controlled-evolution, and budget stages.
