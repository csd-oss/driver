# Driving performance and traffic regression checks

Build 25 keeps the existing SVG road art but bakes the static gardens and junction landscaping into bundled PNG textures. Roads, signs, signals and vehicles remain live vectors. The artwork source lives in `components/game/StreetArtwork.tsx`; regenerate textures with `PLAYWRIGHT_MODULE=/path/to/playwright node scripts/render-driving-art.cjs` (Chrome required; override `CHROME_PATH` if needed).

Vehicle bodies are memoized separately from their moving transforms. Polyline lengths, queue approaches and roll-in paths are cached instead of rebuilt for each vehicle pose. Paths passed to these caches must remain immutable.

Local comparison on September 19, 2026:

| Measurement | Build 24 | Build 25 changes |
| --- | ---: | ---: |
| SVG elements in the same guide run | 2,053 | 673 |
| Simulation benchmark median step + poses | 0.239 ms | 0.130 ms |
| Largest step in that benchmark | 18.44 ms | 5.36 ms |
| Total simulation time for 7,200 frames | 2,680 ms | 1,956 ms |

These are desktop measurements, not physical-iPhone FPS claims. The browser was already smooth before these changes; native drawing overhead was the priority. Simulator interaction checks use a production Hermes bundle. Confirm sustained smoothness and thermal behavior on the installed TestFlight build on a physical iPhone.

Run the opt-in simulation benchmark with:

```sh
npx jest --runInBand --testMatch '**/scripts/benchmarks/*.test.js'
```

`__tests__/practiceSafety.test.js` covers body separation, the continuous guide, wrong turns, braking and resuming within a roundabout, extended stops across twenty generated routes, and cars remaining present while nearby. Departing followers retain their source identity and follow the road actually driven; they are retired out of view. Comfort following applies after departure so it does not disturb reserved crossing trajectories. Long vehicles wait further back to keep their noses out of crossing lanes.

`.maestro/08_crossing.yaml` checks that Play opens driving directly without an intro or guide gate. `.maestro/09_guide.yaml` checks the optional continuous guide and native controls.
