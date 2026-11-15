import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dukaan.khaata',
  appName: 'दुकान खाता',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    // Live Server ya Local IP par run karne ke liye neeche wali line uncomment karein:
    // url: 'http://192.168.1.5:3000',
    cleartext: true
  }
};

export default config;
