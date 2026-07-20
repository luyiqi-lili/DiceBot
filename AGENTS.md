# Agent Notes

- Pushing to `main` automatically publishes the project. After merging or pushing `main`, do not run a manual deploy unless the user explicitly asks for one.
- Post-release checks for the production/main bot must default to read-only checks only, such as GitHub Actions status and the Worker health GET endpoint. Do not send Telegram commands/messages, call mutating external APIs, or trigger bot features that write state against the production bot unless the user explicitly asks for that exact write test.
- Local environment variables are available in `.env`. Load them for local commands that need secrets or runtime configuration, and never print secret values in logs or responses.
- Keep cross-platform credentials in their consumer platform: sync local `.env` `GH_TOKEN` to the Cloudflare Worker secret named `GITHUB_TOKEN` for GitHub API access; sync local `.env` `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` to GitHub Actions Secrets for deployment. Do not reverse these destinations or commit either token.
- Keep unrelated local changes intact. The main checkout may contain user-owned uncommitted files.
