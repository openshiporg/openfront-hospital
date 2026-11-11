# Agent rules

NEVER build outbox/texting/email notification machinery or cron/worker services. External events = Openfront Commerce webhooks (features/webhooks) only.

NEVER add `setInterval`/`setTimeout` loops in `instrumentation.ts` (or anywhere else in the server) or any background timer. Time-based state (bed holds, unconfirmed appointment requests, unconfirmed card payments) advances idempotently on the request that reads or touches it (`advanceTimedStates`) or by the staff Refresh button on Inpatient operations.
