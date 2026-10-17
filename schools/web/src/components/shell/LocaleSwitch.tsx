import { SegmentedControl } from '@/components/ui/segmented-control'
import { LOCALES, type Locale, setLocale, useI18n } from '@/i18n'

/** SK / EN. The choice is remembered in this browser. */
export function LocaleSwitch({ className }: { className?: string }) {
  const { t, locale } = useI18n()
  return (
    <SegmentedControl<Locale>
      aria-label={t('lang.label')}
      value={locale}
      onValueChange={setLocale}
      className={className}
      options={LOCALES.map((l) => ({ value: l, label: l.toUpperCase(), ariaLabel: t(`lang.${l}`) }))}
    />
  )
}
