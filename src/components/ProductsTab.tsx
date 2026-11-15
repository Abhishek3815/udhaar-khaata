import React, { useState, useMemo, useRef } from 'react';
import {
  Search,
  Plus,
  Package,
  TrendingUp,
  Edit2,
  Trash2,
  Tag,
  Check,
  Sparkles,
  Filter,
  LayoutList,
  LayoutGrid,
  ChevronDown,
  ChevronUp,
  Copy,
  IndianRupee,
  ShoppingCart,
  Share2,
  Download,
  Upload,
  MessageCircle,
  ShieldAlert,
  Bell,
  Users,
  Printer,
  Volume2,
  X,
  AlertCircle
} from 'lucide-react';
import { Product, Customer, ShopSettings, MandiAlert } from '../types';
import { formatCurrency, playSoundboxVoice } from '../utils/speech';
import { QuickPriceModal } from './QuickPriceModal';
import { QuickBillModal } from './QuickBillModal';

interface ProductsTabProps {
  products: Product[];
  customers: Customer[];
  settings: ShopSettings;
  soundboxEnabled: boolean;
  onOpenAddProduct: (prod?: Product) => void;
  onUpdateStock?: (id: number, newStock: number) => Promise<void>;
  onUpdatePrice: (id: number, purchasePrice: number, sellingPrice: number, wholesalePrice?: number) => Promise<void>;
  onDeleteProduct: (id: number) => Promise<void>;
  onSaveKhataTransaction: (customerId: number, amount: number, notes: string) => Promise<void>;
  onImportProducts?: (products: Partial<Product>[]) => Promise<void>;
  onOpenVoice: () => void;
  lang?: 'hi' | 'en';
  mandiAlerts?: MandiAlert[];
  onOpenMandiModal?: (prefill?: any) => void;
  onDeleteMandiAlert?: (id: number) => Promise<void>;
}

