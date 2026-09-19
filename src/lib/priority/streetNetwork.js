import { hasTrack } from './layout';

/** Only conventional street layouts are supported by the driving route.
 * A turn onto a tram street continues along a straight, double-track corridor.
 * The next exercise is reached by leaving that street at a side-road junction;
 * never by inventing a rail curve through a compact roundabout.
 */
export const entersTramStreet = previous => {
  const exit = previous?.scene.vehicles.find(v => v.id === 'you')?.to;
  return Boolean(previous && hasTrack(previous.scene, exit));
};

export const tramStreet = () => ({
  id: 'tram-street', layout: 't', arms: ['N', 'E', 'S'],
  signs: { S: 'main', N: 'main', E: 'yield' },
  mainRoad: ['S', 'N'], tramTracks: [{ from: 'S', to: 'N' }],
  control: null, pedestrians: [],
  vehicles: [{ id: 'you', kind: 'car', color: 'you', from: 'S', to: 'E' }],
});
