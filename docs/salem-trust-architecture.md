# Salem Two-Mode Trust Architecture — Technical Specification

**Status:** design proposal. Not implemented. Requires CTO approval.
**Scope:** how Salem supports both private (end-to-end encrypted) and
verified (server-readable, policy-enforced) communication on the Tinode
engine **without modifying frozen core**.

Related: `docs/salem-current-state.md`, `docs/salem-verification-gates.md`.

---

## 1. The problem being solved

Tinode core has **no end-to-end encryption** (verified: no Signal/MTProto/
X3DH/double-ratchet code exists anywhere in the repo). Its one message-
inspection surface is the plugin system, which sits in front of everything:

```
server/session.go:471   pluginFireHose(s, msg)   <- FIRST block, before auth
server/plugins.go:386   p.client.FireHose(ctx, req)
pbx/model.proto         ClientReq { ClientMsg msg; Session sess }
```

`ClientReq.msg` is the **full plaintext ClientMsg**. `Session` carries
`user_id`, `auth_level`, `device_id`, `remote_addr`.

So today, any deployed plugin sees every message in the clear before
authentication even happens.

**You cannot have both strong privacy and server-side policy in the same
message.** That is a mathematical property of E2EE, not an engineering
gap. The only honest resolution is two modes with different guarantees,
labeled unambiguously, never blurred.

---

## 2. Trust model

### Mode A — Private (end-to-end encrypted)

| Property | Value |
|---|---|
| Content on server | Ciphertext only |
| Policy service can read? | **No** — cryptographically impossible |
| Server compromise exposes content? | **No** |
| DLP / retention / audit | Not available **by design** |
| Multi-device | Yes, via prekey bundles |
| Push notification preview | **Must be generic** ("New message") |

The privacy guarantee comes from **cryptography, not from the policy
service's honesty**. This is the load-bearing property: a malicious or
compromised Salem server still cannot read private conversations. That is
what makes "auditable server" a credible claim rather than a slogan.

### Mode B — Verified (server-readable, policy-enforced)

| Property | Value |
|---|---|
| Content on server | Plaintext |
| Policy service can read? | Yes — that's the product |
| DLP / retention / audit | Full |
| Legal hold | Yes |
| Export | Server-side, authoritative |
| Server compromise exposes content? | **Yes** — must be disclosed |

### Asymmetry that makes this tractable

Private mode needs no server cooperation to stay private. Verified mode
needs no cryptography. So **the policy service can fail in only one mode
without breaking the other** — see §6.

---

## 3. Discriminator: encryption, not a flag

**Critical design decision:** mode is determined by *whether the payload is
encrypted*, not by a server-side flag.

A server-side `is_private: true` flag is worthless — anyone with server
access flips it, which defeats the entire purpose. Instead:

- **Private mode:** client replaces `MsgClientPub.Content` with a
  `SalemCiphertext` envelope (see §5.2). Server transports it opaquely.
- **Verified mode:** client sends normal Drafty in `Content`.

The policy service can *classify* a message (is this an envelope or
Drafty?) but in private mode it can only ever see the envelope.

### Why the server can treat it opaquely

Verified: the core never parses `Content`.

```
server/topic.go:1236   saveAndBroadcastMessage(..., msg.Pub.Head, msg.Pub.Content)
```

`Content` is a string passed straight through. The only importer of
`server/drafty` in the entire repo is `server/push/fcm/payload.go` — i.e.
Drafty interpretation is a **client** concern plus one push path. This is
what makes client-side E2EE possible with **zero core changes**.

---

## 4. Component architecture

```
                    ┌──────────────────────────────┐
   private mode     │  salem-webapp (client)        │
   ────────────────▶│  ├─ E2EE codec (Signal)       │
   verified mode    │  ├─ Drafty renderer            │
   ────────────────▶│  └─ mode-aware composer        │
                    └──────────────┬────────────────┘
                                   │ Content = ciphertext | Drafty
                    ┌──────────────▼────────────────┐
                    │  Tinode core (FROZEN)          │
                    │  session → hub → topic → store │
                    └──────────────┬────────────────┘
                                   │ FireHose(ClientReq)
                    ┌──────────────▼────────────────┐
                    │  salem-policy-service          │
                    │  ├─ FireHose  (classify+gate)  │
                    │  ├─ Topic     (mode creation)  │
                    │  ├─ Message   (mirror/archive) │
                    │  ├─ Account   (retention)      │
                    │  └─ Find      (search)         │
                    └──────────────┬────────────────┘
                                   │
                    ┌──────────────▼────────────────┐
                    │  salem_* tables (separate      │
                    │  migration runner)             │
                    │  topic_class, audit, retention │
                    └───────────────────────────────┘
```

### Core changes required: **none**

Every component above is client-side, plugin-side, or schema-side. The
frozen files in `docs/salem-current-state.md` §4 are untouched.

The one exception under investigation is push-preview suppression (§7).

---

## 5. Component specs

### 5.1 Policy service — `salem/policy-service/`

Go, gRPC, implements `pbx.Plugin` (all six RPCs, `pbx/model.proto:18-40`).

