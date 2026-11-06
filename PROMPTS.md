# PROMPTS.md — LedgerLine Development & AI Audit Log

This document records key engineering decisions, AI-assisted drafts, code reviews, and version iterations for the LedgerLine backend.

### Log 1: Enforcing Integer-Based Currency Precision
* **Date:** November 6, 2026
* **Component:** Database Schema (`Prisma`)
* **Prompt / Objective:** Model account balances to avoid floating-point rounding errors in financial calculations.
* **AI Draft:** Suggested using standard JavaScript floating-point numbers (`Float`) for balances and deposit amounts.
* **Code Review & Correction:** Floats introduce precision drift (`0.1 + 0.2 != 0.3`), which is unacceptable in banking. Overrode the suggestion to use integer scaling (**Paise** via BigInt) to guarantee exact decimal calculations.
* **Version Tag:** `v1.0.0-schema-core`

### Log 2: Implementing Atomic Transactions for Transfers
* **Date:** November 7, 2026
* **Component:** Transfer Route & Concurrency Guard
* **Prompt / Objective:** Design a fund transfer mechanism between two accounts with balance verification.
* **AI Draft:** Provided separate sequential queries (read balance, check condition, execute two independent updates).
* **Code Review & Correction:** Identified a classic read-modify-write race condition. If two requests hit simultaneously, both would read sufficient funds and overdrawn balances would occur. Replaced with Prisma interactive transactions (`prisma.$transaction`) to enforce row-level atomicity.
* **Version Tag:** `v1.1.0-atomic-transactions`

### Log 3: Adding Idempotency Key Support for Retries
* **Date:** November 8, 2026
* **Component:** Idempotency Middleware & Caching
* **Prompt / Objective:** Prevent duplicate payments when client requests are retried after timeouts or network failures.
* **AI Draft:** Proposed client-side timeout retry flags on the frontend application.
* **Code Review & Correction:** Frontend flags can be easily bypassed by API clients or cURL requests. Implemented a backend `Idempotency-Key` header check that caches successful financial mutations and returns identical payloads on duplicate replays.
* **Version Tag:** `v1.2.0-idempotency`

### Log 4: Standardizing JSON Error Responses
* **Date:** November 9, 2026
* **Component:** Express Error Handling
* **Prompt / Objective:** Resolve JSON parsing syntax errors encountered during test execution.
* **AI Draft:** Suggested modifying test client timeout configurations.
* **Code Review / Correction:** Traced the root cause to unmatched routes returning Express's default HTML 404 error page instead of JSON. Added a global catch-all 404 middleware returning structured JSON objects.
* **Version Tag:** `v1.3.0-error-handling`

### Log 5: Concurrency Stress Testing Suite
* **Date:** November 10, 2026
* **Component:** Automated Integration & Race Tests
* **Prompt / Objective:** Build verification scripts to test extreme concurrency and idempotency replayed calls.
* **AI Draft:** Generated a basic sequential test runner calling endpoints one by one.
* **Code Review / Correction:** Expanded the test suite to fire simultaneous requests at the exact same millisecond (`Promise.all`), proving that race conditions safely trigger `Insufficient funds` errors and replayed keys return cached responses.
* **Version Tag:** `v1.4.0-stress-tests`