export const ProductsTab: React.FC<ProductsTabProps> = ({
  products,
  customers,
  settings,
  soundboxEnabled,
  onOpenAddProduct,
  onUpdatePrice,
  onDeleteProduct,
  onSaveKhataTransaction,
  onImportProducts,
  onOpenVoice,
  lang = 'hi',
  mandiAlerts = [],
  onOpenMandiModal,
  onDeleteMandiAlert
}) => {
  const isEn = lang === 'en';
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'compact' | 'grid'>('compact');
  const [showFullStats, setShowFullStats] = useState(false);
  const [quickPriceProduct, setQuickPriceProduct] = useState<Product | null>(null);
  const [isQuickBillOpen, setIsQuickBillOpen] = useState(false);
  const [importing, setImporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDuplicateAsSecondMrp = (product: Product) => {
    const baseName = product.name.replace(/\s*\((2nd MRP|MRP|नया|पुराना)[^)]*\)/gi, '').trim();
    onOpenAddProduct({
      ...product,
      id: 0,
      name: `${baseName} (MRP ₹...)`,
      stock_quantity: 100,
      min_stock_alert: 0
    });
  };

  // Categories
  const categories = useMemo(() => {
    const cats = Array.from(new Set(products.map(p => p.category || 'General')));
    return cats.filter(Boolean);
  }, [products]);

  // Rate & Margin Stats
  const stats = useMemo(() => {
    const totalItems = products.length;
    let totalPurchaseSum = 0;
    let totalSellingSum = 0;

    products.forEach(p => {
      totalPurchaseSum += p.purchase_price;
      totalSellingSum += p.selling_price;
    });

    const totalProfitSum = totalSellingSum - totalPurchaseSum;
    const avgMargin = totalPurchaseSum > 0 ? (totalProfitSum / totalPurchaseSum) * 100 : 0;

    return {
      totalItems,
      avgMargin,
      totalSellingSum,
      totalPurchaseSum
    };
  }, [products]);

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchSearch =
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchSearch) return false;
      if (selectedCategory !== 'all' && p.category !== selectedCategory) {
        return false;
      }
      return true;
    });
  }, [products, searchQuery, selectedCategory]);

  // 1. WhatsApp Share Rate List
  const handleShareRateListWhatsApp = () => {
    let text = `*🏬 ${settings.shop_name || 'दुकान खाता'} - आज की ताजा भाव सूची*\n`;
    text += `📅 दिनांक: ${new Date().toLocaleDateString('hi-IN')}\n`;
    text += `--------------------------------\n\n`;

    const grouped: Record<string, Product[]> = {};
    products.forEach(p => {
      const cat = p.category || 'किराना';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    });

    Object.entries(grouped).forEach(([cat, list]) => {
      text += `*📂 ${cat}:*\n`;
      list.forEach(p => {
        let line = `• ${p.name}: *₹${p.selling_price}* / ${p.unit || 'पैकेट'}`;
        if (p.wholesale_price && p.wholesale_price > 0) {
          line += ` (थोक: ₹${p.wholesale_price})`;
        }
        text += `${line}\n`;
      });
      text += `\n`;
    });

    text += `--------------------------------\n`;
    if (settings.phone) text += `📞 ऑर्डर के लिए संपर्क करें: ${settings.phone}\n`;
    text += `धन्यवाद! 🙏`;

    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  // 2. Export Rate List to CSV
  const handleExportCSV = () => {
    const headers = ['सामान का नाम (Name)', 'श्रेणी (Category)', 'इकाई (Unit)', 'खरीद भाव (Purchase)', 'खुदरा भाव (Retail)', 'थोक भाव (Wholesale)'];
    const rows = products.map(p => [
      `"${p.name.replace(/"/g, '""')}"`,
      `"${(p.category || 'General').replace(/"/g, '""')}"`,
      `"${(p.unit || 'पैकेट').replace(/"/g, '""')}"`,
      p.purchase_price,
      p.selling_price,
      p.wholesale_price || 0
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Dukaan_Rate_List_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 3. Import CSV
  const handleImportCSVFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImportProducts) return;

    setImporting(true);
    try {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
      if (lines.length <= 1) {
        alert(isEn ? 'No data in CSV file' : 'CSV फाइल में कोई डेटा नहीं मिला');
        return;
      }

      const newProducts: Partial<Product>[] = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(s => s.trim().replace(/^"|"$/g, ''));
        if (parts.length >= 2 && parts[0]) {
          newProducts.push({
            name: parts[0],
            category: parts[1] || 'किराना',
            unit: parts[2] || 'पैकेट',
            purchase_price: parseFloat(parts[3]) || 0,
            selling_price: parseFloat(parts[4]) || 0,
            wholesale_price: parseFloat(parts[5]) || 0,
            stock_quantity: 100,
            min_stock_alert: 0
          });
        }
      }

      await onImportProducts(newProducts);
      playSoundboxVoice(isEn ? 'Rates imported successfully' : 'नये रेट सफलतापूर्वक इम्पोर्ट हो गए हैं', soundboxEnabled);
      alert(isEn ? `${newProducts.length} items imported successfully!` : `${newProducts.length} आइटम सफलतापूर्वक लोड हो गए!`);
    } catch {
      alert(isEn ? 'Error importing CSV' : 'CSV इम्पोर्ट करने में त्रुटि');
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const announceRate = (prod: Product) => {
    const msg = isEn
      ? `${prod.name} selling rate is ${prod.selling_price} rupees per ${prod.unit || 'unit'}`
      : `${prod.name} का खुदरा रेट है ${prod.selling_price} रुपये प्रति ${prod.unit || 'पैकेट'}`;
    playSoundboxVoice(msg, soundboxEnabled);
  };

  return (
    <>
      <div className="space-y-4 pb-24 lg:pb-12 no-print max-w-7xl mx-auto px-3 sm:px-6 py-4">
        {/* --- 1. TOP ANALYTICS & STATS BANNER --- */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900 text-white shadow-md shadow-emerald-600/20">
            <div className="flex items-center justify-between text-emerald-100 text-xs font-semibold mb-1">
              <span>{isEn ? 'Total Products' : 'कुल सामान'}</span>
              <Package className="w-4 h-4 text-emerald-300" />
            </div>
            <div className="text-2xl font-black">{stats.totalItems}</div>
            <p className="text-[10px] text-emerald-100/80 mt-1 font-medium">
              {categories.length} {isEn ? 'categories registered' : 'अलग-अलग कैटेगरी'}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-700 to-slate-900 text-white shadow-md shadow-indigo-600/20">
            <div className="flex items-center justify-between text-indigo-100 text-xs font-semibold mb-1">
              <span>{isEn ? 'Avg Margin' : 'औसत मुनाफा (मार्जिन)'}</span>
              <TrendingUp className="w-4 h-4 text-indigo-300" />
            </div>
            <div className="text-2xl font-black">
              {stats.avgMargin > 0 ? `+${stats.avgMargin.toFixed(1)}%` : '0%'}
            </div>
            <p className="text-[10px] text-indigo-100/80 mt-1 font-medium">
              {isEn ? 'Across all price points' : 'लागत पर औसत मार्जिन'}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
              <span>{isEn ? 'Quick Bill Generator' : '⚡ तुरंत पर्ची'}</span>
              <ShoppingCart className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <button
              onClick={() => setIsQuickBillOpen(true)}
              className="w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-sm active:scale-95 transition-all text-center flex items-center justify-center gap-1.5"
            >
              <span>{isEn ? 'Create Bill / पर्ची' : 'नया बिल / पर्ची बनाएं'}</span>
            </button>
            <p className="text-[10px] text-slate-400 mt-1">
              {isEn ? 'Fast POS Counter Bill' : 'दुकान काउंटर बिक्री'}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">
              <span>{isEn ? 'Mandi Wholesale Alert' : '🚜 मंडी अलर्ट'}</span>
              <ShieldAlert className="w-4 h-4 text-amber-500" />
            </div>
            <button
              onClick={() => onOpenMandiModal && onOpenMandiModal()}
              className="w-full py-2 px-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl text-xs font-extrabold shadow-sm active:scale-95 transition-all text-center flex items-center justify-center gap-1.5"
            >
              <span>{isEn ? 'Send Mandi Alert' : 'स्टाफ को भाव भेजें'}</span>
            </button>
            <p className="text-[10px] text-slate-400 mt-1">
              {mandiAlerts.length} {isEn ? 'active broadcast alerts' : 'सक्रिय मंडी अलर्ट'}
            </p>
          </div>
        </div>

        {/* --- LIVE MANDI ALERTS BANNER (IF ANY) --- */}
        {mandiAlerts.length > 0 && (
          <div className="p-3.5 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/5 dark:from-amber-950/30 dark:to-orange-950/20 border border-amber-300 dark:border-amber-800/80 rounded-2xl flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-2 rounded-xl bg-amber-500 text-white shrink-0 animate-pulse">
                <Bell className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <h4 className="text-xs font-black text-amber-900 dark:text-amber-200 flex items-center gap-1.5 truncate">
                  <span>🚜 {isEn ? 'Live Mandi Price Update' : 'ताज़ा मंडी भाव अलर्ट'}</span>
                  <span className="text-[10px] bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 px-1.5 py-0.2 rounded font-bold">
                    {mandiAlerts[0].product_name}
                  </span>
                </h4>
                <p className="text-[11px] text-amber-800/90 dark:text-amber-300/80 truncate">
                  {isEn ? 'New Rate:' : 'नया भाव:'} ₹{mandiAlerts[0].new_price}/{mandiAlerts[0].unit || 'क्विंटल'} • {mandiAlerts[0].notes || 'मार्केट में भाव में बदलाव'}
                </p>
              </div>
            </div>

            {onDeleteMandiAlert && (
              <button
                onClick={() => onDeleteMandiAlert(mandiAlerts[0].id)}
                className="p-1.5 rounded-lg text-amber-700 hover:text-amber-900 dark:text-amber-300 shrink-0"
                title={isEn ? 'Dismiss alert' : 'अलर्ट हटाएं'}
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {/* --- 2. TOOLBAR: SEARCH, ACTIONS & CATEGORIES --- */}
        <div className="bg-white dark:bg-slate-900 p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
            {/* Search Box */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={isEn ? 'Search item & click to change rates...' : 'सामान खोजें और क्लिक करके तुरंत रेट बदलें...'}
                className="w-full pl-10 pr-9 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
              {/* WhatsApp Share Rate List */}
              <button
                onClick={handleShareRateListWhatsApp}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60 rounded-xl text-xs font-bold transition-all active:scale-95 shrink-0"
                title={isEn ? 'Share Rate List on WhatsApp' : 'ग्राहकों को WhatsApp पर रेट लिस्ट भेजें'}
              >
                <MessageCircle className="w-4 h-4 text-emerald-600" />
                <span className="hidden sm:inline">{isEn ? 'WhatsApp Rates' : 'WhatsApp लिस्ट'}</span>
                <span className="sm:hidden">{isEn ? 'Share' : 'शेयर'}</span>
              </button>

              {/* Export CSV */}
              <button
                onClick={handleExportCSV}
                className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all active:scale-95 shrink-0"
                title={isEn ? 'Export to Excel / CSV' : 'CSV फाइल डाउनलोड करें'}
              >
                <Download className="w-4 h-4" />
              </button>

              {/* Import CSV */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleImportCSVFile}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all active:scale-95 shrink-0"
                title={isEn ? 'Import CSV Rates' : 'CSV फाइल से रेट लोड करें'}
              >
                <Upload className="w-4 h-4" />
              </button>

              {/* Print Rate List */}
              <button
                onClick={() => window.print()}
                className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all active:scale-95 shrink-0"
                title={isEn ? 'Print Rate List' : 'रेट लिस्ट प्रिंट करें'}
              >
                <Printer className="w-4 h-4" />
              </button>

              {/* View Switcher (Compact vs Grid) */}
              <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 shrink-0">
                <button
                  onClick={() => setViewMode('compact')}
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === 'compact'
                      ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                  }`}
                  title={isEn ? 'Compact List View' : 'सघन लिस्ट व्यू'}
                >
                  <LayoutList className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded-lg transition-all ${
                    viewMode === 'grid'
                      ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 shadow-xs'
                      : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                  }`}
                  title={isEn ? 'Card Grid View' : 'ग्रिड कार्ड व्यू'}
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>

              {/* Add Product Button */}
              <button
                onClick={() => onOpenAddProduct()}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-extrabold shadow-sm shadow-emerald-600/30 active:scale-95 transition-all shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>{isEn ? 'Add Item' : '+ नया सामान'}</span>
              </button>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-1 border-t border-slate-100 dark:border-slate-800">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                selectedCategory === 'all'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm font-black'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {isEn ? 'All Items' : 'सभी सामान'} ({products.length})
            </button>

            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* --- 3. PRODUCTS LIST / GRID VIEW --- */}
        {filteredProducts.length === 0 ? (
          <div className="text-center py-16 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <Package className="w-7 h-7" />
            </div>
            <h3 className="text-base font-extrabold text-slate-800 dark:text-slate-100">
              {isEn ? 'No product found' : 'कोई सामान नहीं मिला'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              {searchQuery
                ? (isEn ? `No product matching "${searchQuery}".` : `"${searchQuery}" नाम का कोई आइटम लिस्ट में नहीं है।`)
                : (isEn ? 'No items in this category.' : 'इस श्रेणी में कोई सामान नहीं है।')}
            </p>
            <button
              onClick={() => onOpenAddProduct()}
              className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-2 shadow-sm transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>{isEn ? 'Add New Product' : 'नया सामान जोड़ें'}</span>
            </button>
          </div>
        ) : viewMode === 'compact' ? (
          /* COMPACT LIST VIEW */
          <div className="space-y-2">
            {filteredProducts.map(product => {
              const unitProfit = product.selling_price - product.purchase_price;
              const profitPct =
                product.purchase_price > 0 ? (unitProfit / product.purchase_price) * 100 : 0;

              return (
                <div
                  key={product.id}
                  className="flex items-center justify-between p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 hover:border-emerald-300 dark:hover:border-emerald-700/60 shadow-2xs hover:shadow-xs transition-all gap-3"
                >
                  {/* Left: Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                        {product.name}
                      </h4>
                      <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] px-1.5 py-0.5 rounded-md font-semibold shrink-0">
                        {product.unit || 'पैकेट'}
                      </span>
                    </div>

                    {/* Rates Strip (Click to quickly update) */}
                    <div
                      onClick={() => setQuickPriceProduct(product)}
                      className="flex items-center gap-2 sm:gap-3 text-xs text-slate-500 dark:text-slate-400 mt-1 cursor-pointer hover:opacity-80 flex-wrap"
                      title={isEn ? 'Click to change rates' : 'रेट बदलने के लिए क्लिक करें'}
                    >
                      <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60 px-1.5 py-0.2 rounded font-bold text-[10px]">
                        {product.category || 'General'}
                      </span>

                      <span>
                        {isEn ? 'Cost:' : 'लागत:'}{' '}
                        <strong className="text-slate-800 dark:text-slate-200">
                          ₹{product.purchase_price}
                        </strong>
                      </span>

                      <span>
                        {isEn ? 'Retail:' : 'खुदरा:'}{' '}
                        <strong className="text-emerald-600 dark:text-emerald-400 font-black text-sm">
                          ₹{product.selling_price}
                        </strong>
                      </span>

                      {product.wholesale_price && product.wholesale_price > 0 ? (
                        <span className="bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-900/60 px-1.5 py-0.2 rounded font-extrabold text-[10px]">
                          {isEn ? 'Wholesale:' : 'थोक:'} ₹{product.wholesale_price}
                        </span>
                      ) : null}

                      <span className="text-emerald-600 dark:text-emerald-400 font-bold hidden sm:inline text-[11px]">
                        (+₹{unitProfit.toFixed(1)} / {profitPct.toFixed(0)}%)
                      </span>
                    </div>
                  </div>

                  {/* Right Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Announce Voice Button */}
                    <button
                      onClick={() => announceRate(product)}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 active:scale-95 transition-all"
                      title={isEn ? 'Announce Price Voice' : 'बोलकर भाव बताएं'}
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Quick Price Modifier */}
                    <button
                      onClick={() => setQuickPriceProduct(product)}
                      className="px-2.5 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60 text-xs font-bold active:scale-95 transition-all"
                    >
                      {isEn ? 'Change Rate' : 'रेट बदलें'}
                    </button>

                    {/* Duplicate 2nd MRP */}
                    <button
                      onClick={() => handleDuplicateAsSecondMrp(product)}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 active:scale-95 transition-all hidden sm:block"
                      title={isEn ? 'Duplicate as 2nd MRP' : 'दूसरा MRP बनाएं'}
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>

                    {/* Edit Product */}
                    <button
                      onClick={() => onOpenAddProduct(product)}
                      className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 active:scale-95 transition-all"
                      title={isEn ? 'Edit product details' : 'बदलाव करें'}
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>

                    {/* Delete Product */}
                    <button
                      onClick={() => {
                        if (confirm(isEn ? `Delete ${product.name}?` : `क्या आप ${product.name} को हटाना चाहते हैं?`)) {
                          onDeleteProduct(product.id);
                        }
                      }}
                      className="p-2 rounded-xl bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60 active:scale-95 transition-all"
                      title={isEn ? 'Delete product' : 'हटाएं'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* GRID CARDS VIEW (Responsive 1 col mobile, 2 col tablet, 3-4 col desktop) */
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
            {filteredProducts.map(product => {
              const unitProfit = product.selling_price - product.purchase_price;
              const profitPct =
                product.purchase_price > 0 ? (unitProfit / product.purchase_price) * 100 : 0;

              return (
                <div
                  key={product.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-xs hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-700/60 transition-all flex flex-col justify-between group"
                >
                  <div>
                    {/* Card Top: Category and Unit Tag */}
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60 px-2 py-0.5 rounded-full font-bold text-[10px]">
                        {product.category || 'General'}
                      </span>
                      <span className="text-slate-400 text-xs font-semibold">
                        / {product.unit || 'पैकेट'}
                      </span>
                    </div>

                    {/* Product Name */}
                    <h4 className="font-extrabold text-sm text-slate-900 dark:text-white group-hover:text-emerald-700 dark:group-hover:text-emerald-400 transition-colors line-clamp-2">
                      {product.name}
                    </h4>

                    {/* Price Cards Box */}
                    <div
                      onClick={() => setQuickPriceProduct(product)}
                      className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-100 dark:border-slate-800 cursor-pointer hover:border-emerald-300 transition-all"
                    >
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-slate-500 font-medium">{isEn ? 'Selling Rate:' : 'खुदरा भाव:'}</span>
                        <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                          ₹{product.selling_price}
                        </span>
                      </div>

                      <div className="flex items-baseline justify-between text-xs text-slate-500 mt-1">
                        <span>{isEn ? 'Purchase Cost:' : 'खरीद भाव:'}</span>
                        <span className="font-bold text-slate-700 dark:text-slate-300">
                          ₹{product.purchase_price}
                        </span>
                      </div>

                      {product.wholesale_price && product.wholesale_price > 0 ? (
                        <div className="flex items-baseline justify-between text-xs text-amber-800 dark:text-amber-300 mt-1 pt-1 border-t border-slate-200/60 dark:border-slate-700">
                          <span className="font-bold">{isEn ? 'Wholesale:' : 'थोक भाव:'}</span>
                          <span className="font-black">₹{product.wholesale_price}</span>
                        </div>
                      ) : null}

                      <div className="mt-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center justify-between">
                        <span>{isEn ? 'Profit Margin' : 'मार्जिन'}:</span>
                        <span>+₹{unitProfit.toFixed(1)} ({profitPct.toFixed(0)}%)</span>
                      </div>
                    </div>
                  </div>

                  {/* Card Bottom Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <button
                      onClick={() => announceRate(product)}
                      className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 active:scale-95 transition-all"
                      title={isEn ? 'Announce Rate Voice' : 'बोलकर भाव बताएं'}
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleDuplicateAsSecondMrp(product)}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 active:scale-95 transition-all"
                        title={isEn ? 'Duplicate 2nd MRP' : '2nd MRP कॉपी करें'}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => onOpenAddProduct(product)}
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 active:scale-95 transition-all"
                        title={isEn ? 'Edit Product' : 'एडिट करें'}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => {
                          if (confirm(isEn ? `Delete ${product.name}?` : `क्या आप ${product.name} को हटाना चाहते हैं?`)) {
                            onDeleteProduct(product.id);
                          }
                        }}
                        className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 active:scale-95 transition-all"
                        title={isEn ? 'Delete Product' : 'हटाएं'}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* --- QUICK PRICE MODAL --- */}
      {quickPriceProduct && (
        <QuickPriceModal
          isOpen={Boolean(quickPriceProduct)}
          onClose={() => setQuickPriceProduct(null)}
          product={quickPriceProduct}
          onSavePrice={onUpdatePrice}
        />
      )}

      {/* --- QUICK BILL MODAL --- */}
      {isQuickBillOpen && (
        <QuickBillModal
          isOpen={isQuickBillOpen}
          onClose={() => setIsQuickBillOpen(false)}
          products={products}
          customers={customers}
          settings={settings}
          soundboxEnabled={soundboxEnabled}
          onSaveKhataTransaction={onSaveKhataTransaction}
        />
      )}
    </>
  );
};
