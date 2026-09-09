import { useColorScheme } from 'react-native';
import type { DateFieldProps } from './date-field';
import { formatDate, parseISODate, toISODate } from '@/src/lib/dates';

// Web variant. iOS Safari ignores most styling on a date input and shows
// nothing at all when it is empty, so the visible part is a plain label
// styled like the outline Button, with the real input stretched over it
// at zero opacity to catch the tap and open the native picker.
export const DateField = ({ value, onChange, lang, placeholder, minimumDate, maximumDate, testID }: DateFieldProps) => {
  const dark = useColorScheme() === 'dark';
  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <div
        aria-hidden="true"
        style={{
          boxSizing: 'border-box',
          minHeight: 48,
          padding: '12px 16px',
          borderRadius: 12,
          border: `1px solid ${dark ? '#6366f1' : '#a5b4fc'}`,
          background: dark ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.7)',
          color: dark ? '#c7d2fe' : '#4338ca',
          fontSize: 16,
          fontWeight: 600,
          textAlign: 'center',
          fontFamily: 'inherit',
        }}
      >
        {value ? formatDate(value, lang) : placeholder}
      </div>
      <input
        type="date"
        value={value ? toISODate(value) : ''}
        min={minimumDate ? toISODate(minimumDate) : undefined}
        max={maximumDate ? toISODate(maximumDate) : undefined}
        aria-label={placeholder}
        data-testid={testID}
        onChange={(event) => onChange(event.target.value ? parseISODate(event.target.value) : null)}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          margin: 0,
          padding: 0,
          border: 0,
          opacity: 0,
          cursor: 'pointer',
          fontSize: 16,
          WebkitAppearance: 'none',
          appearance: 'none',
        }}
      />
    </div>
  );
};
