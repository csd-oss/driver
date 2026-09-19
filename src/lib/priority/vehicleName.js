import { t } from '../../i18n/i18n';

const COLORS = new Set(['you', 'red', 'blue', 'green', 'yellow']);
/** Vehicle IDs are implementation details, never translation keys. */
export const vehicleName = (vehicle, lang) => {
  if (vehicle?.kind === 'tram') return t('crossing.vehicle.tram', lang);
  if (COLORS.has(vehicle?.color)) return t(`crossing.vehicle.${vehicle.color}`, lang);
  return t('crossing.vehicle.other', lang);
};
