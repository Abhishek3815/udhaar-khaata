import React from 'react';
import { BookOpen, Package, Mic } from 'lucide-react';

interface BottomNavProps {
  activeTab: 'ledger' | 'products';
  onChangeTab: (tab: 'ledger' | 'products') => void;
  onOpenVoice: () => void;
  lang?: 'hi' | 'en';
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onChangeTab,
  onOpenVoice,
  lang = 'hi'
}) => {
  const isEn = lang === 'en';

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/90 dark:border-slate-800 z-30 shadow-[0_-4px_24px_rgba(0,0,0,0.08)] no-print">
      <div className="max-w-md mx-auto px-6 flex items-center justify-between h-16 relative">
        {/* Tab 1: खाता (Ledger) */}
        <button
          onClick={() => onChangeTab('ledger')}
          className={`flex-1 flex flex-col items-center justify-center py-1 transition-all tap-effect ${
            activeTab === 'ledger'
              ? 'text-emerald-700 dark:text-emerald-400 font-extrabold'
              : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 font-medium'
          }`}
        >
          <div
            className={`p-1.5 rounded-2xl transition-all ${
              activeTab === 'ledger'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 shadow-xs ring-1 ring-emerald-500/20'
                : ''
            }`}
          >
            <BookOpen className="w-5 h-5" />
          </div>
          <span className="text-[11px] mt-0.5 tracking-tight">
            {isEn ? 'Khata' : 'खाता (उधार-जमा)'}
          </span>
        </button>

        {/* Center Floating Voice Action Button */}
        <div className="relative -top-5 flex flex-col items-center px-4">
          <button
            onClick={() => {
              if (typeof navigator !== 'undefined' && navigator.vibrate) {
                navigator.vibrate(40);
              }
              onOpenVoice();
            }}
            className="w-14 h-14 rounded-full bg-gradient-to-tr from-rose-600 via-rose-500 to-amber-500 text-white flex items-center justify-center shadow-xl shadow-rose-600/40 border-4 border-white dark:border-slate-800 active:scale-90 transition-all hover:brightness-110"
            title={isEn ? 'Voice & Text Entry' : 'बोलकर / लिखकर एंट्री करें'}
          >
            <Mic className="w-7 h-7 text-white stroke-[2.5]" />
          </button>
          <span className="text-[11px] font-black text-rose-600 dark:text-rose-400 mt-1 uppercase tracking-tight">
            {isEn ? 'Voice Assistant' : 'बोलकर लिखें'}
          </span>
        </div>

        {/* Tab 2: सामान व रेट लिस्ट (Price List) */}
        <button
          onClick={() => onChangeTab('products')}
          className={`flex-1 flex flex-col items-center justify-center py-1 transition-all tap-effect ${
            activeTab === 'products'
              ? 'text-emerald-700 dark:text-emerald-400 font-extrabold'
              : 'text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 font-medium'
          }`}
        >
          <div
            className={`p-1.5 rounded-2xl transition-all ${
              activeTab === 'products'
                ? 'bg-emerald-50 dark:bg-emerald-950/60 shadow-xs ring-1 ring-emerald-500/20'
                : ''
            }`}
          >
            <Package className="w-5 h-5" />
          </div>
          <span className="text-[11px] mt-0.5 tracking-tight">
            {isEn ? 'Rate List' : 'रेट लिस्ट (भाव)'}
          </span>
        </button>
      </div>
    </nav>
  );
};
