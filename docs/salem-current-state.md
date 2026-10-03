# Salem — Current State

**Status:** authoritative current-state document for the Salem repository.
**Scope:** this file describes what Salem *is today*. It supersedes nothing
historical; older documents remain as records of past work.

---

## 1. What Salem is

Salem is a **Tinode-derived communication product**. It is a serious,
standalone messaging and communication application built **on top of** the
proven Tinode messaging engine.

Salem is **not** a fork that has rewritten Tinode's core. The Tinode server
architecture is retained intact and unmodified.

```
Salem (product direction, branding, roadmap)
  └── built on
        └── Tinode chat server (communication engine, GPL 3.0)
              └── PostgreSQL via server/store + server/db adapters
```

### Canonical spelling

The product name is **Salem**. One spelling only. The former names
(`AXIZ` / `Axiz` / `Axis`) are retired and must not be reintroduced as
product branding.

### Attribution

This repository is a derivative of [Tinode/chat](https://github.com/tinode/chat),
which is licensed **GPL 3.0**. Tinode remains the underlying engine and its
copyright, license, and `CONTRIBUTING.md` / `LICENSE` / `docs/CLA.md` terms
continue to apply to the inherited code. See `LICENSE` and `docs/CLA.md`.

---

## 2. Product scope

### In scope now (communication only)

| Capability | Engine |
|---|---|
| User accounts / authentication | Tinode `server/auth` |
| User profiles | Tinode `server/user.go`, `p.pub` |
| Contacts | Tinode server-side contact resolution (`p.contacts`) |
| 1-to-1 conversations (`p2p`) | Tinode `init_topic.go` |
| Group conversations (`grp`) | Tinode `init_topic.go` |
| Channels (`chn`) | Tinode `init_topic.go` |
| Realtime messaging | Tinode `session.go` / `hub.go` / `topic.go` |
| Presence | Tinode `topic.go`, `ua.pres` |
| Typing indicators | Tinode `k.tp` |
| Delivery / read states | Tinode `recv` / `read` |
| Replies, reactions, mentions, edit/delete | Tinode drafty + `msg`/`del` |
| Message history | Tinode `store` + `p.get` |
| Media / file sharing | `server/media` |
| Voice notes | Tinode (where supported by client) |
| Push notifications | `server/push`, `pbx` |
| Search | Tinode (where supported) |
| Blocking / muting / reporting / privacy | Tinode ACL + `server/validate` |
| Calls | **Later phase** |

### Explicitly deferred

The following are **NOT** part of Salem and must not be implemented,
architected, or introduced without a new CTO-approved scope:

- Wallet
- Payments
- KYC / identity verification
- Banking
- Ledger
- Commerce / marketplace
- Government services
- Mini-app ecosystem
- AI platform
- Financial identity or domain architecture
- Any other super-app module

These are not "planned features". They are **out of scope for the current
phase**. The product may grow later; the current engineering target is a
serious standalone communication application.

---

## 3. Git model

### Branches

```
upstream: tinode/chat  (READ-ONLY reference)
   master  <- Tinode's release line
   devel   <- Tinode's development line

origin: MerlinStack/Salem  (OUR repository — write access)

main      <- canonical Salem development branch
master    <- RETIRED, retained for safety until main is pushed & verified
feature/* <- short-lived branches off main
```

### Remotes

| Remote | URL | Purpose |
|---|---|---|
| `origin` | `https://github.com/MerlinStack/Salem.git` | our Salem repository |
| `upstream` | `https://github.com/tinode/chat.git` | Tinode upstream (read-only) |

> **Note:** the original task brief assumed an `upstream/main` branch.
> Tinode does **not** have one — its default branch is `master`, with `devel`
> as the development line. Use `upstream/master` / `upstream/devel`.
> This is a documented deviation from the brief, not an error.

### Current position relative to upstream

At the time of writing: `main` is **3 commits ahead** of
`upstream/devel`/`upstream/master` (merge-base `a4d12e3f`) and **4 behind**.
History is linear and un-diverged — no merge, no rebase, no history rewrite.

The 3 Salem commits are CI and verification work only. They touch
`.github/workflows/verify.yml` and `docs/`. **They do not modify Go,
protocol, schema, or config code.**

---

## 4. Protected Tinode core

The following files are **frozen**. Do not refactor them for branding, for
aesthetics, or for product reasons without concrete evidence and an explicit
decision:

- `server/session.go`
- `server/sessionstore.go`
- `server/hub.go`
- `server/topic.go`
- `server/topic_proxy.go`
- `server/init_topic.go`
- `server/store/store.go`
- `server/store/types/`
- `server/db/adapter.go`

### Preserved architecture

```
Client
  ↓
WebSocket / Long Poll / gRPC
  ↓
Session
  ↓
Hub
  ↓
Topic
  ↓
Store.Adapter
  ↓
PostgreSQL
```

This architecture is proven. Salem's value is built **around** it.

### Compatibility-sensitive identifiers — DO NOT RENAME

These are part of the Tinode wire protocol, public API contract, or Go module
identity. Renaming them is a breaking change with no product benefit:

- Go module path `github.com/tinode/chat` (`go.mod`)
- HTTP header `X-Tinode-APIKey` (`server/http.go`, `docs/API.md`, `tn-cli`,
  `loadtest`)
- Wire-level headers, protocol verbs, and API names in `docs/API.md`
- Tinode client SDK compatibility identifiers and app-store identifiers
- Config keys and DB identifiers required by the engine
  (`p2p`, `grp`, `chn`, `self`, `sys`, `me`, `fnd`, `nrp` topic types;
  `store_config`, `uid_key`, `use_adapter`, etc.)
- Tinode schema objects (`auth_basic`, `pg_...` tables) and seed data

The objective is **Salem branding on top of Tinode technology**, not
destructive renaming of Tinode's protocol.

---

## 5. Deployment — known blocker

**Current state: the Docker configuration builds UPSTREAM TINODE artifacts,
not this checkout.** This is a known, documented blocker, not a defect
introduced by Salem.

### Files requiring future correction

| File | Line | Problem |
|---|---|---|
| `docker/tinode/Dockerfile` | 175 | `ADD https://github.com/tinode/chat/releases/download/v$BINVERS/tinode-$TARGET_DB.linux-amd64.tar.gz` — downloads an upstream release binary |
| `docker/chatbot/Dockerfile` | 28 | same pattern for `py-chatbot.tar.gz` |
| `docker/exporter/Dockerfile` | 34 | same pattern for `exporter.linux-amd64` |
| `docker/docker-compose/single-instance.yml` | 19, 108 | `image: tinode/tinode:latest`, `tinode/exporter:latest` |
| `docker/docker-compose/cluster.yml` | 19, 24 | same |

Consequence: `docker build` / `docker compose up` on this repository
produces a runtime that is upstream Tinode and **silently ignores** any local
`server/` changes.

### The correct path today

```sh
go build -tags postgres -o salem-server ./server
```

This is what CI already does — see `.github/workflows/verify.yml`, which
builds the local checkout and runs unit + race tests against it. The CI
workflow is the reliable reference; the Docker path is not.

Each affected Dockerfile now carries a `SALEM WARNING` header so this cannot
be missed by a future operator. Redesigning the Docker build to compile from
source is **deferred to a dedicated task**.

---

## 6. Documentation state

### Current / authoritative

- `docs/salem-current-state.md` — this file
- `docs/salem-verification-gates.md` — CI + staging verification evidence
  (renamed from `axiz-verification-gates.md`; historical `axiz-*` evidence
  identifiers inside are deliberately preserved)

### Inherited upstream documentation (accurate, keep)

- `docs/API.md` — Tinode protocol / API reference. Authoritative for the
  wire protocol. **Do not rebrand.**
- `docs/drafty.md`, `docs/thecard.md`, `docs/faq.md`, `docs/monitoring.md`,
  `docs/call-establishment.md`, `docs/translations.md`
- `README.md`, `INSTALL.md`, `CONTRIBUTING.md`, `SECURITY.md`, `LICENSE`,
  `docs/CLA.md`

These describe Tinode, which is correct: they document the engine Salem is
built on. They are not stale.

### Historical / retired

- `docs/axiz-verification-gates.md` → renamed to
  `docs/salem-verification-gates.md`
- `docs/axiz-phase1-production.md` — **referenced but never committed to this
  repository.** The reference in the verification-gates doc has been annotated
  to say so. Not recreated here, because inventing it would fabricate a
  record.
- `axiz-staging-pg`, `axiz-gate3.dump`, `axiz_probe2.mjs` — names of real
  artifacts from the 2026-09-21/22 staging runs. Preserved verbatim as
  evidence. Not product branding.

---

## 7. Component status

### Production-relevant

- `server/` — the Tinode chat server (auth, session, hub, topic, store, push,
  media, drafty, validate, auth adapters)
- `tinode-db/` — schema DDL + seed data + `init-db`
- `pbx/` — gRPC/protobuf client definitions
- `.github/workflows/verify.yml` — the only Salem-authored CI

### Deferred / not on the roadmap

- `chatbot/` — Tino chatbot. Unused by Salem.
- `docker/`, `docker-compose` — inherited upstream, see the blocker above.
- `exporter/`, `monitoring/` — inherited Prometheus metrics tooling.
- `loadtest/` — Tsung load profiles.
- `pbx/py_grpc`, `tn-cli`, `keygen`, `rest-auth` — inherited helper clients.

### Experimental / deferred

- **`server/identity/` — DOES NOT EXIST in this repository.**
  It is absent from `main`, from `master`, and from every ref in the local
  object database (`git log --all -- server/identity` returns nothing; no
  commit ever added a path matching `identity`). It was never committed here.
  Because it is not present, it cannot be integrated, deleted, or remediated
  in this repository, and nothing in the messaging path depends on it. Any
  prior review that described this package was describing a different tree
  (most likely another repository or an uncommitted working directory).
  If it is to be revived, that is a separate task with its own review — the
  previously noted Tinode UID-conversion concern would have to be re-verified
  from scratch, since there is no code here to read.

---

## 8. Current known blockers

1. **Docker builds upstream artifacts, not Salem.** See §5. Blocks any
   container-based Salem deployment. Workaround: build the binary directly.
2. **No Salem client/UI in this repository.** Tinode's clients live in
   *separate upstream repositories* (`tinode/webapp`, `tinode/react-native-app`,
   `tinode/ios`). There is no `webapp/` directory here. A Salem client is net-new
   work with a dedicated design system — not yet started.
3. **`main` is not yet pushed to `origin`.** `origin` still has `master` as its
   default branch and has never received `main`. Until `main` is pushed and the
   remote default is switched, collaborators cloning `origin` get `master`.
   Deliberately not pushed during this task.
4. **Local `-race` testing is blocked on this host.** `CGO_ENABLED=0` and no gcc
   on Windows. CI provides the Linux/gcc environment; see
   `docs/salem-verification-gates.md` Gate 1.

---

## 9. Verification

```sh
go build ./server                    # builds local checkout
go test ./server -count=1            # unit tests, mock store, no DB required
go vet ./server
```

Canonical full verification is `.github/workflows/verify.yml`
(build → DB init → unit tests → race detector on Linux).

---

## 10. Reference

- Engine / protocol: <https://github.com/tinode/chat>
- Wire protocol reference: `docs/API.md`
- Upstream contribution terms: `docs/CLA.md`, `CONTRIBUTING.md`