# 15 Logging Observability

## Findings Referenced

- FND-014: debug commands leak raw TL objects.
- FND-015: logger/sendlog sensitive data exposure.
- FND-025: channel-gap circuit breaker private-state observability.
- FND-028: unhandled rejection policy.

## Observability Notes

- Logger adds timestamp, level, caller parsing, and GramJS downgrade handling.
- Caller parsing depends on stack-frame offsets and can be wrong under async/reload stacks.
- ANSI output is unconditional and can pollute PM2 log files.
- There is no external error reporting hook. If production reliability matters, add an optional webhook/Sentry-style sink with redaction.

