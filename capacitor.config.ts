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
};

export default config;
