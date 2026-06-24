# Affection Interactions Design

## Goal

Increase directed affection by 1 when user A replies to user B or reacts to one of B's messages.

## Behavior

- Any user reply to another non-bot user increases A -> B affection by 1.
- Any Telegram reaction emoji counts as a reaction interaction.
- A user's reaction to the same message can increase affection at most once.
- If a user cancels a reaction and reacts to the same message again, it does not increase affection again.
- Self-interactions and interactions targeting bots are ignored.
- Interaction writes are silent. Failures are logged and must not block normal command or message handling.

## Architecture

`src/index.ts` remains the webhook dispatcher. It will call a focused interaction module for reply and reaction events.

`src/lib/affectionInteractions.ts` owns the rules for:

- validating source and target users
- calling `incrementAffection(..., delta = 1)`
- resolving reaction targets from `message_history`
- using `AFFECTION_KV` marker keys to remember counted reactions

Reply targets are already available on `ParsedUpdate.replyToMessage.from`. Reaction updates only include the reacting user and the target `message_id`, so the handler resolves the original author from D1 `message_history` by `chat_id + message_id`. If D1 is unavailable or the message is not in history, the reaction is skipped.

Reaction markers live in `AFFECTION_KV` under `affection:reaction-counted:<chatId>:<messageId>:<reactorId>`. The marker is written after a successful affection increment. This avoids adding a new D1 table and works in environments where schema migrations are manual.

## Telegram Update Notes

`src/lib/telegram.ts` will parse `message_reaction` updates into `ParsedUpdate` with:

- `type = "message_reaction"`
- `chatId` from `message_reaction.chat.id`
- `from` from `message_reaction.user`
- `messageReaction` containing the raw update

Telegram only sends `message_reaction` updates when the bot is an administrator and the webhook explicitly includes `"message_reaction"` in `allowed_updates`. The code supports the event, but deployment must configure webhook update types separately.

## Tests

Unit tests cover:

- replies increment A -> B by 1
- bot/self reply targets are ignored
- `message_reaction` updates parse correctly
- initial reactions increment A -> original author by 1
- repeated reactions to the same message are ignored by marker
- cancel/remove reaction updates do not increment
