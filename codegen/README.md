# codegen — protocol code generation

Single source of truth → two clients. The wire protocol lives **only** in
[`server/src/protocol.ts`](../server/src/protocol.ts). This package reads it and
generates the client-side mirrors so they can never silently drift.

```
server/src/protocol.ts  (the ONE true wire protocol)
     │   ts-json-schema-generator  →  JSON Schema (in-memory)
     ├─►  app/src/api/protocol.gen.ts            TS mirror (verbatim copy + header)
     └─►  flutter-app/lib/protocol/protocol.gen.dart   Dart models
```

## Run

```bash
cd codegen
npm install        # first time
npm run gen        # regenerate both targets
npm run schema     # debug: dump the derived JSON Schema to stdout
```

Run `npm run gen` whenever you change `server/src/protocol.ts`.

## What it emits

**TypeScript (`/app`)** — a header-stamped verbatim copy of the source (it is
already valid TS). `app/src/api/protocol.ts` just `export *`s from the generated
`protocol.gen.ts`, so the app keeps its old import paths and type names. This
replaces the old hand-maintained mirror.

**Dart (`/flutter-app`)** — a real translation:

| TS construct | Dart output |
|---|---|
| string-literal union (`PermissionMode`, `EffortLevel`, …) | `enum` with `.wire` value + `fromWire` / `toJson` |
| discriminated union (`WireEvent`, `ClientMessage`, `ServerMessage`) | `sealed class` + one subclass per variant, dispatched by the `kind`/`t` tag |
| `interface` | plain class with `final` fields + `fromJson` / `toJson` |
| inline object literal (e.g. `FileChange.edits[]`) | a synthetic named class |
| `string \| null` (required) | nullable field, always serialized |
| `field?` (optional) | nullable field, omitted from JSON when null |
| `unknown` | `Object?` |

The discriminated unions become Dart `sealed` classes, so `switch` over a
`WireEvent` / `ServerMessage` is exhaustively checked by the analyzer — the
Flutter reducers (`state/transcript.dart`, `state/store.dart`) rely on this.

## Notes

- Only **types** are generated. UI-only consts in `protocol.ts`
  (`PERMISSION_MODE_LABELS`, `EFFORT_LEVELS`) are not part of the typed wire
  schema; the Flutter side keeps a tiny presentation mirror in
  `flutter-app/lib/theme/labels.dart`. `PROTOCOL_VERSION` is parsed out and
  emitted as `kProtocolVersion`.
- The generated files carry a `DO NOT EDIT` header — change the server source
  and rerun, never hand-edit the `.gen.*` files.
