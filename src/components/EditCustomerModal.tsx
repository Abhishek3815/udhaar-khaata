import React, { useState, useEffect } from 'react';
import { X, Edit3, Phone, MapPin, Check, AlertTriangle, Calendar, Clock, IndianRupee, ShieldCheck } from 'lucide-react';
import { Customer } from '../types';
import { playSoundboxVoice } from '../utils/speech';

interface EditCustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  onUpdateCustomer: (id: number, updates: {
    name: string;
    phone?: string;
    address?: string;
    credit_limit?: number;
    credit_period_days?: number;
    due_date?: string;
  }) => Promise<boolean>;
  existingCustomers?: Customer[];
  soundboxEnabled?: boolean;
  lang?: 'hi' | 'en';
}

export const EditCustomerModal: React.FC<EditCustomerModalProps> = ({
  isOpen,
  onClose,
  customer,
  onUpdateCustomer,
  existingCustomers = [],
  soundboxEnabled = true,
  lang = 'hi'
}) => {
  const isEn = lang === 'en';
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [creditPeriodDays, setCreditPeriodDays] = useState<number>(15);
  const [customDays, setCustomDays] = useState<string>('15');
  const [creditLimit, setCreditLimit] = useState<string>('');
  const [dueDate, setDueDate] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (customer && isOpen) {
      setName(customer.name || '');
      setPhone(customer.phone || '');
      setAddress(customer.address || '');
      const days = customer.credit_period_days || 15;
      setCreditPeriodDays(days);
      setCustomDays(String(days));
      setCreditLimit(customer.credit_limit ? String(customer.credit_limit) : '');
      setDueDate(customer.due_date || '');
      setError(null);
      setSavedSuccess(false);
    }
  }, [customer, isOpen]);

  if (!isOpen || !customer) return null;

  // Duplicate name check (excluding current customer)
  const matchedDuplicate = existingCustomers.find(
    c => c.id !== customer.id && c.name.trim().toLowerCase() === name.trim().toLowerCase() && name.trim().length > 1
  );

  const appendAlias = (alias: string) => {
    const clean = name.replace(/\s*\([^)]*\)/g, '').trim();
    setName(`${clean} (${alias})`);
  };

  const handlePeriodChange = (days: number) => {
    setCreditPeriodDays(days);
    setCustomDays(String(days));
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    setDueDate(targetDate.toISOString().split('T')[0]);
  };

  const handleCustomDaysChange = (val: string) => {
    setCustomDays(val);
    const parsed = parseInt(val, 10);
    if (!isNaN(parsed) && parsed > 0) {
      setCreditPeriodDays(parsed);
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + parsed);
      setDueDate(targetDate.toISOString().split('T')[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError(isEn ? 'Customer name cannot be empty' : 'कृपया ग्राहक का नाम लिखें');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const days = parseInt(customDays, 10) || creditPeriodDays || 15;
      let finalDueDate = dueDate;
      if (!finalDueDate) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + days);
        finalDueDate = targetDate.toISOString().split('T')[0];
      }

      const updates: {
        name: string;
        phone?: string;
        address?: string;
        credit_limit?: number;
        credit_period_days?: number;
        due_date?: string;
      } = {
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        credit_period_days: days,
        due_date: finalDueDate,
        credit_limit: creditLimit ? parseFloat(creditLimit) : undefined
      };

      const success = await onUpdateCustomer(customer.id, updates);
      if (success) {
        setSavedSuccess(true);
        if (soundboxEnabled) {
          playSoundboxVoice(`${name.trim()} का विवरण सफलतापूर्वक बदल दिया गया है`, true);
        }
        setTimeout(() => {
          onClose();
        }, 600);
      } else {
        throw new Error('अपडेट विफल रहा');
      }
    } catch (err: any) {
      setError(err.message || (isEn ? 'Failed to update customer' : 'ग्राहक विवरण बदलने में समस्या आई'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150">
      <div className="w-full max-w-lg md:max-w-xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden my-auto border border-slate-100 dark:border-slate-800">
        
        {/* Pinned Header */}
        <div className="shrink-0 px-5 py-4 bg-gradient-to-r from-teal-800 to-emerald-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="p-2 bg-white/10 rounded-xl shrink-0">
              <Edit3 className="w-5 h-5 text-emerald-300" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-base leading-tight truncate">
                {isEn ? 'Edit Customer Details' : 'ग्राहक विवरण बदलें / सुधारें'}
              </h3>
              <p className="text-xs text-emerald-200/90 font-medium truncate">
                {isEn ? `Updating account of ${customer.name}` : `${customer.name} के खाते का विवरण अपडेट करें`}
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
            
            {/* Error Banner */}
            {error && (
              <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Success Banner */}
            {savedSuccess && (
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-xs font-extrabold flex items-center justify-center gap-2 animate-in zoom-in-95">
                <Check className="w-4 h-4 text-emerald-600" />
                <span>{isEn ? 'Details updated successfully!' : 'विवरण सफलतापूर्वक अपडेट हो गया!'}</span>
              </div>
            )}

            {/* Field 1: Customer Name */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  {isEn ? 'Customer Name *' : 'ग्राहक का नाम (Customer Name) *'}
                </label>
                <span className="text-[10px] text-slate-400">
                  {isEn ? 'Full name or alias' : 'पूरा नाम या पहचान'}
                </span>
              </div>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError(null);
                }}
                placeholder={isEn ? 'e.g. Ramesh Kumar' : 'उदा: रमेश (मास्टर जी), सुरेश...'}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                autoFocus
              />

              {/* Duplicate Name Helper */}
              {matchedDuplicate && (
                <div className="mt-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 font-bold">
                    <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                    <span>
                      {isEn ? `Another customer "${name}" exists!` : `"${name}" नाम का दूसरा खाता पहले से मौजूद है!`}
                    </span>
                  </div>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    {isEn ? 'Add an alias tag to prevent confusion:' : 'पहचान के लिए उपनाम जोड़ें:'}
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {['मास्टर जी', 'वार्ड 2', 'टेलर', 'ड्राइवर', 'दुकानदार', 'बड़ा', 'छोटा'].map((tag) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => appendAlias(tag)}
                        className="px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-[11px] font-bold hover:bg-amber-100"
                      >
                        +{tag}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Field 2: Mobile Number */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Phone className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  <span>{isEn ? 'Mobile / WhatsApp Number' : 'मोबाइल नंबर (WhatsApp)'}</span>
                </label>
                <span className="text-[10px] text-slate-400">
                  {isEn ? 'For WhatsApp bills' : 'पर्ची व तगादा भेजने के लिए'}
                </span>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  +91
                </span>
                <input
                  type="tel"
                  maxLength={10}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                  placeholder="9876543210"
                  className="w-full pl-12 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>
            </div>

            {/* Field 3: Address / Location */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>{isEn ? 'Address / Location' : 'दुकान या घर का पता (Address)'}</span>
                </label>
                <span className="text-[10px] text-slate-400">{isEn ? 'Optional' : 'वैकल्पिक'}</span>
              </div>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder={isEn ? 'e.g. Near Shiv Mandir, Ward 4' : 'उदा: शिव मंदिर के पास, मेन मार्केट...'}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            {/* Field 4: Credit Period (तगादा कितने दिन बाद) */}
            <div className="p-3.5 rounded-2xl bg-amber-500/10 dark:bg-slate-800/80 border border-amber-400/30 dark:border-amber-500/20 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>{isEn ? 'Udhaar Due Days' : 'उधार कितने दिन के लिए (तगादा नियम)'}</span>
                </label>
                <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 px-2 py-0.5 rounded-full border border-amber-300/60 dark:border-amber-700/60">
                  {customDays || creditPeriodDays} {isEn ? 'Days' : 'दिन बाद'}
                </span>
              </div>

              {/* Quick Period Buttons */}
              <div className="flex items-center gap-1.5">
                {[
                  { label: isEn ? '7 Days' : '7 दिन', val: 7 },
                  { label: isEn ? '15 Days' : '15 दिन', val: 15 },
                  { label: isEn ? '30 Days' : '30 दिन', val: 30 },
                  { label: isEn ? '45 Days' : '45 दिन', val: 45 }
                ].map((item) => (
                  <button
                    key={item.val}
                    type="button"
                    onClick={() => handlePeriodChange(item.val)}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                      creditPeriodDays === item.val && customDays === String(item.val)
                        ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-xs font-black'
                        : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Custom Days & Due Date preview */}
              <div className="flex items-center justify-between pt-1 gap-2 text-xs">
                <div className="flex items-center gap-1.5 flex-1">
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 shrink-0">
                    {isEn ? 'Custom Days:' : 'अन्य दिन:'}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    value={customDays}
                    onChange={(e) => handleCustomDaysChange(e.target.value)}
                    className="w-16 px-2 py-1 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-lg text-xs font-bold text-center text-amber-950 dark:text-amber-100"
                  />
                </div>

                <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-400 shrink-0">
                  <Calendar className="w-3.5 h-3.5 text-amber-600" />
                  <span>
                    {isEn ? 'Due Date:' : 'वादा तारीख:'}{' '}
                    <strong className="text-amber-900 dark:text-amber-200 font-bold">
                      {dueDate ? new Date(dueDate).toLocaleDateString(isEn ? 'en-IN' : 'hi-IN') : '-'}
                    </strong>
                  </span>
                </div>
              </div>
            </div>

            {/* Field 5: Credit Limit (उधार सीमा - वैकल्पिक) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <IndianRupee className="w-3.5 h-3.5 text-slate-500" />
                  <span>{isEn ? 'Credit Limit (₹) - Optional' : 'अधिकतम उधार सीमा (Credit Limit ₹)'}</span>
                </label>
                <span className="text-[10px] text-slate-400">{isEn ? 'Optional' : 'वैकल्पिक'}</span>
              </div>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                  ₹
                </span>
                <input
                  type="number"
                  step="any"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  placeholder={isEn ? 'e.g. 5000' : 'उदा: 5000 (लिमिट पार होने पर अलर्ट आएगा)'}
                  className="w-full pl-8 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

          </div>

          {/* Pinned Footer Actions */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex gap-2.5 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all disabled:opacity-50"
            >
              {isEn ? 'Cancel' : 'रद्द करें'}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-2 py-2.5 rounded-xl bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-800 hover:to-emerald-800 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>
                {submitting
                  ? (isEn ? 'Saving...' : 'सेव हो रहा है...')
                  : (isEn ? 'Save Changes' : 'बदलाव सेव करें (Save)')}
              </span>
            </button>
          </div>
        </form>

      </div>
    </div>
  );
};