Wired via the `"plugins"` key in `server/tinode.conf` using the filter
config from `server/plugins.go:183-199`.

#### Filter scoping — what the filters can and cannot do

`ParsePluginFilter` (`server/plugins.go:84`) supports three dimensions:
`plgFilterByPacket`, `plgFilterByTopicType`, `plgFilterByAction`
(`server/plugins.go:62-64`), configured as
`"<packets>;<topic types>;<CUD actions>"`.

**Known limitation, explicitly documented upstream** (`plugins.go:189,192`):
FireHose and Account filters **cannot** match exact topic or user names
("not supported yet"). Only `Topic`, `Subscription`, and `Message` filters
accept exact names (`plugins.go:196,198`).

**Consequence:** you cannot scope FireHose to "org conversations only, not
private DMs" — both are topic type `p2p`. Therefore:

- The **filter is a coarse volume gate** (which packets to inspect), not the
  policy boundary.
- **Fine-grained policy lives in the plugin**, keyed on `req.Topic` looked
  up in `salem.topic_class`.

Do not rely on `plgFilterByTopicType` for the private/verified boundary.

#### FireHose behavior

```
1. Classify: envelope or Drafty?  → if envelope, CONTINUE immediately
                (do not log, do not retain, do not index)
2. Load topic_class[req.Topic]
3. If verified mode:
     - DLP rules → DROP or RESPOND with error ctrl
     - retention window → DROP if expired
     - mirror content to salem_message for export/search
4. Return CONTINUE / DROP / REPLACE / RESPOND
```

Per `server/plugins.go:388-417`: `CONTINUE` (default), `DROP` (silent,
returns `nil, nil` → `session.go` aborts), `REPLACE` (mutate ClientMsg),
`RESPOND` (return alternative ServerComMessage).

#### Fail-open / fail-closed

Configured per plugin via `failureCode` / `failureText`
(`server/plugins.go:406-417`).

- **Verified mode: fail-CLOSED.** Policy service unreachable → refuse the
  send. Correct: the user's content would otherwise land outside retention.
- **Private mode: fail-OPEN.** Unreachable policy service → allow. Correct:
  E2EE already protects the content; the policy service adds nothing there.

The classification happens *inside* the service, so the practical rule is:
**on service error, DROP unless the payload is an envelope.** Since the
service classifies first, it can distinguish before it dies — configure
`failureCode` accordingly and document the window.

#### Timeout

`defaultPluginTimeout = 5 * time.Second` (`server/plugins.go:18`),
overridable per plugin (`plugins.go:272`). Budget policy evaluation well
under this; DLP regex over long Drafty payloads is the risk.

### 5.2 Private-mode envelope

Wire format for `MsgClientPub.Content` in private mode:

```json
{
  "salem": "enc/1",
  "alg": "x25519-xchacha20-poly1305",
  "kid": "base64url(prekey-id)",
  "nonce": "base64url(24 bytes)",
  "ct": "base64url(ciphertext)"
}
```

- **Alg agility:** the `alg` field permits later migration without
  protocol change.
- **`kid` indirection:** receiver looks up the prekey in the sender's `slf`
  topic, so key rotation does not require re-sending the message.
- The server must never treat this as Drafty.

`drafty.PlainText()` on this envelope returns empty — this is the
correct, safe failure and is what keeps private content out of push
previews accidentally (§7).

### 5.3 Prekey bundle storage — `slf` topic

