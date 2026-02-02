---
name: PostHog Analytics Improvements
overview: Enhance PostHog configuration with lifecycle events, fix screen tracking, add global properties, user opt-out, session tracking, and error reporting.
todos:
  - id: provider-options
    content: Add captureNativeAppLifecycleEvents and dev controls to PostHogProvider in _layout.tsx
    status: completed
  - id: fix-screen-tracking
    content: Fix screen tracking race condition in all screen files (remove stale properties)
    status: completed
  - id: global-properties
    content: Add register() call in identifyUser with device_brand and device_model
    status: completed
  - id: opt-out-schema
    content: Add analyticsOptOut to settings schema and create migration
    status: completed
  - id: opt-out-queries
    content: Add getter/setter functions for analyticsOptOut in settings queries
    status: completed
  - id: opt-out-lib
    content: Update settings.js to include analyticsOptOut
    status: completed
  - id: opt-out-ui
    content: Add analytics toggle to settings.tsx with translations
    status: completed
  - id: opt-out-startup
    content: Check and apply opt-out status on app startup in _layout.tsx
    status: completed
  - id: session-tracking
    content: Track session completion events in study.tsx and mistakes.tsx
    status: completed
  - id: error-tracking
    content: Add trackError function and replace console.error calls
    status: completed
isProject: false
---

# PostHog Analytics Improvements

## 1. Add Lifecycle Events and Provider Options

Update [app/_layout.tsx](app/_layout.tsx) to enable native app lifecycle events and add development controls:

```typescript
<PostHogProvider 
  apiKey={posthogKey} 
  options={{ 
    host: posthogHost,
    enable: !__DEV__,  // Disable in development
    captureNativeAppLifecycleEvents: true,  // Auto-track app open/close/background
    debug: __DEV__,
  }}
>
```

## 2. Fix Screen Tracking Race Condition

The current pattern tracks screen views with stale state. Fix by separating screen tracking from data loading.

**Current problematic pattern** in [app/home.tsx](app/home.tsx):

```77:78:app/home.tsx
      trackScreenView(posthog, 'Home', { ... stale values ... });
      loadData();  // Data loads AFTER tracking
```

**Fix**: Track screen name immediately, track properties after data loads or use a separate effect:

```typescript
useFocusEffect(
  useCallback(() => {
    trackScreenView(posthog, 'Home');  // Track just the screen name
    loadData();
  }, [loadData, posthog])
);
```

Apply similar fixes to: `home.tsx`, `study.tsx`, `settings.tsx`, `mistakes.tsx`, `mock.tsx`, `stats.tsx`

## 3. Add Global Properties via register()

Update [src/lib/analytics.ts](src/lib/analytics.ts) to register global properties after user identification:

```typescript
import * as Device from 'expo-device';

export async function identifyUser(posthog: ReturnType<typeof usePostHog>) {
  const deviceId = await getDeviceId();
  
  posthog.identify(deviceId);
  
  // Register properties attached to ALL future events
  posthog.register({
    device_brand: Device.brand,
    device_model: Device.modelName,
  });
}
```

**Note**: PostHog already captures `$app_version`, `$app_build`, `$os_name`, `$os_version`, `$device_type` automatically - no need to duplicate.

## 4. Add Analytics Opt-Out Setting

### 4a. Database Schema Migration

Add column to [src/db/schema/settings.ts](src/db/schema/settings.ts):

```typescript
analyticsOptOut: integer('analytics_opt_out', { mode: 'boolean' }).notNull().default(false),
```

Create new migration file (run `npx drizzle-kit generate` after schema change).

### 4b. Settings Queries

Update [src/db/queries/settings.ts](src/db/queries/settings.ts):

- Add `analyticsOptOut` to `SettingsData` interface
- Add getter/setter functions: `getAnalyticsOptOut()`, `setAnalyticsOptOut()`

### 4c. Settings Lib

Update [src/lib/settings.js](src/lib/settings.js) to include `analyticsOptOut` in settings object.

### 4d. UI Toggle

Add toggle to [app/settings.tsx](app/settings.tsx) (pattern matches existing conservative mode toggle):

```typescript
const handleAnalyticsToggle = async (optOut: boolean) => {
  await updateSettings({ analyticsOptOut: optOut });
  if (optOut) {
    posthog?.optOut();
  } else {
    posthog?.optIn();
  }
};
```

### 4e. Translations

Add to [src/i18n/strings.js](src/i18n/strings.js):

- `settings.analyticsTitle` - "Analytics" / "Analytika" / "Analitika"
- `settings.analyticsOptOut` - "Disable analytics" / etc.
- `settings.analyticsOptOutDesc` - description text

### 4f. Apply Opt-Out on App Start

In [app/_layout.tsx](app/_layout.tsx), check opt-out status after PostHog initializes and call `posthog.optOut()` if user opted out.

## 5. Track Session Completion Events

Update [app/study.tsx](app/study.tsx) and [app/mistakes.tsx](app/mistakes.tsx) to track session metrics when session ends:

```typescript
// In cleanup function when leaving screen
return () => {
  if (sessionIdRef.current) {
    const session = await StudySessionDB.getStudySession(sessionIdRef.current);
    
    trackEvent(posthog, 'study_session_ended', {
      session_id: sessionIdRef.current,
      mode: 'study',
      duration_seconds: Math.round((Date.now() - sessionStartTime) / 1000),
      questions_answered: questionsAnswered,
      correct_count: correctCount,
      category: selectedCategory,
      language: lang,
    });
    
    StudySessionDB.endStudySession(sessionIdRef.current, questionsAnswered, correctCount);
  }
};
```

Need to track `questionsAnswered` and `correctCount` in component state.

## 6. Track Errors to PostHog

Add `trackError` function to [src/lib/analytics.ts](src/lib/analytics.ts):

```typescript
export function trackError(
  posthog: ReturnType<typeof usePostHog> | null,
  errorType: string,
  error: Error | unknown,
  context?: Record<string, any>
) {
  if (!posthog) return;
  
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  posthog.capture('app_error', {
    error_type: errorType,
    error_message: errorMessage,
    ...context,
  });
}
```

Replace `console.error` calls with `trackError` in:

- [app/_layout.tsx](app/_layout.tsx) - database init errors, identify errors
- Other critical error paths as needed

## Files to Modify

| File | Changes |

|------|---------|

| `app/_layout.tsx` | Provider options, opt-out check on start |

| `src/lib/analytics.ts` | `register()`, `trackError()`, remove redundant properties |

| `src/db/schema/settings.ts` | Add `analyticsOptOut` column |

| `src/db/queries/settings.ts` | Add opt-out getter/setter |

| `src/lib/settings.js` | Include `analyticsOptOut` in settings |

| `app/settings.tsx` | Add analytics toggle UI |

| `src/i18n/strings.js` | Add translation strings |

| `app/home.tsx` | Fix screen tracking |

| `app/study.tsx` | Fix screen tracking, track session end |

| `app/mistakes.tsx` | Fix screen tracking, track session end |

| `app/mock.tsx` | Fix screen tracking |

| `app/stats.tsx` | Fix screen tracking |

| `app/onboarding.tsx` | Fix screen tracking |

| `app/language.tsx` | Fix screen tracking |