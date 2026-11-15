import React from 'react';
import {
  BookOpen,
  Package,
  Store,
  Settings,
  Sun,
  Moon,
  LogOut,
  Wifi,
  WifiOff,
  Volume2,
  VolumeX,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Wheat,
  Share2,
  PlusCircle,
  HelpCircle,
  Mic,
  Rocket
} from 'lucide-react';
import { ShopSettings, DbStatus, Customer } from '../types';
import { formatCurrency } from '../utils/speech';

interface DesktopSidebarProps {
  activeTab: 'ledger' | 'products';
  onChangeTab: (tab: 'ledger' | 'products') => void;
  settings: ShopSettings;
  soundboxEnabled: boolean;
  onToggleSoundbox: () => void;
  onOpenSettings: () => void;
  onLogout?: () => void;
  lang: 'hi' | 'en';
  onToggleLang: (target?: 'hi' | 'en') => void;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  isOnline: boolean;
  pendingSyncCount: number;
  onOpenHotspotSync: () => void;
  onOpenMandiModal: () => void;
  onOpenVoice?: () => void;
  onOpenSpeedBooster?: () => void;
  customers: Customer[];
  productsCount: number;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  activeTab,
  onChangeTab,
  settings,
  soundboxEnabled,
  onToggleSoundbox,
  onOpenSettings,
  onLogout,
  lang,
  onToggleLang,
  theme,
  onToggleTheme,
  isOnline,
  pendingSyncCount,
  onOpenHotspotSync,
  onOpenMandiModal,
  onOpenVoice,
  onOpenSpeedBooster,
  customers,
  productsCount
}) => {
  const isEn = lang === 'en';
  const isDark = theme === 'dark';

  const totalUdhaar = customers.reduce(
    (sum, c) => sum + (c.net_balance && c.net_balance > 0 ? c.net_balance : 0),
    0
  );
  const pendingCustomers = customers.filter(c => (c.net_balance || 0) > 0).length;

  return (
    <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 h-screen sticky top-0 z-30 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-100 dark:border-slate-800/80">
        <div className="flex items-center gap-3">
          {settings.logo ? (
            <img
              src={settings.logo}
              alt="Shop Logo"
              className="w-12 h-12 rounded-2xl object-cover ring-2 ring-emerald-500/20 shadow-xs shrink-0"
            />
          ) : (
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 text-white flex items-center justify-center font-black text-xl shadow-md shadow-emerald-600/20 shrink-0">
              {settings.shop_name ? settings.shop_name.slice(0, 1) : <Store className="w-6 h-6" />}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <h2 className="font-extrabold text-slate-900 dark:text-white text-base truncate tracking-tight">
                {settings.shop_name || 'दुकान खाता'}
              </h2>
              <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5 font-medium">
              {settings.owner_name ? `${settings.owner_name}` : (isEn ? 'Merchant' : 'दुकानदार')}
              {settings.phone ? ` • ${settings.phone}` : ''}
            </p>
          </div>
        </div>

        {/* Sync & Network Status Pill */}
        <button
          onClick={onOpenHotspotSync}
          className={`w-full mt-3 flex items-center justify-between px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
            !isOnline || pendingSyncCount > 0
              ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30'
              : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-100/60'
          }`}
        >
          <div className="flex items-center gap-2">
            {isOnline ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            )}
            <span className="text-[11px]">
              {!isOnline
                ? (isEn ? 'Offline Mode (Local DB)' : 'ऑफलाइन मोड (सुरक्षित)')
                : pendingSyncCount > 0
                ? `${pendingSyncCount} ${isEn ? 'records pending sync' : 'सिंक बाकी'}`
                : (isEn ? 'Cloud Synced' : 'क्लाउड सिंक तैयार')}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            {isOnline ? 'LIVE' : 'OFFLINE'}
          </span>
        </button>
      </div>

      {/* Navigation Links */}
      <div className="p-4 space-y-1.5 flex-1 overflow-y-auto">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-3 mb-2">
          {isEn ? 'Main Menu' : 'मुख्य मेनू'}
        </div>

        {/* 🎙️ Voice Assistant Primary Action */}
        {onOpenVoice && (
          <button
            onClick={onOpenVoice}
            className="w-full mb-2 flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-black bg-gradient-to-r from-rose-600 via-rose-500 to-amber-500 text-white shadow-md shadow-rose-600/25 hover:from-rose-500 hover:to-amber-400 active:scale-98 transition-all"
          >
            <div className="flex items-center gap-3">
              <Mic className="w-4 h-4 text-white stroke-[2.5]" />
              <span>{isEn ? 'Voice Assistant' : 'बोलकर लिखें (Voice)'}</span>
            </div>
            <span className="text-[10px] bg-white/25 px-1.5 py-0.5 rounded-md font-extrabold uppercase">
              AI
            </span>
          </button>
        )}

        {/* Khata / Ledger Tab */}
        <button
          onClick={() => onChangeTab('ledger')}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'ledger'
              ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30 font-extrabold'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <BookOpen className="w-4 h-4" />
            <span>{isEn ? 'Khata & Ledger' : 'दुकान खाता (उधार-जमा)'}</span>
          </div>
          {pendingCustomers > 0 && (
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                activeTab === 'ledger'
                  ? 'bg-white/20 text-white'
                  : 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300'
              }`}
            >
              {pendingCustomers}
            </span>
          )}
        </button>

        {/* Rate List / Inventory Tab */}
        <button
          onClick={() => onChangeTab('products')}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
            activeTab === 'products'
              ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-600/30 font-extrabold'
              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <div className="flex items-center gap-3">
            <Package className="w-4 h-4" />
            <span>{isEn ? 'Rate List & Stock' : 'सामान व रेट लिस्ट'}</span>
          </div>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
              activeTab === 'products'
                ? 'bg-white/20 text-white'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
            }`}
          >
            {productsCount}
          </span>
        </button>

        {/* Mandi Wholesale Rates Alert */}
        <button
          onClick={onOpenMandiModal}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-amber-50 dark:hover:bg-amber-950/30 hover:text-amber-800 dark:hover:text-amber-300 transition-all"
        >
          <div className="flex items-center gap-3">
            <Wheat className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span>{isEn ? 'Mandi Price Alert' : 'मंडी भाव व स्टाफ अलर्ट'}</span>
          </div>
          <span className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 px-1.5 py-0.5 rounded-md font-extrabold">
            NEW
          </span>
        </button>

        {/* Hotspot & Offline Sync Direct Link */}
        <button
          onClick={onOpenHotspotSync}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
        >
          <div className="flex items-center gap-3">
            <Wifi className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <span>{isEn ? 'Hotspot & Backup' : 'हॉटस्पॉट सिंक व बैकअप'}</span>
          </div>
        </button>

        {/* Shop Settings */}
        <button
          onClick={onOpenSettings}
          className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
        >
          <div className="flex items-center gap-3">
            <Settings className="w-4 h-4 text-slate-500" />
            <span>{isEn ? 'Shop Settings' : 'दुकान सेटिंग्स'}</span>
          </div>
        </button>

        {/* Sidebar Mini Ledger Balance Snapshot */}
        <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-3 mb-2">
            {isEn ? 'Balance Overview' : 'मार्केट स्थिति'}
          </div>
          <div className="p-3 bg-gradient-to-br from-rose-50 to-red-50/50 dark:from-rose-950/20 dark:to-red-950/10 rounded-2xl border border-rose-200/60 dark:border-rose-900/40 mb-2">
            <div className="flex items-center justify-between text-xs text-rose-700 dark:text-rose-400 font-bold mb-1">
              <span>{isEn ? 'Market Udhaar' : 'बाजार बाकी (उधार)'}</span>
              <TrendingDown className="w-3.5 h-3.5" />
            </div>
            <div className="text-lg font-black text-rose-700 dark:text-rose-400">
              {formatCurrency(totalUdhaar)}
            </div>
            <p className="text-[10px] text-rose-600/80 dark:text-rose-400/80 mt-0.5">
              {pendingCustomers} {isEn ? 'customers to collect from' : 'ग्राहकों से लेना है'}
            </p>
          </div>
        </div>
      </div>

      {/* Sidebar Footer Controls */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/60 space-y-2.5">
        {/* Soundbox Control Card */}
        <div className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <div
              className={`p-1.5 rounded-lg ${
                soundboxEnabled
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-700 text-slate-400'
              }`}
            >
              {soundboxEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </div>
            <div>
              <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <span>{isEn ? 'Soundbox' : 'साउंडबॉक्स'}</span>
                {soundboxEnabled && (
                  <span className="flex items-center gap-0.5">
                    <span className="w-1 bg-emerald-500 rounded-full animate-soundwave-1 inline-block"></span>
                    <span className="w-1 bg-emerald-500 rounded-full animate-soundwave-2 inline-block"></span>
                    <span className="w-1 bg-emerald-500 rounded-full animate-soundwave-3 inline-block"></span>
                  </span>
                )}
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                {soundboxEnabled ? (isEn ? 'Voice active' : 'आवाज चालू') : (isEn ? 'Muted' : 'बंद')}
              </span>
            </div>
          </div>

          <button
            onClick={onToggleSoundbox}
            className={`w-9 h-5 rounded-full p-0.5 transition-colors duration-200 ease-in-out ${
              soundboxEnabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-600'
            }`}
          >
            <div
              className={`w-4 h-4 rounded-full bg-white shadow-xs transform transition-transform duration-200 ease-in-out ${
                soundboxEnabled ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Language & Theme & Logout Strip */}
        <div className="flex items-center justify-between pt-1">
          {/* Dual Language Switcher */}
          <div className="flex items-center bg-slate-200/80 dark:bg-slate-800 rounded-lg p-0.5 text-[11px] font-bold">
            <button
              onClick={() => onToggleLang('hi')}
              className={`px-2 py-0.5 rounded-md transition-all ${
                lang === 'hi'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-extrabold'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              हिन्दी
            </button>
            <button
              onClick={() => onToggleLang('en')}
              className={`px-2 py-0.5 rounded-md transition-all ${
                lang === 'en'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs font-extrabold'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400'
              }`}
            >
              EN
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Speed Booster / Clear Cache */}
            {onOpenSpeedBooster && (
              <button
                onClick={onOpenSpeedBooster}
                className="p-1.5 rounded-lg bg-amber-400/20 hover:bg-amber-400 text-amber-500 dark:text-amber-300 hover:text-slate-950 border border-amber-300/40 active:scale-95 transition-all shadow-2xs"
                title={isEn ? '🚀 1-Click Speed Booster (Clear Cache & Cookies)' : '🚀 1-क्लिक स्पीड बूस्टर (कैश व कुकीज़ साफ़ करें)'}
              >
                <Rocket className="w-3.5 h-3.5" />
              </button>
            )}

            {/* Theme Toggle Pill */}
            <button
              onClick={onToggleTheme}
              className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-all active:scale-95 shadow-inner"
              title={isDark ? (isEn ? 'Dark mode active (Click for Light)' : 'डार्क मोड सक्रिय (लाइट के लिए क्लिक करें)') : (isEn ? 'Light mode active (Click for Dark)' : 'लाइट मोड सक्रिय (डार्क के लिए क्लिक करें)')}
            >
              <span className={`p-1 rounded-md flex items-center justify-center transition-all ${
                !isDark
                  ? 'bg-amber-400 text-slate-900 shadow-2xs font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}>
                <Sun className="w-3.5 h-3.5" />
              </span>
              <span className={`p-1 rounded-md flex items-center justify-center transition-all ${
                isDark
                  ? 'bg-teal-600 text-white shadow-2xs font-bold'
                  : 'text-slate-400 hover:text-slate-600'
              }`}>
                <Moon className="w-3.5 h-3.5" />
              </span>
            </button>

            {/* Logout Button */}
            {onLogout && (
              <button
                onClick={onLogout}
                className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 active:scale-95 transition-all shadow-2xs"
                title={isEn ? 'Logout / Lock Account' : 'खाता लॉक करें'}
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
};