**No new schema required.** `slf` is a per-user private topic with full
permissions (`server/store/types/types.go:1369`: *"topic for saved messages
and notes"*; subscription mode `JRWDO` at line 554).

Device publishes signed prekey bundles as Drafty entities in its own `slf`;
peer fetches via ordinary `p.get`. Reuses the entire existing topic,
subscription, history, and ACL machinery.

Constraints to honor:
- History growth — periodically delete consumed one-time prekeys
- Never mirror `slf` into `salem_*` (policy service must exclude `slf`,
  `sys`, and `usr` topic types from archiving)
- `plfnd` (find) and invite flows must not leak `slf`

### 5.4 Retention & archive — `salem_*` tables

Created by a **separate migration runner**, never by editing
`server/db/postgres/adapter.go` (14 `CREATE TABLE`, lines 342-588).

| Table | Purpose |
|---|---|
| `salem_topic_class` | topic → mode (`private`/`verified`), org, policy id |
| `salem_message` | verified-mode mirror: content, author, ts, attachments |
| `salem_audit` | append-only: who accessed/exported what, when |
| `salem_retention` | per-topic policy: TTL, legal hold, DLP rule set |

**Server-enforced retention replaces sender-chosen disappearing messages.**
Sender-chosen expiry is broken by design — it silently destroys the
recipient's copy without their consent. Server policy decides; the user
can always export before expiry. This is a genuine design improvement over
both WhatsApp and Telegram.

### 5.5 Export

Full-account export: JSON + Markdown + media manifest + `salem_message`
dump. **Verified mode only.** Private-mode export is client-side
(salient warning: it can only export what the client's own keys decrypt —
this is a real limitation to state plainly in the UI).

### 5.6 Mode assignment

- Mode is set at conversation creation via the `Topic` plugin RPC.
- Requires explicit, informed consent from **both** participants.
- Persisted in `salem_topic_class`; **immutable** afterward.
- Downgrading verified → private requires wiping the plaintext mirror
  (retention/audit implications — make this explicit in the UI).
- The UI must display the mode **permanently and visibly**, never a
  toggle that silently changes trust.

---

## 6. Trust boundaries & failure modes

| Failure | Private mode | Verified mode |
|---|---|---|
| Policy service down | **Fail-open** — E2EE protects content | **Fail-closed** — refuse send |
| Policy service slow (>5s) | Fail-open after timeout | Fail-closed |
| Policy service compromised | No content exposure (ciphertext) | Full content exposure — **disclosed** |
| Tinode core compromised | **No content exposure** | Full exposure |
| Malicious client | Can send anything; cannot forge others' identity | Same |
| Malicious server operator | **Cannot read private mode** | Can read verified mode |

The asymmetry is the design: **private-mode safety is independent of server
trust.** That is what distinguishes this from "trust us" messaging.

### Honest disclosure requirements

- Verified-mode conversations must be visibly marked, permanently.
- Cannot be retroactively converted to private without wiping the mirror.
- The Android/iOS app store listings must state that Salem has **no E2EE
  in verified mode** — and there is no E2EE implementation at all yet, so
  **private mode cannot ship until §5.2 is built**. This is a launch blocker
  for any privacy claim.

---

## 7. The one core-change candidate

**Push notification previews currently render message content server-side:**

```
server/push/fcm/payload.go:48   drafty.PlainText(pl.Content)
server/push/fcm/payload.go:62   drafty.Preview(pl.Content, push.MaxPayloadLength)
```

For an envelope payload these fail benignly (empty preview), so this is
not a plaintext leak. But it is a **functional break**: private-mode
pushes would show "New message" rather than content, which is exactly the
desired behavior — however it must be *intentional*, not accidental.

Required work: make "suppress content in push" an explicit, configured
behavior rather than an emergent one, and align with the product's
batched/quiet notification principle.

**Investigate first** whether `server/push` already exposes a config knob
for this. If not, the change is additive and narrow (a boolean in push
config + honoring it in `payload.go`) — not a structural refactor of frozen
core. `server/push/payload.go` and `fcm/payload.go` are **not** in the
frozen file list.

---

## 8. Build order

| # | Step | Gate |
|---|---|---|
| 0 | Fix Docker to build from source | Container runs *this* checkout (`docker/tinode/Dockerfile:175`) |
| 1 | `salem-webapp` scaffold + `tinode-js` SDK | Real login, real 1:1 message round-trip |
| 2 | Policy service skeleton, all 6 RPCs, `CONTINUE` only | Unit tests; **no enforcement yet** |
| 3 | `salem_*` migration runner | Fresh DB init; rollback path |
| 4 | `slf` prekey storage (plaintext first) | Bundle publish/fetch works |
| 5 | E2EE codec + envelope | Private mode works with **policy service stopped** |
| 6 | Policy enforcement + retention + DLP in verified mode | Fail-closed behavior tested |
| 7 | Push preview suppression | No content in private-mode push |
| 8 | Export | Verified export complete; private export limitation documented |

**Step 5 is the true milestone.** It is the first step where private mode
is safe against a hostile server, and therefore the first point where
"auditable server" is a defensible claim.

### Verification requirements

- `.github/workflows/verify.yml` path filters are `server/**`,
  `tinode-db/**`, `pbx/**`, `go.mod`, `go.sum` — **they will not trigger on
  `salem/**` or `salem-webapp/**`.** Must be extended or new Salem work
  ships untested.
- Only Postgres is verified (Gates 1-3). Do not claim other adapters.
- `-race` requires Linux + gcc (`docs/salem-verification-gates.md` Gate 1).
- Any change touching `server/store/store.go` requires re-running Gate 2
  (23/23 regression) and Gate 3 (backup/restore).

---

## 9. Open decisions for the CTO

1. **Launch order.** Private mode (step 5) or verified mode (step 6) first?
   Shipping verified-only means shipping with *no* privacy story — a
   serious liability given the positioning. Recommend private first.
2. **Crypto library.** Signal's `libsignal` bindings vs a maintained Go
   implementation vs a library-audit-first spike. Do not hand-roll.
3. **Retention default.** Does verified mode default to retaining, or to
   user-controlled? Legal/org buyers will want a default; consumer buyers
   will not accept one.
4. **GPL posture.** GPL3.0 obligates publishing server modifications. This
   is *compatible* with auditable-server positioning and *incompatible*
   with a proprietary hosted backend. Which business is this?
5. **Is `Find`/full-text search acceptable as plaintext-only?** Search over
   encrypted history requires the index on-device. Scope decision.

---

## 10. What this document does not claim

- No claim that the crypto is safe — none is implemented.
- No claim of E2EE in verified mode, which is impossible by definition.
- No claim that Tinode core is unchanged *and* that push previews are
  already correct. §7 is open.
- No timeline. The estimates in the earlier plan output were unsupported by
  repository evidence and are deliberately omitted.