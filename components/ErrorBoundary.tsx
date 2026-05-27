import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

interface Props {
  children: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

// Root error boundary. Uses inline styles deliberately so the fallback works
// even if NativeWind / theme providers themselves are the failing layer.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info);
    console.error('App error caught by ErrorBoundary:', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          padding: 24,
          backgroundColor: '#0f172a',
        }}
      >
        <Text style={{ color: '#ffffff', fontSize: 22, fontWeight: '700', marginBottom: 12 }}>
          Something went wrong
        </Text>
        <Text
          style={{
            color: '#cbd5e1',
            fontSize: 14,
            textAlign: 'center',
            marginBottom: 24,
            maxWidth: 320,
          }}
        >
          {this.state.error.message || 'An unexpected error occurred.'}
        </Text>
        <Pressable
          onPress={this.reset}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          style={({ pressed }) => ({
            backgroundColor: pressed ? '#4f46e5' : '#6366f1',
            paddingVertical: 12,
            paddingHorizontal: 28,
            borderRadius: 10,
          })}
        >
          <Text style={{ color: '#ffffff', fontWeight: '600', fontSize: 16 }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}
