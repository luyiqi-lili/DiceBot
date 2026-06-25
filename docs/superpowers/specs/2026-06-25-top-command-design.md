# /top Command Design

## Goal

Add a `/top` Telegram command for whitelisted administrators. The command reports which forum topics in the current chat had the most recorded messages during the last 7 days.

## Behavior

- Only users in a dedicated `/top` administrator whitelist can use the command.
- The command is read-only: it only queries D1 `message_history` and sends a Telegram reply.
- The query is scoped to the current `chat_id`.
- The query counts rows whose `created_at` is within the last 7 days and whose `thread_id` is not null.
- Results are ordered by message count descending.
- The reply shows the top topics, including the highest topic and a short ranking list.
- Display names prefer the latest non-empty `topic_name` found for the topic. If no name is available, the reply falls back to `主题 <thread_id>`.
- If D1 is unavailable or no rows match the window, the command returns a friendly message.

## Architecture

- Add `TOP_ADMIN_UIDS` to `src/data/admin.ts` and re-export it through `src/lib/liveConfig.ts`.
- Add `src/commands/top.ts` with `handleTop(parsed, env)`.
- Register `/top` in `src/index.ts` static command loader and `src/routes.ts` metadata.
- Add focused Vitest coverage in `test/commands/top.spec.ts`.

## Error Handling

- Missing or unauthorized caller: send a permission error in the triggering topic.
- Missing D1 binding: send a configuration error in the triggering topic.
- Empty result set: send a no-data message in the triggering topic.
- Query failure: log the error and send a generic retry message.

## Testing

- Non-whitelisted users receive a permission message.
- Whitelisted users receive a ranking generated from recent rows only.
- Empty query results produce the no-data message.
