---
title: Migration
---

# Migration

Deprecated v1 compatibility APIs and notes for migrating from Ionic upstream. Related guides: [Availability](https://docs.rdlabo.dev/projects/capacitor-local-llm/docs/availability), [Chat](https://docs.rdlabo.dev/projects/capacitor-local-llm/docs/chat), [Error Handling](https://docs.rdlabo.dev/projects/capacitor-local-llm/docs/errors), [Setup](https://docs.rdlabo.dev/projects/capacitor-local-llm/docs/setup).

## Deprecated compatibility APIs

v1 APIs remain available but are deprecated in favor of explicit chat and availability methods:

| Deprecated                                   | Replacement                                        |
| -------------------------------------------- | -------------------------------------------------- |
| `systemAvailability()`                       | `getAvailability()`                                |
| `download()`                                 | `downloadModel()`                                  |
| `prompt()`                                   | `createChat()` + `generateText()` / `streamText()` |
| `endSession()`                               | `deleteChat()`                                     |
| `addListener('systemAvailabilityChange', …)` | `addListener('availabilityChange', …)`             |
| `warmup({ sessionId })`                      | `warmup({ chatId })`                               |

`systemAvailability()` and `systemAvailabilityChange` return the legacy four-value `LLMAvailability` contract (`available`, `unavailable`, `notready`, `downloadable`) by folding the detailed `Availability` statuses described in [Availability](https://docs.rdlabo.dev/projects/capacitor-local-llm/docs/availability).

`prompt()` without `sessionId` still performs a one-shot generation for backward compatibility.

## Migrating from Ionic upstream v1

This fork is not a complete drop-in replacement. Change the dependency and imports to `@rdlabo/capacitor-local-llm`, adopt `getAvailability()` and the explicit `createChat()` / `generateText()` / `deleteChat()` lifecycle, and handle the detailed status and stable error codes. The minimums are iOS 18.4 and Android API 29. Deprecated v1 entry points remain as a transition layer, including the original four availability values.
