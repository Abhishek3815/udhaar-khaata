import React, { useState, useMemo } from 'react';
import { X, Plus, Minus, Trash2, ShoppingCart, Check, IndianRupee, MessageCircle, UserCheck, Search, ArrowUpRight, Printer } from 'lucide-react';
import { Product, Customer, ShopSettings } from '../types';
import { formatCurrency, playSoundboxVoice } from '../utils/speech';
import { useLanguage } from '../context/LanguageContext';

interface CartItem {
  product: Product;
  quantity: number;
  priceType: 'retail' | 'wholesale';
  appliedPrice: number;
}

interface QuickBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  customers: Customer[];
  settings: ShopSettings;
  soundboxEnabled: boolean;
  onSaveKhataTransaction: (customerId: number, amount: number, notes: string) => Promise<void>;
}

export const QuickBillModal: React.FC<QuickBillModalProps> = ({
  isOpen,
  onClose,
  products,
  customers,
  settings,
  soundboxEnabled,
  onSaveKhataTransaction
}) => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | ''>('');
  const [globalPriceMode, setGlobalPriceMode] = useState<'retail' | 'wholesale'>('retail');
  const [submitting, setSubmitting] = useState(false);
  const [step, setStep] = useState<'cart' | 'khata_select'>('cart');

  if (!isOpen) return null;

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.category.toLowerCase().includes(search.toLowerCase())
  );

  const addToCart = (product: Product) => {
    const effectivePrice = globalPriceMode === 'wholesale' && product.wholesale_price && product.wholesale_price > 0
      ? product.wholesale_price
      : product.selling_price;

    setCart(prev => {
      const idx = prev.findIndex(item => item.product.id === product.id);
      if (idx !== -1) {
        const updated = [...prev];
        updated[idx].quantity += 1;
        return updated;
      }
      return [...prev, {
        product,
        quantity: 1,
        priceType: globalPriceMode,
        appliedPrice: effectivePrice
      }];
    });
  };

  const updateQuantity = (productId: number, qty: number) => {
    if (qty <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart(prev =>
      prev.map(item => (item.product.id === productId ? { ...item, quantity: qty } : item))
    );
  };

  const removeFromCart = (productId: number) => {
    setCart(prev => prev.filter(item => item.product.id !== productId));
  };

  const toggleItemPriceType = (productId: number) => {
    setCart(prev =>
      prev.map(item => {
        if (item.product.id !== productId) return item;
        const newType = item.priceType === 'retail' ? 'wholesale' : 'retail';
        const newPrice = newType === 'wholesale' && item.product.wholesale_price && item.product.wholesale_price > 0
          ? item.product.wholesale_price
          : item.product.selling_price;
        return {
          ...item,
          priceType: newType,
          appliedPrice: newPrice
        };
      })
    );
  };

  const billTotal = cart.reduce((sum, item) => sum + item.appliedPrice * item.quantity, 0);

  const generateBillSummaryNotes = () => {
    const itemsText = cart.map(item => `${item.quantity}x ${item.product.name} (₹${item.appliedPrice})`).join(', ');
    return `कच्चा बिल: ${itemsText}`;
  };

  const handleCashPayment = () => {
    if (cart.length === 0) return;
    const phrase = `कच्चा बिल ${formatCurrency(billTotal)} नकद प्राप्त हुआ`;
    playSoundboxVoice(phrase, soundboxEnabled);
    alert(`✅ कुल बिल ₹${billTotal} नकद भुगतान सफल!`);
    setCart([]);
    onClose();
  };

  const handleAddToKhata = async () => {
    if (!selectedCustomerId) {
      alert('कृपया ग्राहक चुनें जिनके खाते में यह बिल जोड़ना है');
      return;
    }
    if (billTotal <= 0) {
      alert('बिल राशि 0 से अधिक होनी चाहिए');
      return;
    }

    setSubmitting(true);
    try {
      const notes = generateBillSummaryNotes();
      await onSaveKhataTransaction(Number(selectedCustomerId), billTotal, notes);
      const cust = customers.find(c => c.id === Number(selectedCustomerId));
      const phrase = `${cust ? cust.name : 'ग्राहक'} के खाते में कच्चा बिल ₹${billTotal} उधार दर्ज हो गया है`;
      playSoundboxVoice(phrase, soundboxEnabled);
      alert(`✅ ₹${billTotal} का कच्चा बिल खाते में दर्ज हो गया है!`);
      setCart([]);
      setStep('cart');
      onClose();
    } catch (err: any) {
      alert(err.message || 'खाते में बिल दर्ज करने में समस्या आई');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShareWhatsApp = () => {
    if (cart.length === 0) return;
    let text = `*कच्चा बिल (Bill Slip)*\n`;
    text += `🏬 *${settings.shop_name || 'दुकान खाता'}*\n`;
    text += `📅 तारीख व समय: ${new Date().toLocaleDateString('hi-IN')} ${new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}\n`;
    text += `--------------------------------\n`;

    cart.forEach(item => {
      const subtotal = item.appliedPrice * item.quantity;
      text += `• ${item.product.name} x ${item.quantity} = ₹${subtotal}\n`;
    });

    text += `--------------------------------\n`;
    text += `*कुल जोड़ (Total Amount): ₹${billTotal}*\n`;

    if (settings.upi_id) {
      text += `\n📲 UPI भुगतान लिंक:\nupi://pay?pa=${settings.upi_id}&pn=${encodeURIComponent(settings.shop_name || 'Dukaan')}&am=${billTotal}&cu=INR\n`;
    }

    text += `\nधन्यवाद! आपका दिन शुभ हो 🙏`;

    const encoded = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
  };

  const handlePrintBill = () => {
    document.body.classList.add('printing-modal');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-modal');
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="w-full max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden my-auto border border-slate-100 dark:border-slate-800">
        {/* Pinned Header */}
        <div className="shrink-0 p-4 bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between no-print">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="p-2 bg-white/10 rounded-2xl shrink-0">
              <ShoppingCart className="w-5 h-5 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-base leading-tight truncate">
                {isEn ? 'Quick Bill / Calculator' : 'कच्चा बिल / त्वरित कैलकुलेटर'}
              </h3>
              <p className="text-xs text-teal-100/90 font-medium truncate">
                {isEn ? 'Add items, calculate total and add directly to customer ledger' : 'सामान जोड़ें, टोटल बनाएं और सीधे खाते में उधार लिखें'}
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

        {/* Wholesale vs Retail Rate Switcher */}
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between no-print shrink-0">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
            {isEn ? 'Pricing Mode:' : 'भाव प्रकार (Pricing Mode):'}
          </span>
          <div className="flex bg-slate-200 dark:bg-slate-700/80 p-0.5 rounded-xl text-xs font-extrabold">
            <button
              onClick={() => setGlobalPriceMode('retail')}
              className={`px-3 py-1 rounded-lg transition-all ${
                globalPriceMode === 'retail'
                  ? 'bg-white dark:bg-slate-900 text-emerald-800 dark:text-emerald-300 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {isEn ? 'Retail' : 'खुदरा (Retail)'}
            </button>
            <button
              onClick={() => setGlobalPriceMode('wholesale')}
              className={`px-3 py-1 rounded-lg transition-all ${
                globalPriceMode === 'wholesale'
                  ? 'bg-white dark:bg-slate-900 text-amber-800 dark:text-amber-300 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {isEn ? 'Wholesale' : 'थोक (Wholesale)'}
            </button>
          </div>
        </div>

        {step === 'cart' ? (
          <>
            {/* Search items to add */}
            <div className="p-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={isEn ? 'Search item and add (e.g. oil, flour, maggi)...' : 'सामान खोजें और जोड़ें (उदा. तेल, आटा, मैगी)...'}
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* Quick search items pill list */}
              {search.trim().length > 0 && (
                <div className="mt-2 max-h-36 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 shadow-lg">
                  {filteredProducts.slice(0, 6).map(p => {
                    const price = globalPriceMode === 'wholesale' && p.wholesale_price && p.wholesale_price > 0
                      ? p.wholesale_price
                      : p.selling_price;
                    return (
                      <div
                        key={p.id}
                        onClick={() => {
                          addToCart(p);
                          setSearch('');
                        }}
                        className="p-2.5 hover:bg-teal-50 dark:hover:bg-teal-950/40 cursor-pointer flex justify-between items-center text-xs transition-colors"
                      >
                        <div>
                          <strong className="text-slate-900 dark:text-white font-bold">{p.name}</strong>
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 ml-1.5">({p.unit || 'पैकेट'})</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-emerald-700 dark:text-emerald-400">₹{price}</span>
                          <span className="px-2 py-0.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white font-bold text-[10px]">
                            + जोड़ें
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Current Bill Items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 divide-y divide-slate-100 dark:divide-slate-800">
              {cart.length === 0 ? (
                <div className="py-10 text-center text-slate-400 dark:text-slate-500 space-y-2">
                  <ShoppingCart className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">बिल में अभी कोई सामान नहीं है</p>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500">ऊपर सर्च बार से सामान चुनें या नीचे दी गई लिस्ट से जोड़ें।</p>
                </div>
              ) : (
                cart.map(item => {
                  const subtotal = item.appliedPrice * item.quantity;
                  return (
                    <div key={item.product.id} className="pt-2 first:pt-0 flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-xs text-slate-900 dark:text-white truncate">
                          {item.product.name}
                        </h4>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                          <button
                            type="button"
                            onClick={() => toggleItemPriceType(item.product.id)}
                            className={`px-1.5 py-0.2 rounded font-extrabold border ${
                              item.priceType === 'wholesale'
                                ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                                : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                            }`}
                            title="क्लिक करके थोक या खुदरा भाव बदलें"
                          >
                            {item.priceType === 'wholesale' ? 'थोक भाव' : 'खुदरा भाव'}: ₹{item.appliedPrice}
                          </button>
                        </div>
                      </div>

                      {/* Stepper & Subtotal */}
                      <div className="flex items-center space-x-2 shrink-0">
                        <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5 border border-slate-200 dark:border-slate-700">
                          <button
                            onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                            className="w-5 h-5 rounded bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center shadow-2xs hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="px-2 text-xs font-black min-w-[24px] text-center text-slate-900 dark:text-white">
                            {item.quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                            className="w-5 h-5 rounded bg-teal-700 text-white font-bold text-xs flex items-center justify-center shadow-2xs hover:bg-teal-600 transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <span className="font-black text-xs text-slate-900 dark:text-white min-w-[48px] text-right">
                          ₹{subtotal}
                        </span>

                        <button
                          onClick={() => removeFromCart(item.product.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bill Total & Actions */}
            <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 space-y-3 shrink-0">
              <div className="flex justify-between items-center">
                <span className="text-xs font-extrabold text-slate-600 dark:text-slate-300">
                  कुल सामान: {cart.reduce((s, i) => s + i.quantity, 0)} पीस
                </span>
                <div className="text-right">
                  <span className="text-xs text-slate-500 dark:text-slate-400 block">कुल बिल जोड़:</span>
                  <span className="text-2xl font-black text-emerald-700 dark:text-emerald-400">
                    ₹{billTotal}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {/* 1. Cash Paid */}
                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={handleCashPayment}
                  className="py-2.5 px-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all disabled:opacity-40"
                >
                  <IndianRupee className="w-3.5 h-3.5" />
                  <span>{isEn ? '💰 Cash Paid' : '💰 नकद मिला'}</span>
                </button>

                {/* 2. Add to Khata */}
                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={() => setStep('khata_select')}
                  className="py-2.5 px-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all disabled:opacity-40"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  <span>{isEn ? '📒 Add Udhaar' : '📒 उधार जोड़ें'}</span>
                </button>

                {/* 3. Print Bill Receipt */}
                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={handlePrintBill}
                  className="py-2.5 px-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all disabled:opacity-40"
                  title={isEn ? 'Print customer bill receipt' : 'बिल पर्ची प्रिंट करें'}
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>{isEn ? '🖨️ Print Bill' : '🖨️ प्रिंट बिल'}</span>
                </button>

                {/* 4. Share Bill WhatsApp */}
                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={handleShareWhatsApp}
                  className="py-2.5 px-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all disabled:opacity-40"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>📲 WhatsApp</span>
                </button>
              </div>
            </div>
          </>
        ) : (
          /* Step 2: Select Customer for Khata */
          <div className="p-5 space-y-4 flex-1 overflow-y-auto">
            <div className="bg-rose-50 dark:bg-rose-950/40 p-3.5 rounded-2xl border border-rose-200 dark:border-rose-800">
              <span className="text-xs text-rose-800 dark:text-rose-300 font-bold block">
                {isEn ? 'Amount to be added to credit:' : 'उधार दर्ज होने वाली रकम:'}
              </span>
              <span className="text-2xl font-black text-rose-700 dark:text-rose-400">₹{billTotal}</span>
              <p className="text-[11px] text-rose-600 dark:text-rose-300/80 mt-0.5 truncate">
                {generateBillSummaryNotes()}
              </p>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 block mb-1">
                {isEn ? 'Select Customer to record udhaar:*' : 'किस ग्राहक के खाते में उधार लिखना है?*'}
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                <option value="">{isEn ? '-- Select Customer --' : '-- ग्राहक चुनें --'}</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} {c.phone ? `(${c.phone})` : ''} - {isEn ? 'Due:' : 'बाकी:'} ₹{c.net_balance || 0}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep('cart')}
                className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold text-xs transition-colors"
              >
                {isEn ? 'Back' : 'वापस जाएं'}
              </button>

              <button
                type="button"
                disabled={!selectedCustomerId || submitting}
                onClick={handleAddToKhata}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-black text-xs flex items-center justify-center gap-1 shadow-md shadow-rose-600/20 active:scale-95 transition-all disabled:opacity-40"
              >
                {submitting
                  ? (isEn ? 'Saving...' : 'दर्ज हो रहा है...')
                  : (isEn ? '✅ Add to Customer Udhaar' : '✅ उधार खाते में जोड़ें')}
              </button>
            </div>
          </div>
        )}

        {/* 🖨️ Printable Bill Slip View (Appears on print) */}
        <div className="hidden print:block p-4 text-slate-900 font-sans max-w-sm mx-auto">
          {/* Header */}
          <div className="text-center border-b-2 border-slate-900 pb-2 mb-3">
            <h2 className="text-lg font-black">{settings.shop_name || 'दुकान खाता'}</h2>
            {settings.owner_name && <p className="text-[11px] font-bold">{isEn ? 'Prop: ' : 'संचालक: '}{settings.owner_name}</p>}
            {settings.phone && <p className="text-[11px]">{isEn ? 'Mobile: ' : 'मो: '}{settings.phone}</p>}
            {settings.address && <p className="text-[10px] text-slate-600">{settings.address}</p>}
            <div className="flex justify-between items-center text-[11px] font-black mt-2 pt-1 border-t border-slate-300">
              <span>{isEn ? 'CASH / BILL SLIP' : 'कच्चा बिल / नकद पर्ची'}</span>
              <span>{new Date().toLocaleDateString('hi-IN')} {new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
            </div>
          </div>

          {/* Items Table */}
          <table className="w-full text-xs border-collapse mb-3">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] font-bold">
                <th className="py-1 text-left">सामान (Item)</th>
                <th className="py-1 text-center">मात्रा</th>
                <th className="py-1 text-right">दर</th>
                <th className="py-1 text-right">रकम</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {cart.map((item, idx) => (
                <tr key={idx} className="py-1">
                  <td className="py-1 text-left font-medium">{item.product.name}</td>
                  <td className="py-1 text-center">{item.quantity} {item.product.unit || 'पीस'}</td>
                  <td className="py-1 text-right">₹{item.appliedPrice}</td>
                  <td className="py-1 text-right font-black">₹{item.appliedPrice * item.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Grand Total */}
          <div className="border-t-2 border-slate-900 pt-2 flex justify-between items-center text-sm font-black mb-3">
            <span>कुल बिल (Grand Total):</span>
            <span className="text-base font-black">₹{billTotal}</span>
          </div>

          {/* UPI QR if configured */}
          {settings.upi_id && billTotal > 0 && (
            <div className="text-center p-2 border border-slate-300 rounded-lg my-2">
              <p className="text-[10px] font-bold">📲 UPI से तुरंत पे करें:</p>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`upi://pay?pa=${settings.upi_id}&pn=${encodeURIComponent(settings.shop_name || 'Dukaan')}&am=${billTotal}&cu=INR`)}`}
                alt="UPI QR Code"
                className="w-24 h-24 mx-auto my-1"
              />
              <p className="text-[9px] font-mono">{settings.upi_id}</p>
            </div>
          )}

          {/* Footer */}
          <div className="text-center text-[10px] text-slate-500 pt-2 border-t border-slate-200">
            <p>🙏 धन्यवाद! फिर पधारें (Thank You! Visit Again) 🙏</p>
            <p>Computerized Bill • Generated by Dukaan Khaata</p>
          </div>
        </div>
      </div>
    </div>
  );
};
