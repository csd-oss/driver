/** Shared by rendering and coach visibility checks; UI overlays are excluded. */
export const cameraView = (width, height, you, heading, occludedTop = 108) => {
  const span = Math.max(138, 115 * width / height);
  return { width, height, span, viewHeight: span * height / width, you, heading, occludedTop };
};
export const screenPoint = (point, view) => {
  const rad = -view.heading * Math.PI / 180;
  const dx = point.x - view.you.x, dy = point.y - view.you.y;
  return { x: (view.span / 2 + dx * Math.cos(rad) - dy * Math.sin(rad)) * view.width / view.span,
    y: (view.viewHeight * 0.72 + dx * Math.sin(rad) + dy * Math.cos(rad)) * view.height / view.viewHeight };
};
export const visibleInRoad = (point, view) => {
  const p = screenPoint(point, view);
  return p.x > 12 && p.x < view.width - 12 && p.y > view.occludedTop && p.y < view.height - 12;
};

/**
 * What the coach may talk about at the junction ahead: the junction once its
 * centre has been in the road viewport, and a vehicle from when it was seen
 * there until it leaves the whole screen, so nothing is named unseen and
 * nothing goes quiet when the panel merely covers it.
 */
export const createVisibility = () => {
  const seen = { junction: -1, road: false, vehicles: new Set() };
  return (junction, vehicles, view) => {
    if (seen.junction !== junction.index) { seen.junction = junction.index; seen.road = false; seen.vehicles.clear(); }
    seen.road ||= visibleInRoad({ x: junction.cx, y: junction.cy }, view);
    const visibleVehicles = [];
    for (const vehicle of vehicles) {
      if (vehicle.junction.index !== junction.index) continue;
      if (visibleInRoad(vehicle.pose, view)) seen.vehicles.add(vehicle.vehicle.id);
      else if (!visibleInRoad(vehicle.pose, { ...view, occludedTop: 0 })) seen.vehicles.delete(vehicle.vehicle.id);
      if (seen.vehicles.has(vehicle.vehicle.id)) visibleVehicles.push(vehicle.vehicle.id);
    }
    return { junctionVisible: seen.road, visibleVehicles };
  };
};
