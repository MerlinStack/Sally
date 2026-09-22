# AXIZ Verification Gates (Phase 2A.2)

Closes the three environmental blockers from Phase 2A.1 with evidence, not
claims. Frozen core untouched: no Go, protocol, schema, or config changes —
only this file, the CI workflow, and out-of-repo staging artifacts in the
operator temp dir (never committed).

## Gate 1 — Linux race test

* Command: `go test -race -tags postgres ./server -count=1`
* Prerequisites: Go ≥ 1.26 per `go.mod`, cgo-capable toolchain (gcc), Linux
  for the canonical run. Server unit tests use the mock store (no DB needed);
  the `postgres` tag additionally compiles the real adapter.
* Local attempt (this host): BLOCKED with exact evidence —
  `go test -race` fails with `go: -race requires cgo` (`CGO_ENABLED=0`, no
  gcc, Windows_NT, Go 1.26.5); Docker fallback also blocked (only
  `golang:1.22-alpine` cached, no gcc inside, and the daemon has no registry
  egress: `apk`/pull fail DNS, while `go 1.26.0` > toolchain 1.22 regardless).
* Durable closure: `.github/workflows/verify.yml` (GitHub-hosted
  `ubuntu-latest`: gcc present) runs build + DB init + unit + race on every
  push/PR touching `server/**`, `tinode-db/**`, `pbx/**`, `go.mod`/`go.sum`.
* Compatibility answer: YES — `go build -tags postgres ./server` succeeds
  (75 MB staging binary built 2026-09-21), so nothing is missing from the
  repo for the race command itself; only the toolchain/host was missing.
* CI execution (Linux environment that local Windows lacked):
  * Run 1 (`2c8a9c25`, 2026-09-22): FAILURE, Category A (CI config only) —
    `Initialize ephemeral database` exited 1 with
    `Failure: ERROR: database "tinode" already exists (SQLSTATE 42P04)`.
    Root cause: the workflow set `POSTGRES_DB: tinode`, so the service
    pre-created an empty `tinode` DB (no schema); `init-db` then issued a
    plain `CREATE DATABASE tinode` (`server/db/postgres/adapter.go`
    `CreateDb`, no `IF NOT EXISTS`) and failed. No application code involved.
    Fix (workflow-only, commit `4e39cc5b`): removed `POSTGRES_DB` so the
    service keeps the default `postgres` maintenance DB and `init-db`
    creates `tinode` itself.
  * Run 2 (`4e39cc5b`, 2026-09-22, `verify` #2,
    https://github.com/MerlinStack/Axiz/actions/runs/35705238231):
    **SUCCESS** — all steps green: build + DB init (`Database successfully
    created`, `All done`) + `go test ./server -count=1`
    (`ok github.com/tinode/chat/server 0.043s`) +
    `go test -race -tags postgres ./server -count=1`
    (`ok github.com/tinode/chat/server 1.145s`, exit 0, no DATA RACE).
    Runner: `ubuntu-24.04` (24.04.5 LTS, image 20260907.300.1),
    Go `go1.26.8 linux/amd64` (`CGO_ENABLED=1`, `CC=gcc`),
    service `postgres:16-alpine` (healthy via `pg_isready -U postgres`).
* Status: **PASS** — local execution remains BLOCKED as documented above
  (Windows `CGO_ENABLED=0`, no gcc); CI provided the Linux execution
  environment and the actual race test subsequently passed.

## Gate 2 — Staging 23/23 regression

Staging stack (all disposable, all outside the repo; dev `tinode-postgres`
and dev `:6060` server untouched throughout):

* Server: `v0.25` built from this tree (`go build -tags postgres`),
  `DB adapter postgres`, standalone, config derived from
  `server/tinode.local.conf` with `listen :6061`, `grpc_listen :16061`,
  Postgres `:5434`, uploads redirected to temp.
* Go 1.26.5, PostgreSQL `postgres:16-alpine` (fresh container
  `axiz-staging-pg`, `:5434`), seed via stock `init-db.exe` +
  `tinode-db/data.json` (sample users incl. `alice`/`bob`).
* Probe: `axiz_probe2.mjs` with only the host port `6060→6061` changed;
  semantics identical (`202 Accepted` on `pub noecho`, fire-and-forget
  `note`, `acc user:new*`, `422` without email cred).
* Result 2026-09-21: **DONE 23/23** — startup, HTTP `200`, expvar `200`,
  WS `hi 201`, basic auth for both users, `me` + p2p subs, realtime
  `{data}` with assigned `seq`, presence, `recv/read → info`, second-device
  sync on both devices, history `208`, account creation `201`.
* Restart (stopped after verification; data persists in the container):
  `docker start axiz-staging-pg`, then run the staging binary with the
  staging config from the temp dir (see Phase 2A.2 report for paths).
* Status: **PASS**.

## Gate 3 — Backup / restore

* Backup (read-only against dev, 2026-09-21):
  `docker exec -e PGPASSWORD=postgres tinode-postgres pg_dump -h localhost
  -U postgres -Fc tinode -f /tmp/axiz-gate3.dump` → 131,366 bytes, copied
  out via `docker cp`. Dev database never written, never reset.
* Restore (separate target, separate container):
  `docker exec … axiz-staging-pg createdb … tinode_restore_verify` then
  `pg_restore … -d tinode_restore_verify` → exit 0, no errors.
* Validation: row counts identical on both sides —
  `users=15, topics=21, messages=120, subs=75`; 15 basic auth records present.
* App-level proof: staging server pointed at `tinode_restore_verify`
  (config identical except `DBName`), full probe re-run → **DONE 23/23**.
* Status: **PASS** (procedure in `docs/axiz-phase1-production.md` §6
  corroborated verbatim: same tools, same flags, same separate-target rule).
* Note: `RESET_DB=true` was never used; `tinode-postgres` and dev data were
  never at risk — every write landed in the staging container or temp files.
