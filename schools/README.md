# Driver for driving schools

Online accounts and a CRM for Slovak driving schools: a Rust API (`server/`), a web dashboard
(`web/`), and the "Autoškola" feature in the Driver SK app (behind `EXPO_PUBLIC_SCHOOLS_ENABLED`).
Spec: [`docs/schools/SPEC.md`](../docs/schools/SPEC.md). Status: [`docs/schools/REPORT.md`](../docs/schools/REPORT.md).

```sh
schools/dev.sh            # Postgres + server + demo school + dashboard at http://localhost:5190
schools/dev.sh --reset    # reseed the demo school
```

Sign in as `jana@demo.sk` / `driver` (admin) or `peter@demo.sk` / `driver` (instructor).
The dashboard is Slovak by default; the SK / EN switch (sidebar, phone strip, sign-in card) is
remembered per browser. Messages live in `web/src/i18n/{sk,en}.ts`; `npm test` fails if a key is
missing in one language.

| Part | Stack | Commands |
|---|---|---|
| `server/` | Rust 2024, axum 0.8, sqlx 0.9 (Postgres), genpdf | `cargo test` (unit + `#[sqlx::test]` integration on the local cluster), `cargo run -- serve`, `cargo run -- seed --reset` |
| `web/` | Vite 8, React 19, TypeScript, Tailwind 4, TanStack Router + Query, the Stereo/Roadmaper UI kit, SK/EN catalogs in `src/i18n` | `npm run dev`, `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`, `npm run screenshots` |
| `pg.sh` | Homebrew postgresql@16 cluster in `schools/.pg` on port 55436, no Docker | `init` `start` `stop` `status` `url` `psql` |

The app talks to the server at `EXPO_PUBLIC_SCHOOLS_API_URL` (default `http://localhost:8090`);
a phone needs the Mac's LAN address there and in `SCHOOLS_ALLOWED_ORIGINS` is not needed (the app
sends no Origin). The server serves `web/dist` at `/` when it exists (`npm run build`), so
production is one binary plus Postgres.
