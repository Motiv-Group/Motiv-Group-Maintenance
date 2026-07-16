import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.motiv.app',
  appName: 'Motiv',
  webDir: 'out',
  server: {
    // The Android wrapper loads the deployed web app. Must match NEXT_PUBLIC_APP_URL
    // + the Supabase Auth Site/redirect URLs. Rebuild + re-sign the APK after a change.
    url: 'https://maintenance.motivgroup.co.za',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      backgroundColor: '#0e1016',
      androidScaleType: 'CENTER_CROP',
      launchShowDuration: 1500,
      launchAutoHide: true,
      showSpinner: false,
    },
  },
};

export default config;
