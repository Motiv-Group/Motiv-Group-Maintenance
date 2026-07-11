import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.motiv.app',
  appName: 'Motiv',
  webDir: 'out',
  server: {
    url: 'https://motivgroup.co.za',
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
