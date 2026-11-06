# THREATS.md — LedgerLine Security & Threat Analysis

This document outlines the security threats, concurrency race conditions, and financial integrity risks identified in the LedgerLine banking backend, along with the precise mitigations implemented and the trade-offs accepted.

## 1. Threat Matrix & Mitigations

### Threat 1: Balance Overdraft via Concurrent Requests (Race Conditions)
* **Risk Description:** Two separate withdrawal or transfer requests arrive at the exact same millisecond. Both read the initial account balance (e.g., ₹1,000), both see sufficient funds for an ₹800 transfer, and both succeed. The account is incorrectly overdrawn to -₹600, creating money out of thin air.
* **Mitigation:** 
  * Implemented strict database transaction isolation using Prisma (`prisma.$transaction`).
  * Within the transaction, the database locks and reads the sender's current balance, validates that `senderAccount.balancePaise >= transferPaise`, and updates the balance atomically. 
  * As proven by our concurrency stress tests (`test-concurrency.js`), when multiple requests race, only the first transaction succeeds, and subsequent racing transactions immediately fail with `Insufficient funds.` due to updated row states.

### Threat 2: Double-Spending / Duplicate Payments via Network Retries (Idempotency Failures)
* **Risk Description:** A client initiates a money transfer, but the network drops the HTTP response before it reaches the client. The client retries the request. Without idempotency protection, the money is transferred a second time.
* **Mitigation:**
  * Enforced mandatory client-supplied idempotency keys via the `Idempotency-Key` header on financial mutation endpoints (deposits and transfers).
  * The server checks an idempotency cache/store before processing. If a key has already been executed, the server bypasses database operations and returns the exact cached response payload with a `replayed: true` flag.

### Threat 3: Floating-Point Rounding Errors (Financial Drift)
* **Risk Description:** Representing currency as standard JavaScript IEEE 754 floating-point numbers (`0.1 + 0.2 = 0.30000000000000004`), leading to fractional penny losses or silent balance corruption over thousands of transactions.
* **Mitigation:**
  * All monetary balances and movements are stored and calculated strictly as integers representing the smallest currency unit (**Paise** via BigInt / integer scaling). For example, ₹1,000 is stored as `100000` paise. Floating-point math is entirely avoided during balance updates.

### Threat 4: Unauthorized Fund Transfers (Broken Object Level Authorization)
* **Risk Description:** A malicious user steals or guesses another user's authentication token or account number and attempts to siphon funds from accounts they do not own.
* **Mitigation:**
  * Every money-moving request requires a valid JWT Bearer Token (`authenticateToken` middleware).
  * The sender account is resolved strictly from the authenticated user's session identifier (`req.user.userId`) rather than trusting user input from the request body. Users can only debit accounts tied directly to their authenticated user ID.

## 2. Accepted Risks & Trade-Offs

1. **In-Memory Idempotency Cache:**
   * *Trade-off:* Our current implementation stores idempotency keys in an in-memory `Map()`. While sufficient for single-instance deployments and challenge demonstrations, this cache would reset if the server restarts. 
   * *Production Fix:* In a scaled multi-node production environment, this would be migrated to a persistent database table with unique constraints on the `(user_id, idempotency_key)` tuple with a TTL (Time-To-Live).

2. **Single-Currency Model:**
   * *Trade-off:* The system currently assumes a single base currency (INR, tracked in paise). Multi-currency conversion rates and foreign exchange fluctuations are intentionally excluded to keep the core ledger invariant ironclad and foolproof.