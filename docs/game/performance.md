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

Build 26 adds `trafficStall.test.js`: sixty deterministic level-three routes
must keep progressing, including opposing turns, mixed queues and cars carried
over from older junctions. Entry reservations hold incoming vehicles outside
an occupied crossing. Queue spacing uses the lead vehicle's dimensions; tram
stopping positions also allow for turning vehicles' swept corners. Changing
the player's turn rechecks dependencies before releasing newly prioritised
traffic. Departing traffic continues beyond the end of its cached road path.

Build 28 replaces the visual rail-connection workaround with compatible street
layouts. `streetNetwork.test.js` checks track continuity, constant road widths,
opposing-tram clearance, and guide recovery after joining a tram street by
mistake. Trams continue on their own straight tracks, independently of the
player. `pathHint.test.js` checks that roundabout previews stay on the road.

Build 29 moves native camera and vehicle transforms into Reanimated SVG groups.
The simulation and React snapshots update at 30 Hz; the UI thread interpolates
position and heading between snapshots at the display cadence. Heading wrapping
uses the shortest turn, and the simulation remains authoritative for collisions
and input. Interpolation adds at most one snapshot of visual latency. Web keeps
its existing display-rate SVG updates. The native and web implementations share
the same `MotionGroup` interface.

Native sampling also identified repeated Core Graphics image resampling and SVG
painting on the main thread. `RoadSurface.native.tsx` separates the static road
from the moving vehicles and path hints, rasterizes an overscanned road view,
and moves that view with the native compositor. The cached surface is refreshed
when its 64-unit world anchor, road layout, or traffic lights change. Its bounds
cover the farthest viewport corner at any heading plus anchor rounding, so a
turn cannot reveal the edge of the surface. This trades some texture memory for
avoiding hundreds of SVG/image draws on every movement frame.

September 20 diagnostic recordings with the production Hermes bundle in the
iPhone 17 Pro simulator averaged 38.6 recorded frames/second before road caching
and 58.6 after. These sampled different portions of the same guide and are not
a controlled physical-device FPS benchmark. Native sampling showed the earlier
main-thread cost in Core Graphics image resampling and SVG painting; the cached
version reduced that work. Its sampled footprint was about 197 MB (313 MB peak),
versus 152 MB before caching. Validate memory, frame pacing and thermal behavior
on the installed iPhone build as well.

Rotated-body collision checks now use scalar separating-axis calculations without
allocating shapes, arrays or callbacks for each pair. Vehicle dimensions and
approach lengths are cached; long route lookups use binary search. Player and NPC
movement use identical bumper clearance so a stopped queue can pull away again.

Roundabout arrival and crossing duration now depend on path length, with an
18-unit/second cruise limit (up to 21.18 while completing the existing start-from-rest
profile). Incoming cars slow before an occupied entrance. Collision-free approaches
can run concurrently instead of waiting for an entire previous approach and traversal.
`roundaboutMotion.test.js` checks speed bounds across generated paths, yielding
outside an occupied ring, and resuming after it clears. Existing traffic-stall,
body-separation and prolonged-roundabout-stop tests remain release checks.

Build 32 removes animated SVG transforms from the scrolling native game. Cars
are small cached native layers, and roads, path hints and cars use one shared
camera. Vehicle artwork is still shared with the web and junction previews.
Moving a car no longer requires repainting the SVG vehicle layer at display rate.

Road patches now have immutable world origins. The camera worklet never captures
the changing cache anchor; a replacement patch is mounted with its own position
and viewBox. This removes the old race between an updated compositor translation
and the previous cached SVG image. Patch coverage includes diagonal anchor error.
The player's position uses the camera's shared values so it cannot drift for a
frame while the separate road and vehicle animations catch up.

The native snapshot scheduler keeps a fixed 30 Hz timeline, tolerates 2 ms of
callback jitter and drops missed slots after a stall. It no longer resets its
deadline to the last callback, which could repeatedly add a display frame of
waiting. `nativeProjection.test.js` checks 60/120 Hz scheduling with jitter,
stall recovery, camera alignment, and patch coverage at all headings.

High-refresh iPhone opt-in is now explicit in app.json as well as the local iOS
plist. The installed Reanimated runtime requests 120 Hz; simulation snapshots
remain separate from native display-rate interpolation. Sustained 120 fps has
not been verified on a physical iPhone. Simulator recordings and production
Hermes interaction checks are useful for regressions, not a device FPS guarantee.

Build 33 keeps the preceding road patch mounted underneath the current patch.
Build 32's keyed replacement could remove the painted surface before its new
SVG acquired backing contents, producing a blink on a physical iPhone even
though camera motion was smooth. Both retained patches share immutable world
coordinates and live road/signal content. Only the oldest patch is removed on
the next handover; reversing over a boundary reuses both mounted views. Two
patches bound the additional texture memory. Path hints remain a single layer
so their translucent arrows do not become darker through duplicate compositing.
`roadCache.test.js` covers retention, retirement, reversal, and old-patch coverage
at a diagonal handover. Camera animation and simulation cadence are unchanged.

Build 34 replaces the oversized scrolling path-hint SVG with an 80-by-80
world-unit surface around each visible traffic vehicle. At a 393-by-700-point
viewport, the old surface covered 488-by-488 world units; three compact hints
cover 92% less total surface area. This is a canvas-area comparison, not an FPS
measurement. Each hint shares the road camera and moves through native view
transforms. Vehicle and hint views are culled outside the viewport plus a
40-unit margin; off-screen traffic still participates in the simulation.
The two retained road patches from build 33 remain unchanged.

`nativePreview.test.js` checks preview bounds and camera alignment across every
guide path and cardinal road rotation, plus visibility margins through camera
turns. The guide pacing changes are covered separately by `guidePacing.test.js`.
The production-Hermes simulator Stop/Go recording contained 1,073 driving
frames with no missing-road frames. This is a targeted blink regression check;
it does not establish physical-device FPS or rule out every type of visual glitch.
