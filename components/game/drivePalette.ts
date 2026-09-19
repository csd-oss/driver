import { useColorScheme } from 'nativewind';
const light = { background: '#ffffff', surface: '#f1f5f9', text: '#0f172a', secondary: '#64748b', accent: '#4f46e5' };
const dark = { background: '#020617', surface: '#1e293b', text: '#f8fafc', secondary: '#94a3b8', accent: '#6366f1' };
export function useDrivePalette() {
  const { colorScheme } = useColorScheme();
  return { ...(colorScheme === 'dark' ? dark : light), dark: colorScheme === 'dark' };
}
