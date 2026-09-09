import { Alert, Platform } from 'react-native';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmText: string;
  cancelText: string;
  destructive?: boolean;
}

// react-native-web does not implement Alert, so every confirmation in the
// app goes through this helper: native gets the system alert, web gets the
// browser's confirm() which is the only blocking dialog a PWA has.
export const confirmDialog = ({ title, message, confirmText, cancelText, destructive }: ConfirmOptions) =>
  new Promise<boolean>((resolve) => {
    if (Platform.OS === 'web') {
      const text = message ? `${title}\n\n${message}` : title;
      resolve(typeof window !== 'undefined' && window.confirm(text));
      return;
    }
    Alert.alert(
      title,
      message,
      [
        { text: cancelText, style: 'cancel', onPress: () => resolve(false) },
        { text: confirmText, style: destructive ? 'destructive' : 'default', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });

export const alertDialog = (title: string, message?: string) =>
  new Promise<void>((resolve) => {
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.alert(message ? `${title}\n\n${message}` : title);
      resolve();
      return;
    }
    Alert.alert(title, message, [{ text: 'OK', onPress: () => resolve() }], {
      cancelable: true,
      onDismiss: () => resolve(),
    });
  });
