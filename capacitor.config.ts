import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.motiv.app',
  appName: 'Motiv',
  webDir: 'out',
  server: {
    url: 'https://maintenance-app-mv3k.vercel.app',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
