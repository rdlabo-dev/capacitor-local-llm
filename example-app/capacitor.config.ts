import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.ionic.starter',
  appName: 'example-app',
  webDir: 'dist',
  experimental: {
    ios: {
      spm: {
        swiftToolsVersion: '6.0',
      },
    },
  },
};

export default config;
