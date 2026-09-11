import { t, tf } from '../i18n/i18n';
import { turnOf } from './priority/geometry';

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

const vehicleName = (record, id, lang) => {
  const v = record.scene.vehicles.find((x) => x.id === id);
  if (v) return t(`crossing.vehicle.${v.color}`, lang);
  if (record.scene.pedestrians && record.scene.pedestrians.length) return t('crossing.log.pedestrians', lang);
  return t('crossing.log.someone', lang);
};

export const instructionLabel = (instruction, lang) => {
  if (!instruction || instruction.kind === 'none') return t('crossing.log.instructionNone', lang);
  return instruction.kind === 'roundabout'
    ? t(`crossing.instr.roundabout.${instruction.turn}`, lang)
    : t(`crossing.instr.${instruction.kind}`, lang);
};

const THEIRS = new Set(['right-hand', 'sign', 'left-turn', 'roundabout', 'queue', 'signal', 'entry']);

/**
 * Turn one junction record into what the log shows: an outcome label, a
 * headline (what happened) and the reasons, one sentence each.
 */
export const explainRecord = (record, lang) => {
  const you = record.scene.vehicles.find((v) => v.id === 'you');
  const went = record.executedTo ? turnOf(you.from, record.executedTo) : you ? turnOf(you.from, you.to) : 'straight';
  const yourMove = t(`crossing.log.youWent.${went}`, lang);
  const instruction = instructionLabel(record.instruction, lang);

  const lines = [];
  let headline;
  if (record.outcome === 'crash') {
    headline = tf('crossing.log.crashWith', lang, { vehicle: vehicleName(record, record.culprit, lang) });
    if (record.rule) lines.push(tf(`rule.${record.rule}`, lang, { vehicle: vehicleName(record, record.culprit, lang) }));
  } else if (record.wrongWay && record.laps > 0) {
    headline = tf('crossing.log.missedExit', lang, { instruction });
  } else if (record.wrongWay) {
    headline = tf('crossing.wrongWay', lang, { instruction });
  } else if (record.cutIn) {
    headline = tf('crossing.cutIn', lang, { vehicle: vehicleName(record, record.cutIn, lang) });
  } else if (record.ranRed) {
    headline = t('crossing.redLight', lang);
  } else if (record.ranStop) {
    headline = t('crossing.ranStop', lang);
  } else if (record.hesitated) {
    headline = t('crossing.hesitated', lang);
  } else if (record.late) {
    headline = t('crossing.late', lang);
  } else if (record.stopped && record.lights === 'cross-first') {
    headline = t('crossing.log.clean.lights', lang);
  } else if (record.stopped && record.stopSign) {
    headline = t('crossing.log.clean.stopSign', lang);
  } else if (record.stopped) {
    headline = t('crossing.log.clean.stopped', lang);
  } else {
    headline = t('crossing.log.clean.went', lang);
  }

  // Every rule that involved you, both ways round.
  const yielded = record.reasons.filter((r) => r.who === 'you' && !(record.outcome === 'crash' && r.to === record.culprit));
  const theirs = record.reasons.filter((r) => r.to === 'you');
  for (const r of yielded) lines.push(tf(`rule.${r.rule}`, lang, { vehicle: vehicleName(record, r.to, lang) }));
  for (const r of theirs) {
    const why = t(`crossing.log.theirs.${THEIRS.has(r.rule) ? r.rule : 'other'}`, lang);
    lines.push(tf('crossing.log.yielded', lang, { vehicle: cap(vehicleName(record, r.who, lang)), why }));
  }
  if (!lines.length && record.outcome !== 'crash') lines.push(t('crossing.log.free', lang));

  return {
    outcome: record.outcome,
    outcomeLabel: t(`crossing.outcome.${record.outcome}`, lang),
    headline,
    lines,
    instruction,
    yourMove,
    points: record.points || 0,
  };
};
