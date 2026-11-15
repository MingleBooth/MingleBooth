import { CapacitorConfig } from '@capacitor/cli';

const isTestBuild = process.env.MINGLEBOOTH_BUILD_TYPE === 'test';

const config: CapacitorConfig = {
  appId: isTestBuild ? 'com.minglebooth.mobile.test' : 'com.minglebooth.mobile',
  appName: isTestBuild ? 'MingleBooth (Test Isolated)' : 'MingleBooth Mobile',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#06080D',
      showSpinner: true,
      spinnerColor: '#0ea5e9',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#06080D',
    },
    ScreenOrientation: {
      // Default unlocked for dynamic tablet/phone rotation
    },
  },
};

export default config;
