import type { CapacitorConfig } from '@capacitor/cli';

const isLiveReload = process.env.CAPACITOR_LIVE_RELOAD === '1';

const config: CapacitorConfig = {
  appId: 'com.morhogeg.drift',
  appName: 'Sidedrift',
  webDir: 'dist',
  ...(isLiveReload ? {
    server: {
      url: 'http://localhost:5173',
      cleartext: true,
    },
  } : {}),
  plugins: {
    StatusBar: {
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: '#0a0a0a',
    },
    Keyboard: {
      resize: 'none',
      resizeOnFullScreen: false,
    },
  },
};

export default config;
