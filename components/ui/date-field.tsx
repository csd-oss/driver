import DateTimePicker, { DateTimePickerAndroid, type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useState } from 'react';
import { Platform, View, useColorScheme } from 'react-native';
import { Button } from './button';
import { formatDate } from '@/src/lib/dates';

export interface DateFieldProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  lang: number;
  placeholder: string;
  minimumDate?: Date;
  maximumDate?: Date;
  testID?: string;
}

// Native date field: a button showing the chosen date. iOS expands an inline
// calendar under it, Android opens the system dialog. The web variant lives
// in date-field.web.tsx and renders a browser date input.
export const DateField = ({ value, onChange, lang, placeholder, minimumDate, maximumDate, testID }: DateFieldProps) => {
  const [open, setOpen] = useState(false);
  const colorScheme = useColorScheme();
  const label = value ? formatDate(value, lang) : placeholder;

  const handleChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS === 'ios') setOpen(false);
    if (event.type === 'set' && date) onChange(date);
  };

  const handlePress = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: value ?? new Date(),
        mode: 'date',
        minimumDate,
        maximumDate,
        onChange: handleChange,
      });
      return;
    }
    setOpen((current) => !current);
  };

  return (
    <View className="gap-2">
      <Button onPress={handlePress} variant="outline" className="w-full" testID={testID} accessibilityLabel={label}>
        {label}
      </Button>
      {open && Platform.OS === 'ios' && (
        <DateTimePicker
          value={value ?? new Date()}
          mode="date"
          display="inline"
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          onChange={handleChange}
          themeVariant={colorScheme === 'dark' ? 'dark' : 'light'}
          accentColor="#6366f1"
        />
      )}
    </View>
  );
};
