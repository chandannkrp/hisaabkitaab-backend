# HisaabKitaab Backend — Architecture

**Author:** Chandan Pandey · **© hisaabkitaab.ai** — All rights reserved.

This document describes the internal architecture of the backend API server. For the cross-service picture (frontend ↔ backend ↔ AI service), see the [system architecture document](../ARCHITECTURE.md).

---

## 1. High-Level Design

The backend is a **modular monolith**: a single Express process that owns the domain model (users, transactions, documents, chat) and delegates specialized work to managed AWS services and a separate AI microservice.

```
                        ┌────────────────────────────────────────────────┐
                        │              hisaabkitaab-backend              │
                        │                                                │
  Next.js frontend ───▶ │  Express REST API      Socket.IO (same server) │
  (REST + WebSocket)    │        │                        │              │
                        │        ▼                        ▼              │
                        │  Controllers ◀──────────── socket/index.js     │
                        │        │                                       │
                        │        ▼                                       │
                        │  Mongoose Models ────────▶ MongoDB             │
                        │        │                                       │
                        │  Services layer                                │
                        │   ├── service.s3.js ─────▶ Amazon S3           │
                        │   ├── service.publish-sqs ▶ Amazon SQS ──▶ AI  │
                        │   ├── service.emailService ▶ Amazon SES        │
                        │   └── controller.ai (axios) ▶ AI service /ask  │
                        └────────────────────────────────────────────────┘
```

### Layering

| Layer | Directory | Responsibility |
|---|---|---|
| Transport | `app.js`, `routes/`, `socket/` | HTTP routing, WebSocket events, CORS, body parsing |
| Policy | `middlewares/` | AuthN/AuthZ, rate limiting, upload handling, error normalization |
| Domain | `controllers/` | Business rules (transaction lifecycle, verification quorum, timelines) |
| Data | `models/` | Mongoose schemas and relations |
| Integration | `services/` | S3, SQS, SES, PDF — all AWS/IO side effects isolated here |
| Cross-cutting | `utils/`, `config/` | Logging, ID/OTP generation, clients & constants |

## 2. Request Lifecycle

A protected, multipart request (transaction creation) flows through a **chained-controller pipeline** — controllers call `next()` to hand off to the next stage rather than terminating the response:

```
POST /api/users/transaction
  → apiLimiter                 rate limiting
  → authenticateToken          JWT from `token` / `view-refresh-token` cookie → req.user
  → generateTransactionId      unique business key → req.transactionId
  → multer (memory storage)    parse up to 5 files into buffers
  → uploadFilesToS3            stream buffers to S3 → req.files = S3 URLs
  → addNewTransaction          persist Document + Transaction docs,
                               email collaborators (SES),
                               publish FULL_REBUILD ingestion event (SQS)
  → initTimeline               append "created" audit entry, send response
```

This middleware-chaining pattern is used consistently: `verifyTransactionById → updateVerificationTimeline`, `patchTransactionDetailsById → updateTransactionDetailsTimeline`, etc. It keeps audit-trail writes decoupled from the primary mutation.

## 3. Authentication Model

Three distinct trust levels:

1. **Registered session** — login sets an httpOnly `token` cookie containing a JWT (`{ userId }` signed with `JWT_SECRET`). `authenticate` also accepts `Authorization: Bearer` for API clients.
2. **External collaborator (view token)** — invited parties who may not have accounts authorize via email OTP (`/transaction/authorize-email` → `/verify-otp`), receiving a scoped `view-refresh-token` cookie. `authenticateToken` and the public transaction endpoints accept either cookie, enabling the share-link / pre-authorize flow.
3. **Service-to-service** — outbound calls to the AI service carry the `x-internal-key` shared secret; the AI service rejects anything else.

Registration is gated by email OTP (`otp` / `otpExpires` on the User document); password resets use a time-boxed `passwordResetToken`.

## 4. Transaction Lifecycle & Verification Quorum

```
draft ──▶ inprogress ──▶ completed
              │
              └────────▶ cancelled
```

