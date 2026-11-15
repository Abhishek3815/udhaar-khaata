import React, { useState } from 'react';
import { X, Rocket, Trash2, CheckCircle2, RotateCcw, Sparkles, ShieldCheck, Cpu, HardDrive, Cookie } from 'lucide-react';
import { clearAppCacheAndBoostSpeed, CleanResult } from '../utils/systemOptimizer';
import { playMicChime } from '../utils/speech';

interface SpeedBoosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang?: 'hi' | 'en';
}

export const SpeedBoosterModal: React.FC<SpeedBoosterModalProps> = ({
  isOpen,
  onClose,
  lang = 'hi'
}) => {
  const isEn = lang === 'en';
  const [cleaning, setCleaning] = useState(false);
  const [cleanDone, setCleanDone] = useState(false);
  const [stats, setStats] = useState<CleanResult | null>(null);

  if (!isOpen) return null;

  const handleQuickBoost = async (fullWipe: boolean = false) => {
    setCleaning(true);
    playMicChime('start');

    try {
      const res = await clearAppCacheAndBoostSpeed({ fullWipe });
      setStats(res);
      setCleanDone(true);
      playMicChime('success');

      // Auto reload after brief success display
      setTimeout(() => {
        window.location.reload();
      }, 1400);
    } catch (e) {
      console.error(e);
      setCleaning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3.5 sm:p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-700 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-white/20 shadow-xs">
              <Rocket className="w-5 h-5 text-amber-300 animate-bounce" />
            </div>
            <div>
              <h3 className="font-extrabold text-base leading-tight">
                {isEn ? '1-Click Speed Booster' : '1-क्लिक स्पीड बूस्टर (Speed Booster)'}
              </h3>
              <p className="text-[11px] text-teal-100 font-medium">
                {isEn ? 'Clear cache, cookies & fix app lag instantly' : 'कैश व कुकीज़ साफ़ करें और ऐप का हैंग होना बंद करें'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={cleaning}
            className="p-1.5 rounded-full hover:bg-white/20 text-white/80 hover:text-white transition-all disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          {cleanDone ? (
            /* Success State */
            <div className="py-6 text-center space-y-3 animate-in zoom-in-95 duration-300">
              <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950/80 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-md">
                <CheckCircle2 className="w-10 h-10 animate-pulse" />
              </div>
              <h4 className="text-lg font-black text-slate-800 dark:text-white">
                {isEn ? '🚀 App Optimized Successfully!' : '🚀 ऐप पूरी तरह क्लीन व तेज़ हो गया!'}
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 max-w-xs mx-auto">
                {isEn
                  ? 'All accumulated caches and cookies cleared. Reloading with fresh memory...'
                  : 'सभी जमा कैशे और कुकीज़ साफ़ कर दी गई हैं। ताज़ा मेमोरी के साथ रीलोड हो रहा है...'}
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                <RotateCcw className="w-3.5 h-3.5 animate-spin" />
                <span>{isEn ? 'Refreshing in 1 sec...' : '1 सेकंड में रीलोड हो रहा है...'}</span>
              </div>
            </div>
          ) : (
            /* Information & Action State */
            <>
              {/* Diagnostic Cards */}
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                  <HardDrive className="w-4 h-4 mx-auto text-teal-600 dark:text-teal-400 mb-1" />
                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    {isEn ? 'Cache Files' : 'कैश फ़ाइलें'}
                  </div>
                  <div className="text-xs font-black text-slate-800 dark:text-white">
                    {isEn ? 'Cleanable' : 'सफ़ाई योग्य'}
                  </div>
                </div>

                <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                  <Cookie className="w-4 h-4 mx-auto text-amber-500 mb-1" />
                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    {isEn ? 'Cookies' : 'कुकीज़'}
                  </div>
                  <div className="text-xs font-black text-slate-800 dark:text-white">
                    {isEn ? 'Sessions' : 'सक्रिय सत्र'}
                  </div>
                </div>

                <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60">
                  <Cpu className="w-4 h-4 mx-auto text-emerald-600 dark:text-emerald-400 mb-1" />
                  <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                    {isEn ? 'Memory' : 'मेमोरी'}
                  </div>
                  <div className="text-xs font-black text-emerald-600 dark:text-emerald-400">
                    {isEn ? 'Fast Boost' : 'बूस्ट तैयार'}
                  </div>
                </div>
              </div>

              {/* Informative Note */}
              <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-2xl text-[11px] text-amber-900 dark:text-amber-200 flex items-start gap-2">
                <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <span>
                  {isEn
                    ? 'Clearing cache frees RAM, eliminates tab freezing, and updates the app to the latest version immediately.'
                    : 'कैश व कुकीज़ साफ़ करने से मोबाइल/कंप्यूटर की रैम खाली हो जाती है, ऐप का हैंग होना बंद होता है और ऐप तुरंत तेज़ हो जाता है।'}
                </span>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2.5 pt-1">
                {/* 1-Click Fast Boost (Safe, preserves login) */}
                <button
                  type="button"
                  onClick={() => handleQuickBoost(false)}
                  disabled={cleaning}
                  className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-sm shadow-md shadow-emerald-600/30 flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50"
                >
                  <Rocket className={`w-4 h-4 ${cleaning ? 'animate-spin' : ''}`} />
                  <span>
                    {cleaning
                      ? (isEn ? 'Cleaning & Boosting...' : 'कैश साफ़ हो रही है...')
                      : (isEn ? '🚀 1-Click Speed Boost & Refresh' : '🚀 1-क्लिक स्पीड बूस्ट (कैश साफ़ करें व रीफ्रेश)')}
                  </span>
                </button>

                {/* Deep Wipe & Reset */}
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(isEn ? 'Clear all local data and reset app completely?' : 'क्या आप पूरा कैशे और स्थानीय डेटा साफ़ करके ऐप को पूरी तरह रीसेट करना चाहते हैं?')) {
                      handleQuickBoost(true);
                    }
                  }}
                  disabled={cleaning}
                  className="w-full py-2.5 px-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 font-bold text-xs flex items-center justify-center gap-2 active:scale-98 transition-all disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  <span>
                    {isEn ? 'Deep Clean (Wipe All Data & Reset)' : 'गहन सफ़ाई (Deep Clean & Full Reset)'}
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
