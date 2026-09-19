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
