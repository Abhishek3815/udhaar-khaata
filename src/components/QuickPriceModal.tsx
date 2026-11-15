import React, { useState, useEffect } from 'react';
import { X, Check, IndianRupee, TrendingUp, Sparkles, Package } from 'lucide-react';
import { Product } from '../types';
import { useLanguage } from '../context/LanguageContext';

interface QuickPriceModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  onSavePrice: (id: number, purchasePrice: number, sellingPrice: number, wholesalePrice?: number) => Promise<void>;
}

export const QuickPriceModal: React.FC<QuickPriceModalProps> = ({
  isOpen,
  onClose,
  product,
  onSavePrice
}) => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [wholesalePrice, setWholesalePrice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (product) {
      setPurchasePrice(String(product.purchase_price || ''));
      setSellingPrice(String(product.selling_price || ''));
      setWholesalePrice(product.wholesale_price ? String(product.wholesale_price) : '');
    }
    setError(null);
  }, [product, isOpen]);

  if (!isOpen || !product) return null;

  const pPrice = parseFloat(purchasePrice) || 0;
  const sPrice = parseFloat(sellingPrice) || 0;
  const wPrice = parseFloat(wholesalePrice) || 0;
  const profit = sPrice - pPrice;
  const profitPct = pPrice > 0 ? (profit / pPrice) * 100 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellingPrice || sPrice <= 0) {
      setError(isEn ? 'Please enter valid selling price' : 'कृपया मान्य बिक्री रेट दर्ज करें');
      return;
    }
    if (pPrice < 0) {
      setError(isEn ? 'Purchase price must be 0 or higher' : 'खरीद रेट 0 या उससे अधिक होना चाहिए');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await onSavePrice(product.id, pPrice, sPrice, wPrice > 0 ? wPrice : undefined);
      onClose();
    } catch (err: any) {
      setError(err.message || 'रेट अपडेट करने में समस्या आई');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-sm sm:max-w-md bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden my-auto animate-in zoom-in-95 duration-150 border border-slate-100 dark:border-slate-800">
        {/* Pinned Header */}
        <div className="shrink-0 px-5 py-4 bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="p-1.5 bg-white/10 rounded-xl shrink-0">
              <IndianRupee className="w-4 h-4 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-sm leading-tight truncate">
                {isEn ? 'Update Price' : 'रेट बदलें (Price Update)'}
              </h3>
              <p className="text-[11px] text-teal-200 truncate font-medium">
                {product.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/15 text-white/80 hover:text-white transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-3.5">
            {error && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                {error}
              </div>
            )}

            {/* Current Rate Notice */}
            <div className="bg-slate-50 dark:bg-slate-800/60 p-2.5 rounded-2xl border border-slate-200/80 dark:border-slate-700 text-[11px] flex justify-between items-center">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                {isEn ? 'Current Rate:' : 'मौजूदा रेट:'}
              </span>
              <span className="font-bold text-slate-800 dark:text-white">
                ₹{product.selling_price} / {product.unit || 'पैकेट'}
              </span>
            </div>

            {/* Purchase Rate Field */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                {isEn ? 'Cost / Purchase Rate (₹)' : 'खरीद भाव / लागत (₹)'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">₹</span>
                <input
                  type="number"
                  step="any"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Retail Selling Rate Field */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                {isEn ? 'Retail Selling Rate (₹) *' : 'खुदरा बिक्री रेट (₹) *'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-600 dark:text-emerald-400">₹</span>
                <input
                  type="number"
                  step="any"
                  required
                  value={sellingPrice}
                  onChange={(e) => setSellingPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 bg-emerald-50/50 dark:bg-emerald-950/30 border-2 border-emerald-500 rounded-xl text-sm font-extrabold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  autoFocus
                />
              </div>
            </div>

            {/* Wholesale Selling Rate Field */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                {isEn ? 'Wholesale Rate (Optional - ₹)' : 'थोक बिक्री रेट (वैकल्पिक - ₹)'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-amber-600 dark:text-amber-400">₹</span>
                <input
                  type="number"
                  step="any"
                  value={wholesalePrice}
                  onChange={(e) => setWholesalePrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            {/* Profit Margin Preview Card */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
              <span className="text-slate-500 dark:text-slate-400 font-medium">
                {isEn ? 'Profit / Margin:' : 'मुनाफा (मार्जिन):'}
              </span>
              <div className="font-black text-slate-900 dark:text-white flex items-center gap-1">
                <span className={profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600'}>
                  ₹{profit.toFixed(1)}
                </span>
                {profitPct > 0 && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold ml-1">
                    ({profitPct.toFixed(1)}%)
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Pinned Action Buttons Footer */}
          <div className="shrink-0 p-3.5 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              {isEn ? 'Cancel' : 'रद्द करें'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs shadow-md shadow-emerald-600/25 active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
              {submitting ? (
                <span>{isEn ? 'Saving...' : 'सेव हो रहा है...'}</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>{isEn ? 'Save Rate' : 'नया रेट सेव करें'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
