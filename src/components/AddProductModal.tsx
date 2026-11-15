import React, { useState, useEffect } from 'react';
import { X, Package, Check, TrendingUp, AlertCircle, AlertTriangle } from 'lucide-react';
import { Product } from '../types';
import { useLanguage } from '../context/LanguageContext';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  productToEdit?: Product | null;
  existingProducts?: Product[];
  onSaveProduct: (productData: {
    id?: number;
    name: string;
    category: string;
    unit: string;
    purchase_price: number;
    selling_price: number;
    wholesale_price?: number;
    stock_quantity: number;
    min_stock_alert: number;
  }) => Promise<void>;
}

export const AddProductModal: React.FC<AddProductModalProps> = ({
  isOpen,
  onClose,
  productToEdit,
  existingProducts = [],
  onSaveProduct
}) => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';
  const [name, setName] = useState('');
  const [category, setCategory] = useState('किराना');
  const [unit, setUnit] = useState('पैकेट');
  const [purchasePrice, setPurchasePrice] = useState('');
  const [sellingPrice, setSellingPrice] = useState('');
  const [wholesalePrice, setWholesalePrice] = useState('');
  const [stockQuantity, setStockQuantity] = useState('10');
  const [minStockAlert, setMinStockAlert] = useState('5');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (productToEdit) {
      setName(productToEdit.name);
      setCategory(productToEdit.category || 'किराना');
      setUnit(productToEdit.unit || 'पैकेट');
      setPurchasePrice(String(productToEdit.purchase_price));
      setSellingPrice(String(productToEdit.selling_price));
      setWholesalePrice(productToEdit.wholesale_price ? String(productToEdit.wholesale_price) : '');
      setStockQuantity(String(productToEdit.stock_quantity ?? 10));
      setMinStockAlert(String(productToEdit.min_stock_alert ?? 5));
    } else {
      setName('');
      setCategory('किराना');
      setUnit('पैकेट');
      setPurchasePrice('');
      setSellingPrice('');
      setWholesalePrice('');
      setStockQuantity('10');
      setMinStockAlert('5');
    }
    setError(null);
  }, [productToEdit, isOpen]);

  if (!isOpen) return null;

  const pPrice = parseFloat(purchasePrice) || 0;
  const sPrice = parseFloat(sellingPrice) || 0;
  const profit = sPrice - pPrice;
  const profitPct = pPrice > 0 ? (profit / pPrice) * 100 : 0;

  const isEditing = Boolean(productToEdit && productToEdit.id && productToEdit.id > 0);
  const cleanName = name.trim().toLowerCase();
  const cleanUnit = unit.trim().toLowerCase();

  const matchedDuplicateProduct = (!isEditing && cleanName.length >= 2)
    ? existingProducts?.find(
        p => p.name.trim().toLowerCase() === cleanName && (p.unit || '').trim().toLowerCase() === cleanUnit
      )
    : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!name.trim()) {
      setError(isEn ? 'Please enter product name' : 'कृपया सामान का नाम दर्ज करें');
      return;
    }
    if (pPrice < 0 || sPrice < 0) {
      setError(isEn ? 'Price cannot be negative' : 'कीमत नकारात्मक नहीं हो सकती');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const targetId = isEditing
        ? productToEdit!.id
        : matchedDuplicateProduct
        ? matchedDuplicateProduct.id
        : undefined;

      const wPrice = parseFloat(wholesalePrice) || 0;
      await onSaveProduct({
        id: targetId,
        name: name.trim(),
        category: category.trim(),
        unit: unit.trim(),
        purchase_price: pPrice,
        selling_price: sPrice,
        wholesale_price: wPrice > 0 ? wPrice : undefined,
        stock_quantity: 100,
        min_stock_alert: 0
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'सामान सेव करने में समस्या आई');
    } finally {
      setSubmitting(false);
    }
  };

  const categories = ['किराना', 'अनाज/दाल', 'तेल/घी', 'स्नैक्स/बिस्कुट', 'मसाले', 'साबुन/सर्फ', 'पेय पदार्थ', 'डेयरी/दूध', 'अन्य'];
  const units = ['पैकेट', 'किलो', 'लीटर', 'बोतल', 'पीस', 'डिब्बा', 'बोरी', 'दर्जन'];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-lg lg:max-w-xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden my-auto animate-in zoom-in-95 duration-150 border border-slate-100 dark:border-slate-800">
        {/* Pinned Header */}
        <div className="shrink-0 px-5 py-4 bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="p-2 bg-white/10 rounded-xl shrink-0">
              <Package className="w-5 h-5 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-base leading-tight truncate">
                {productToEdit && productToEdit.id && productToEdit.id > 0
                  ? (isEn ? 'Edit Product & Price' : 'सामान व दाम एडिट करें')
                  : productToEdit && productToEdit.id === 0
                  ? (isEn ? 'Add 2nd MRP / New Batch' : 'दूसरा MRP / नया बैच जोड़ें')
                  : (isEn ? 'Add New Product & Rates' : 'नया सामान व दाम जोड़ें')}
              </h3>
              <p className="text-xs text-emerald-200/90 font-medium truncate">
                {isEn ? 'Update cost, retail and wholesale rate' : 'खरीद भाव, खुदरा व थोक रेट सेट करें'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/15 text-white/80 hover:text-white transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
            {error && (
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isEn ? 'Product Name *' : 'सामान का नाम (Product Name) *'}
                </label>
                {sellingPrice && !name.includes(`₹${sellingPrice}`) && (
                  <button
                    type="button"
                    onClick={() => {
                      const clean = name.replace(/\s*\([^)]*MRP[^)]*\)/gi, '').trim();
                      setName(`${clean} (MRP ₹${sellingPrice})`);
                    }}
                    className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
                  >
                    + {isEn ? 'Add MRP tag' : 'नाम में MRP टैग जोड़ें'}
                  </button>
                )}
              </div>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder={isEn ? 'e.g. Parle-G Biscuit 100g' : 'उदा: पारले-जी बिस्कुट 100g, फॉर्च्यून तेल 1L...'}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                autoFocus
              />

              {matchedDuplicateProduct && (
                <div className="mt-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/80 text-xs space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-amber-900 dark:text-amber-200">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      {isEn
                        ? `"${matchedDuplicateProduct.name}" (${matchedDuplicateProduct.unit}) already exists in inventory!`
                        : `"${matchedDuplicateProduct.name}" (${matchedDuplicateProduct.unit}) इन्वेंट्री में पहले से मौजूद है!`}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300">
                    {isEn
                      ? `Current Selling: ₹${matchedDuplicateProduct.selling_price} • Purchase: ₹${matchedDuplicateProduct.purchase_price}`
                      : `मौजूदा बिक्री रेट: ₹${matchedDuplicateProduct.selling_price} • खरीद रेट: ₹${matchedDuplicateProduct.purchase_price}`}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPurchasePrice(String(matchedDuplicateProduct.purchase_price));
                      setSellingPrice(String(matchedDuplicateProduct.selling_price));
                      setWholesalePrice(matchedDuplicateProduct.wholesale_price ? String(matchedDuplicateProduct.wholesale_price) : '');
                      setStockQuantity(String(matchedDuplicateProduct.stock_quantity));
                      setMinStockAlert(String(matchedDuplicateProduct.min_stock_alert));
                      setError(null);
                    }}
                    className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-[11px] font-bold shadow-xs cursor-pointer transition-all"
                  >
                    {isEn ? 'Load Existing Rates & Update' : '🔄 मौजूदा रेट लोड करें और अपडेट करें'}
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {isEn ? 'Category' : 'श्रेणी (Category)'}
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {isEn ? 'Unit' : 'इकाई (Unit)'}
                </label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  {units.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Price section */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {isEn ? 'Purchase / Cost Price (₹)' : 'खरीद भाव / लागत मूल्य (₹)'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={purchasePrice}
                      onChange={(e) => setPurchasePrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    {isEn ? 'Retail Selling Price (₹) *' : 'खुदरा बिक्री मूल्य (₹) *'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-600 dark:text-emerald-400 font-bold">₹</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      required
                      value={sellingPrice}
                      onChange={(e) => setSellingPrice(e.target.value)}
                      placeholder="0.00"
                      className="w-full pl-7 pr-3 py-2.5 bg-white dark:bg-slate-800 border-2 border-emerald-500 rounded-xl text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  {isEn ? 'Wholesale Price (Optional - ₹)' : 'थोक बिक्री भाव (वैकल्पिक - ₹)'}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-amber-600 dark:text-amber-400 font-bold">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={wholesalePrice}
                    onChange={(e) => setWholesalePrice(e.target.value)}
                    placeholder={isEn ? 'Bulk rate per unit...' : 'पेटी या थोक रेट...'}
                    className="w-full pl-7 pr-3 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              {/* Live Profit Preview */}
              <div className="px-3.5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>{isEn ? `Expected profit per ${unit}:` : `प्रति ${unit} अपेक्षित मुनाफ़ा:`}</span>
                </span>
                <span className={`font-black text-sm ${profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                  ₹{profit.toFixed(2)} ({profitPct.toFixed(1)}%)
                </span>
              </div>
            </div>
          </div>

          {/* Pinned Action Buttons Footer */}
          <div className="shrink-0 p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
            >
              {isEn ? 'Cancel' : 'रद्द करें'}
            </button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold shadow-sm shadow-emerald-600/30 flex items-center justify-center gap-1.5 transition-all active:scale-98"
            >
              <Check className="w-4 h-4" />
              <span>{submitting ? (isEn ? 'Saving...' : 'सेव हो रहा है...') : (isEn ? 'Save Item' : 'सुरक्षित करें')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
