# Streets used in driving practice

Road geometry and vehicle movements must agree. Visual-only rails that join
unrelated junctions are not supported.

- Tram crossings use a straight double-track street across an ordinary
  crossroads or T-junction. Road lanes sit outside the tracks.
- Turning onto that street leads to a T-junction with the same tracks and
  lane widths. The instructor asks for a right turn onto its side road.
  Continuing straight keeps the player on the tram street until a later exit.
- Compact roundabouts have no tram tracks. They are reached along a normal
  street after leaving the tram corridor.
- Trams always remain on the track trajectory. They cannot adopt a car's lane
  or follow the player around a corner.

The continuous guide retains its next exercise while the player follows a
connecting street. Taking a wrong turn onto a tram street does not skip the
roundabout lesson or reset the guide. These connecting junctions use the same
slow coaching speed and do not consume lives.

The generator and renderer share the same `scene.tramTracks` geometry. Road
extensions retain their width; roadside gardens move out with the kerb.
Direction previews follow each vehicle's approach and turn path, including
roundabout entry curves, instead of connecting the car to a distant waypoint
with a straight line.

Run `streetNetwork.test.js`, `junctionStatic.test.js`, `pathHint.test.js`, and
the driving safety suites when changing these layouts. Inspect rendered
tram crossings, the connecting street, and the roundabout after a wrong turn
as well as the correctly followed guide.