- Creation immediately places a transaction `inprogress` with the creator pre-verified (`verifiedBy = [creatorId]`).
- Each collaborator (including external ones) verifies independently.
- **Quorum rule:** when `verifiedBy.length - 1 === collaborators.length` (creator + all collaborators), status flips to `completed` and a completion email goes to the owner.
- Every state change appends a `TransactionTimeline` entry (`created`, `updated`, `verified`, `completed`, …) — an append-only audit trail rendered by the frontend timeline view.
- Deletion cascades: transaction → documents (S3 objects **and** metadata) → timeline entries.

## 5. Data Model Decisions

- **String business key (`transactionId`)** is the join key across `Transaction`, `Document`, `Message`, and `TransactionTimeline` — and across service boundaries (SQS payloads, AI vector store folder names, share links). Mongo `_id` refs are used only where population is needed (`collaborators`, `documents`, `senderId`).
- **Emails as soft references** — `ownerEmailId` / `createdBy` store emails, allowing a transaction to reference an owner who hasn't registered yet.
- **`BusinessRelationship`** is a directed edge (`primaryBusiness` → `relatedBusiness`) queried from both directions, modeling the client roster without embedding arrays in `User`.

## 6. Real-Time Subsystem

`socket/index.js` attaches Socket.IO to the same HTTP server (`/socket.io` path), so REST and WebSocket share one port, one CORS policy, and one deployment unit.

- Rooms are keyed by `transactionId` — chat is naturally scoped per transaction.
- `send_message` performs three actions atomically from the client's perspective: persist `Message` → publish `MESSAGE_ADDED` to SQS (so the AI knowledge base learns from the conversation) → broadcast `receive_message` to the room.

## 7. Eventing to the AI Service

The backend never blocks user requests on AI work:

- **Writes are async**: ingestion events go through SQS (`service.publish-sqs.js`) with fire-and-forget semantics; a publish failure is logged, never surfaced to the user.
- **Reads are sync but bounded**: `/api/chats/ai/ask` proxies to the AI service over HTTP with a 30-second timeout and translates failures into a clean 500.

Event taxonomy (the `ingestionReason` field) tells the AI service *how much* to re-process:

| Reason | Emitted when | AI-side effect |
|---|---|---|
| `FULL_REBUILD` | Transaction created | Rebuild full knowledge incl. OCR of documents |
| `DOCUMENT_UPLOADED` | Document(s) added | Re-extract document text (Textract) + rebuild |
| `MESSAGE_ADDED` | Chat message sent | Rebuild metadata + messages, **skip** costly OCR |
| `VERIFICATION_UPDATE` | Party verified | Refresh transaction state facts |

## 8. File Storage

- Multer keeps uploads **in memory** (no disk writes); buffers are streamed to S3 via `@aws-sdk/lib-storage`'s multipart `Upload`.
- Keys follow `user-transaction/<transactionId>-<customName>`; the `Document` record stores `bucket` + `s3Key` so the AI service's Textract jobs can address the exact object.
- Deletes remove both the S3 object and the metadata document.

## 9. Resilience & Operations

- **Process safety net**: `uncaughtException` / `unhandledRejection` handlers log (Winston) and keep the process alive; Docker `restart: always` covers hard crashes.
- **Rate limiting** on the whole API plus a stricter limiter on `forgot-password` (abuse-prone endpoint).
- **CORS** is a strict allowlist of four known origins; requests with no Origin (server-to-server, curl) pass.
- **Helmet** applies standard security headers; JSON bodies capped at 10 kb (uploads go through multipart, not JSON).
- **Logs** persist across container restarts via the `./logs:/app/logs` volume.
- **Health probe**: `GET /health`; a catch-all responds `I am alive` to any unmatched non-socket path.

## 10. Deployment Topology

```
GitHub (main) ── Actions ── SSH ──▶ EC2 host
                                      ├── docker compose (hisaab-net network)
                                      │     └── hisaabkitaab-server :5000
                                      └── ai-service container :8000 (same network)
MongoDB Atlas ◀── both services
S3 / SQS / SES / Textract ◀── IAM credentials
```

The shared external Docker network `hisaab-net` lets the backend reach the AI service by container name, keeping the internal API key off the public internet where possible.

---

**Author:** Chandan Pandey · **© hisaabkitaab.ai** — All rights reserved.
