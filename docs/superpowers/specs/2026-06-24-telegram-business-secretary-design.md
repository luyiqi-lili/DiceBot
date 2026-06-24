# Telegram Business Secretary Design

## Goal

Enable Telegram Chat Automation / Business mode for `lili_DiceBot` so the Worker accepts Business updates, avoids webhook retry loops, and can send a conservative secretary reply on behalf of the connected user.

## Scope

- Handle `business_connection`, `business_message`, `edited_business_message`, and `deleted_business_messages` updates.
- Do not route Business private chats through group-only command handlers or group backup logic.
- Reply only when Telegram supplies a `business_connection_id` and the incoming Business message contains text.
- Send replies with `business_connection_id` so Telegram sends them on behalf of the connected user.

## Behavior

When a Business connection update arrives, the Worker logs whether the connection is enabled and returns 200 quickly.

When a Business message arrives, the Worker treats it as a private secretary message. The first version is intentionally conservative: it acknowledges the incoming text and points out that full AI secretary behavior is enabled at the integration level but still intentionally minimal. This proves the identity path without making Lily auto-answer arbitrary private conversations with generated content.

Unknown or unsupported Business updates are acknowledged without throwing so Telegram does not accumulate pending webhook updates.

## Data Flow

Telegram sends a Business update to the existing Worker webhook. `parsedUpdateFromContext` maps the update into `ParsedUpdate`, preserving `businessConnectionId`. `handleTelegramContext` detects Business update types before the group allowlist and dispatches them to a small Business handler. The handler calls `TgMessage.sendText` with `business_connection_id`.

## Testing

Unit tests cover parsing Business update types and sending a secretary reply with `business_connection_id`. Webhook contract tests cover that Business updates return 200 instead of 400.
