import React from 'react';
import {
  Volume2,
  VolumeX,
  Store,
  Settings,
  Sun,
  Moon,
  LogOut,
  Wifi,
  WifiOff,
  Mic,
  Plus,
  Zap,
  ShieldCheck,
  Bell,
  Rocket
} from 'lucide-react';
import { DbStatus, ShopSettings } from '../types';

interface HeaderProps {
  settings: ShopSettings;
  dbStatus?: DbStatus | null;
  soundboxEnabled: boolean;
  onToggleSoundbox: () => void;
  onOpenVoice?: () => void;
  onOpenSettings?: () => void;
  onLogout?: () => void;
  lang: 'hi' | 'en';
  onToggleLang: (target?: 'hi' | 'en') => void;
  theme?: 'light' | 'dark';
  onToggleTheme?: () => void;
  isOnline?: boolean;
  pendingSyncCount?: number;
  onOpenHotspotSync?: () => void;
  onOpenAddCustomer?: () => void;
  onOpenQuickBill?: () => void;
  onOpenSpeedBooster?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  soundboxEnabled,
  onToggleSoundbox,
  onOpenVoice,
  onOpenSettings,
  onLogout,
  lang,
  onToggleLang,
  theme = 'light',
  onToggleTheme,
  isOnline = true,
  pendingSyncCount = 0,
  onOpenHotspotSync,
  onOpenAddCustomer,
  onOpenQuickBill,
  onOpenSpeedBooster
}) => {
  const isEn = lang === 'en';
  const isDark = theme === 'dark';

  return (
    <header className="bg-gradient-to-r from-emerald-800 via-teal-800 to-slate-900 text-white shadow-md sticky top-0 z-30 no-print border-b border-emerald-700/30">
      {/* --- DESKTOP TOP BAR (lg:flex) --- */}
      <div className="hidden lg:flex items-center justify-between px-6 py-3.5 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-extrabold text-white tracking-tight">
              {settings.shop_name || 'दुकान खाता'}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
              {isEn ? 'Digital Khata' : 'डिजिटल बहीखाता'}
            </span>
          </div>
          <span className="text-slate-400 text-xs">•</span>
          <span className="text-xs text-slate-300 font-medium">
            {new Date().toLocaleDateString(isEn ? 'en-IN' : 'hi-IN', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            })}
          </span>
        </div>

        {/* Desktop Quick Actions */}
        <div className="flex items-center gap-2.5">
          {onOpenVoice && (
            <button
              onClick={onOpenVoice}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white text-xs font-black shadow-md shadow-rose-600/30 active:scale-95 transition-all border border-rose-400/40"
              title={isEn ? 'Voice Assistant (Bolkar entry)' : 'बोलकर एंट्री करें'}
            >
              <Mic className="w-4 h-4 text-white stroke-[2.5]" />
              <span>{isEn ? 'Voice Assistant' : 'बोलकर लिखें (Voice)'}</span>
            </button>
          )}

          {onOpenQuickBill && (
            <button
              onClick={onOpenQuickBill}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm active:scale-95 transition-all"
            >
              <Zap className="w-3.5 h-3.5 text-amber-300" />
              <span>{isEn ? 'Quick Bill' : 'तुरंत पर्ची'}</span>
            </button>
          )}

          {onOpenAddCustomer && (
            <button
              onClick={onOpenAddCustomer}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/20 text-xs font-bold active:scale-95 transition-all"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{isEn ? 'Add Customer' : 'नया ग्राहक'}</span>
            </button>
          )}

          <div className="h-4 w-px bg-white/20 mx-1" />

          {/* Soundbox toggle button */}
          <button
            onClick={onToggleSoundbox}
            className={`p-2 rounded-xl transition-all ${
              soundboxEnabled
                ? 'bg-emerald-500 text-white shadow-xs ring-2 ring-emerald-300/40'
                : 'bg-white/10 text-teal-200 hover:bg-white/20'
            }`}
            title={soundboxEnabled ? (isEn ? 'Soundbox ON' : 'साउंडबॉक्स चालू') : (isEn ? 'Soundbox OFF' : 'साउंडबॉक्स बंद')}
          >
            {soundboxEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* 1-Click Speed Booster / Clear Cache */}
          {onOpenSpeedBooster && (
            <button
              onClick={onOpenSpeedBooster}
              className="p-2 rounded-xl bg-amber-400/20 hover:bg-amber-400 text-amber-300 hover:text-slate-950 border border-amber-300/40 transition-all active:scale-95 shadow-xs"
              title={isEn ? '🚀 1-Click Speed Booster (Clear Cache & Cookies)' : '🚀 1-क्लिक स्पीड बूस्टर (कैश व कुकीज़ साफ़ करें)'}
            >
              <Rocket className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* --- MOBILE VIEW (< lg) --- */}
      <div className="lg:hidden">
        {/* Top Mini Android System Bar */}
        <div className="flex items-center justify-between px-3.5 pt-2 pb-1 text-xs text-teal-100/90 font-mono border-b border-white/10">
          <div className="flex items-center space-x-2">
            <Store className="w-3.5 h-3.5 text-emerald-300" />
            <span className="font-semibold tracking-wide text-[11px]">
              {isEn ? 'Dukaan Munim' : 'दुकान मुनीम'}
            </span>

            {/* Offline / Online & Hotspot Sync Badge */}
            {onOpenHotspotSync && (
              <button
                type="button"
                onClick={onOpenHotspotSync}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold transition-all shadow-xs ${
                  !isOnline || pendingSyncCount > 0
                    ? 'bg-amber-400 text-slate-950 font-black animate-pulse'
                    : 'bg-emerald-900/80 text-emerald-200 hover:text-white border border-emerald-400/30'
                }`}
                title={isEn ? 'Click to see Offline & Hotspot sync options' : 'ऑफलाइन & हॉटस्पॉट सिंक जानकारी'}
              >
                {isOnline ? (
                  <Wifi className="w-3 h-3 text-emerald-400" />
                ) : (
                  <WifiOff className="w-3 h-3 text-amber-950" />
                )}
                <span>
                  {!isOnline
                    ? (isEn ? 'Offline' : 'ऑफलाइन')
                    : pendingSyncCount > 0
                    ? `${pendingSyncCount} ${isEn ? 'Pending' : 'बाकी'}`
                    : (isEn ? 'Sync' : 'सिंक')}
                </span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-1.5">
            {/* Dual Language Switcher */}
            <div className="flex items-center rounded-lg bg-black/20 p-0.5 border border-white/15 text-[10px] font-bold">
              <button
                type="button"
                onClick={() => onToggleLang('hi')}
                className={`px-1.5 py-0.5 rounded transition-all ${
                  lang === 'hi'
                    ? 'bg-amber-400 text-slate-900 font-extrabold shadow-xs'
                    : 'text-teal-200 hover:text-white'
                }`}
              >
                हिन्दी
              </button>
              <button
                type="button"
                onClick={() => onToggleLang('en')}
                className={`px-1.5 py-0.5 rounded transition-all ${
                  lang === 'en'
                    ? 'bg-amber-400 text-slate-900 font-extrabold shadow-xs'
                    : 'text-teal-200 hover:text-white'
                }`}
              >
                EN
              </button>
            </div>

            {/* Dark / Light Theme Toggle Pill */}
            {onToggleTheme && (
              <button
                type="button"
                onClick={onToggleTheme}
                className="flex items-center p-0.5 rounded-lg bg-black/25 hover:bg-black/35 border border-white/20 transition-all active:scale-95 shadow-inner"
                title={theme === 'dark' ? (isEn ? 'Dark mode active (Click for Light)' : 'डार्क मोड सक्रिय (लाइट के लिए क्लिक करें)') : (isEn ? 'Light mode active (Click for Dark)' : 'लाइट मोड सक्रिय (डार्क के लिए क्लिक करें)')}
              >
                <span className={`p-1 rounded-md flex items-center justify-center transition-all ${
                  theme === 'light'
                    ? 'bg-amber-400 text-slate-900 shadow-xs font-bold'
                    : 'text-white/60 hover:text-white'
                }`}>
                  <Sun className="w-3 h-3" />
                </span>
                <span className={`p-1 rounded-md flex items-center justify-center transition-all ${
                  theme === 'dark'
                    ? 'bg-teal-500 text-white shadow-xs font-bold'
                    : 'text-white/60 hover:text-white'
                }`}>
                  <Moon className="w-3 h-3" />
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Main Shop Identity Bar */}
        <div className="px-3.5 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            {settings.logo ? (
              <img
                src={settings.logo}
                alt="Shop Logo"
                className="w-9 h-9 rounded-xl object-cover border border-white/30 shadow-xs shrink-0"
              />
            ) : (
              <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 text-white flex items-center justify-center font-black text-sm shrink-0">
                {settings.shop_name ? settings.shop_name.slice(0, 1) : <Store className="w-4 h-4 text-emerald-200" />}
              </div>
            )}

            <div className="min-w-0">
              <h1 className="text-sm font-extrabold tracking-tight text-white flex items-center gap-1 leading-tight truncate">
                <span>{settings.shop_name || 'दुकान खाता'}</span>
              </h1>
              <p className="text-[11px] text-teal-100/80 flex items-center gap-1 mt-0.5 truncate font-medium">
                <span>{settings.owner_name || (isEn ? 'Shopkeeper' : 'दुकानदार')}</span>
                {settings.phone && (
                  <>
                    <span>•</span>
                    <span>{settings.phone}</span>
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            {/* Soundbox toggle */}
            <button
              onClick={onToggleSoundbox}
              className={`p-2 rounded-xl transition-all ${
                soundboxEnabled
                  ? 'bg-emerald-500 text-white shadow-xs ring-2 ring-emerald-300/40'
                  : 'bg-white/10 text-teal-200 hover:bg-white/20'
              }`}
              title={soundboxEnabled ? (isEn ? 'Soundbox ON' : 'साउंडबॉक्स चालू') : (isEn ? 'Soundbox OFF' : 'साउंडबॉक्स बंद')}
            >
              {soundboxEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            {/* Speed Booster */}
            {onOpenSpeedBooster && (
              <button
                onClick={onOpenSpeedBooster}
                className="p-2 rounded-xl bg-amber-400/20 hover:bg-amber-400 text-amber-300 hover:text-slate-950 border border-amber-300/40 transition-all active:scale-95 shadow-xs"
                title={isEn ? 'Speed Booster' : 'कैश साफ़ करें'}
              >
                <Rocket className="w-4 h-4" />
              </button>
            )}

            {/* Settings button */}
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-teal-200 transition-all active:scale-95"
                title={isEn ? 'Shop Settings' : 'दुकान सेटिंग्स'}
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            {/* Logout / Lock Button */}
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-2 rounded-xl bg-white/10 hover:bg-rose-900/80 text-rose-300 hover:text-white transition-all active:scale-95"
                title={isEn ? 'Lock / Logout' : 'खाता लॉक करें'}
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
