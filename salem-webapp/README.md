# Salem web client

React + TypeScript client for the Salem server. Salem is a Tinode-derived
communication product; this app is the client for that engine.

**Status: scaffold.** Protocol wiring is real and working — connect,
authenticate, open a conversation, load history, send and receive messages.
Visual design is deliberately not done yet (see *Not in this scaffold*).

## What talks to what

```
salem-webapp  ──WebSocket──▶  Salem server  ──▶  PostgreSQL
  (React/TS)                  (Tinode engine, this repo, ./server)
```

Protocol handling is delegated to [`tinode-sdk`](https://www.npmjs.com/package/tinode-sdk)
(Apache-2.0), the upstream-maintained client. That is deliberate: the engine
owns the wire format, so inheriting protocol correctness lets this project own
100% of the UX instead of forking a protocol implementation.

`src/salem/client.ts` is the only module that imports the SDK. Everything above
it speaks Salem's own types (`src/salem/types.ts`), so protocol details do not
leak into the UI layer.

## Requirements

- Node >= 20 (developed against 24.x)
- A running Salem server. From the repo root:
  ```sh
  go build -tags postgres -o salem-server ./server
  ./salem-server --config=server/tinode.conf
  ```

## Setup

```sh
npm install
cp .env.example .env      # then edit VITE_SALEM_HOST if needed
npm run dev               # http://localhost:5173
```

### Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck, then production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest, single run |
| `npm run test:watch` | Vitest, watch mode |

## Trying it end to end

1. Seed a database and start the server (see above).
2. Create an account — the sample data includes `alice` / `bob`:
   ```sh
   go run ./tinode-db --config=server/tinode.conf --data=./tinode-db/data.json
   ```
3. `npm run dev`, sign in as `alice`.
4. Open a conversation by topic name. To find a peer's topic name, sign in as
   `bob` and read the `usrAlice` topic, or inspect the `subscriptions` table:
   ```sql
   SELECT topic FROM subscriptions WHERE user = '<bob-uid>';
   ```

## Notes for engineers

**`tinode-sdk` ships no types.** `src/salem/tinode-sdk.d.ts` declares them
locally. Two things there were established by introspecting the installed
package, not assumed:

- The package uses **named exports** (`Tinode`, `Drafty`, `AccessMode`,
  `TheCard`). There is no default export, so `import Tinode from 'tinode-sdk'`
  is `undefined`.
- There is **no `on()` or `whenReady()`** method. Realtime delivery works by
  assigning callbacks onto a `Topic` instance:
  ```ts
  topic.onData = (msg) => { /* … */ };
  await topic.subscribe();   // subscribe() takes no callback
  ```

If the SDK is upgraded, re-verify both facts and update the declarations.

**Drafty is flattened to plain text** in `client.ts`. The UI renders text only
and never uses `dangerouslySetInnerHTML`. Drafty rendering is a separate,
security-sensitive task — a rich-text renderer is the largest XSS surface in
the product, so it gets a strict allowlist renderer and sanitisation tests.

**Trust mode is hardcoded to `verified`.** That reflects reality: there is no
E2EE in the server or the SDK. Claiming `private` before the codec exists would
be a lie. See `docs/salem-trust-architecture.md` §8 for the build order.

## Not in this scaffold

Each of these is deliberate and scoped as follow-up work:

- **Visual design.** No Salem design system yet. The CSS here is intentionally
  plain: no glassmorphism, no gradients, no card grid.
- **Contacts / conversation list from the account.** Conversations are opened
  by typing a topic name. Real contact resolution uses the `fnd` topic.
- **Drafty rich rendering.** Plain text only.
- **Push notifications.** Needs the FCM/APNs credentials registered against
  the app's package id and signing identity.
- **E2EE.** Not implemented anywhere in the stack yet.
- **Trust-mode negotiation.** Only the display exists.

## Tests

```sh
npm test
```

Coverage is deliberately aimed at the risky parts: topic-kind classification,
empty-message rejection, XSS inertness of message rendering, and form
accessibility state. There are no live-server integration tests yet — the SDK
is a minified UMD bundle, so faking the protocol boundary is a separate task.

## Licence

Apache-2.0, matching `tinode-sdk` and the Tinode client ecosystem. The server
side of Salem is GPL-3.0 (inherited from Tinode); the licence boundary between
client and server should be reviewed before distribution.