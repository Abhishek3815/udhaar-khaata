import React, { useState, useRef } from 'react';
import { X, ArrowDownLeft, ArrowUpRight, Check, Camera, Image as ImageIcon, Trash2, Mic, MicOff, ZoomIn, Loader2, MessageCircle, Clock, Calendar } from 'lucide-react';
import { Customer, ShopSettings } from '../types';
import { compressImageFile } from '../utils/imageUtils';
import { createSpeechRecognizer, isSpeechRecognitionSupported, playSoundboxVoice, generateTransactionWhatsAppSlip, formatTransactionDateTime, playMicChime, requestMicrophoneAccess } from '../utils/speech';
import { parseSpokenDukaanVoice } from '../utils/offlineVoiceParser';
import { BillImageModal } from './BillImageModal';
import { useLanguage } from '../context/LanguageContext';

interface AddTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: Customer | null;
  defaultType: 'udhaar' | 'jama';
  settings?: ShopSettings;
  soundboxEnabled?: boolean;
  onAddTransaction: (tx: {
    customer_id: number;
    type: 'udhaar' | 'jama';
    amount: number;
    notes: string;
    date: string;
    bill_image?: string;
  }) => Promise<void>;
}

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  isOpen,
  onClose,
  customer,
  defaultType,
  settings,
  soundboxEnabled = true,
  onAddTransaction
}) => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';
  const [type, setType] = useState<'udhaar' | 'jama'>(defaultType);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [creditPeriodDays, setCreditPeriodDays] = useState<number>(customer?.credit_period_days || 15);
  const [billImage, setBillImage] = useState<string | null>(null);
  const [autoWhatsApp, setAutoWhatsApp] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [viewBillPreview, setViewBillPreview] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognizerRef = useRef<any>(null);

  // Sync defaultType and reset states when opened
  React.useEffect(() => {
    if (isOpen) {
      setType(defaultType);
      setAmount('');
      setNotes('');
      setDate(new Date().toISOString().split('T')[0]);
      setCreditPeriodDays(customer?.credit_period_days || 15);
      setBillImage(null);
      setVoiceNotice(null);
    } else {
      stopVoice();
    }
  }, [defaultType, isOpen, customer]);

  const stopVoice = () => {
    if (recognizerRef.current) {
      try {
        recognizerRef.current.abort();
      } catch {
        // ignore
      }
      recognizerRef.current = null;
    }
    setIsListening(false);
  };

  const handleToggleVoice = async () => {
    if (isListening) {
      stopVoice();
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      setVoiceNotice('इस ब्राउज़र में वॉइस सपोर्ट उपलब्ध नहीं है। Chrome या Edge का उपयोग करें।');
      return;
    }

    setVoiceNotice('सुन रहे हैं... बोलें जैसे: "500 रुपये उधार" या "300 जमा फोनपे"');
    playMicChime('start');

    // Prompt/ensure microphone hardware access
    await requestMicrophoneAccess();

    try {
      const recognizer = createSpeechRecognizer(
        (text, isFinal) => {
          setVoiceNotice(`सुना: "${text}"`);
          if (isFinal) {
            stopVoice();
            processVoiceInput(text);
          }
        },
        (err) => {
          setIsListening(false);
          if (err === 'not-allowed') {
            setVoiceNotice('माइक की अनुमति बंद है। पता बार में 🔒 लॉक आइकॉन से Allow करें।');
          } else if (err === 'no-speech') {
            setVoiceNotice('कोई आवाज़ नहीं सुनी गई। कृपया माइक के पास बोलें।');
          } else if (err === 'network') {
            setVoiceNotice('नेटवर्क समस्या: वॉइस के लिए इंटरनेट जरूरी है। कीबोर्ड से भरें।');
          } else if (err !== 'aborted') {
            setVoiceNotice('आवाज समझ नहीं आई, कृपया दोबारा बोलें');
          }
        },
        () => {
          setIsListening(false);
        },
        'hi-IN'
      );

      if (recognizer) {
        recognizerRef.current = recognizer;
        recognizer.start();
        setIsListening(true);
      }
    } catch (e: any) {
      console.warn('Voice start error:', e);
      setVoiceNotice('माइक शुरू करने में समस्या आई');
      setIsListening(false);
    }
  };

  const processVoiceInput = (text: string) => {
    const parsed = parseSpokenDukaanVoice(text, customer ? [customer] : []);
    const extractedAmount = parsed.amount || 0;
    const detectedType = parsed.type || type;
    const detectedNote = parsed.notes || '';

    if (extractedAmount > 0) {
      setAmount(String(extractedAmount));
    }
    setType(detectedType);
    if (detectedNote) {
      setNotes(detectedNote);
    }
    if (parsed.creditPeriodDays && parsed.creditPeriodDays > 0) {
      setCreditPeriodDays(parsed.creditPeriodDays);
    }

    if (extractedAmount > 0) {
      setVoiceNotice(`✅ सेट: ₹${extractedAmount} (${detectedType === 'udhaar' ? 'उधार' : 'जमा'})`);
      if (soundboxEnabled) {
        playSoundboxVoice(`₹${extractedAmount} ${detectedType === 'udhaar' ? 'उधार' : 'जमा'} सेट हो गया`, true);
      }
    } else {
      setVoiceNotice(`सुना: "${text}"`);
    }
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImageFile(file, 1200, 0.75);
      setBillImage(compressed);
    } catch (err) {
      console.error('Image compression failed:', err);
      alert('फ़ोटो लोड करने में विफल रहा');
    }
  };

  const handleRemoveImage = () => {
    setBillImage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!isOpen || !customer) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;

    setSubmitting(true);
    const txAmount = Number(amount);
    const currentBal = customer.net_balance || 0;
    const newBal = type === 'udhaar' ? currentBal + txAmount : currentBal - txAmount;
    const finalNotes = notes.trim() || (type === 'udhaar' ? 'उधार माल' : 'जमा राशि');

    try {
      // Calculate due date if udhaar
      let calculatedDueDate: string | undefined = undefined;
      if (type === 'udhaar' && creditPeriodDays > 0) {
        const baseDate = new Date(date || new Date().toISOString().split('T')[0]);
        baseDate.setDate(baseDate.getDate() + creditPeriodDays);
        calculatedDueDate = baseDate.toISOString().split('T')[0];

        // Update customer's due_date and default credit_period_days
        try {
          await fetch(`/api/customers/${customer.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              due_date: calculatedDueDate,
              credit_period_days: creditPeriodDays
            })
          });
        } catch (e) {
          console.warn('Failed to update customer due date:', e);
        }
      }

      await onAddTransaction({
        customer_id: customer.id,
        type,
        amount: txAmount,
        notes: finalNotes,
        date,
        bill_image: billImage || undefined
      });

      // Instant WhatsApp Status Slip with Due Date
      if (autoWhatsApp && customer.phone) {
        const waUrl = generateTransactionWhatsAppSlip(
          customer.name,
          type,
          txAmount,
          newBal,
          finalNotes,
          date,
          settings?.shop_name || 'दुकान खाता',
          customer.phone,
          settings?.upi_id,
          type === 'udhaar' ? calculatedDueDate : undefined,
          type === 'udhaar' ? creditPeriodDays : undefined
        );
        window.open(waUrl, '_blank');
      }

      setAmount('');
      setNotes('');
      setBillImage(null);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const isUdhaar = type === 'udhaar';

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
        <div className="w-full max-w-lg lg:max-w-xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden my-auto animate-in zoom-in-95 duration-150 border border-slate-100 dark:border-slate-800">
          {/* Pinned Header */}
          <div
            className={`px-5 py-4 text-white flex items-center justify-between shrink-0 ${
              isUdhaar ? 'bg-gradient-to-r from-rose-700 to-red-800' : 'bg-gradient-to-r from-emerald-700 to-teal-800'
            }`}
          >
            <div className="flex items-center space-x-2.5 min-w-0">
              <div className="p-2 bg-white/10 rounded-xl shrink-0">
                {isUdhaar ? <ArrowUpRight className="w-5 h-5 text-rose-200" /> : <ArrowDownLeft className="w-5 h-5 text-emerald-200" />}
              </div>
              <div className="min-w-0">
                <h3 className="font-extrabold text-base leading-tight truncate">
                  {isUdhaar ? (isEn ? 'Give Udhaar (Debit)' : 'उधार दिया (Debit)') : (isEn ? 'Get Payment (Jama)' : 'जमा लिया (Payment)')}
                </h3>
                <p className="text-xs text-white/90 truncate">{isEn ? 'Customer: ' : 'ग्राहक: '}{customer.name}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/15 text-white/80 hover:text-white transition-colors shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
            {/* Quick Voice Bar */}
            <div className="bg-amber-500/10 dark:bg-slate-800/80 border border-amber-400/30 dark:border-amber-500/20 rounded-2xl p-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleVoice}
                  className={`p-2 rounded-xl flex items-center justify-center transition-all ${
                    isListening
                      ? 'bg-rose-600 text-white animate-pulse shadow-md ring-2 ring-rose-400'
                      : 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs'
                  }`}
                  title={isEn ? 'Fill amount and note using voice' : 'बोलकर राशि और नोट भरें'}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                <div className="text-left">
                  <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                    {isListening ? (isEn ? '🎙️ Listening carefully...' : '🎙️ ध्यान से सुन रहे हैं...') : (isEn ? '🎙️ Voice Input' : '🎙️ बोलकर भरें (Voice Input)')}
                  </span>
                  <span className="text-[11px] text-slate-600 dark:text-slate-400">
                    {voiceNotice || (isEn ? 'e.g. "500 rupees credit" or "300 payment"' : 'जैसे: "500 रुपये उधार" या "300 जमा"')}
                  </span>
                </div>
              </div>
            </div>

            {/* Toggle Type buttons */}
            <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setType('udhaar')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  type === 'udhaar'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {isEn ? 'Give Udhaar (-)' : 'उधार दिया (-)'}
              </button>
              <button
                type="button"
                onClick={() => setType('jama')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                  type === 'jama'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                {isEn ? 'Get Payment (+)' : 'जमा लिया (+)'}
              </button>
            </div>

            {/* Amount Input */}
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                {isEn ? 'Amount (in ₹)*' : 'रुपये (Amount in ₹)*'}
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-lg text-slate-400 dark:text-slate-500">
                  ₹
                </span>
                <input
                  type="number"
                  required
                  min="1"
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="500"
                  className="w-full pl-9 pr-3.5 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-lg font-extrabold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  autoFocus
                />
              </div>
            </div>

            {/* Date and Notes */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">{isEn ? 'Date' : 'तारीख (Date)'}</label>
                  <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-1.5 py-0.2 rounded border border-amber-200 dark:border-amber-800 flex items-center gap-0.5" title="वर्तमान समय">
                    <Clock className="w-2.5 h-2.5" />
                    <span>{new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                  </span>
                </div>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">{isEn ? 'Item / Note' : 'विवरण / नोट'}</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={isUdhaar ? (isEn ? 'Grocery, ration...' : 'राशन, किराना...') : (isEn ? 'Cash, Online...' : 'कैश, ऑनलाइन...')}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            {/* ⏳ Credit Period Selection (उधार कितने दिन के लिए) - Only if Udhaar */}
            {isUdhaar && (
              <div className="bg-amber-500/10 dark:bg-slate-800/80 border border-amber-400/30 dark:border-amber-500/20 rounded-2xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <span>{isEn ? 'Udhaar Period (Days)' : 'यह उधार कितने दिन के लिए दिया?'}</span>
                  </span>
                  <span className="text-[11px] font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 px-2 py-0.5 rounded-full border border-amber-300/60 dark:border-amber-700/60">
                    {creditPeriodDays} {isEn ? 'Days' : 'दिन बाद तगादा'}
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  {[
                    { label: isEn ? '7 Days' : '7 दिन', val: 7 },
                    { label: isEn ? '15 Days' : '15 दिन', val: 15 },
                    { label: isEn ? '30 Days' : '30 दिन', val: 30 }
                  ].map(p => (
                    <button
                      key={p.val}
                      type="button"
                      onClick={() => setCreditPeriodDays(p.val)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                        creditPeriodDays === p.val
                          ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-xs font-black'
                          : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between text-[11px] pt-0.5">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">
                    {isEn ? 'Payment Due Date:' : 'भुगतान वादा तारीख:'}
                  </span>
                  <strong className="text-amber-800 dark:text-amber-300 font-black">
                    {(() => {
                      const d = new Date(date || new Date().toISOString().split('T')[0]);
                      d.setDate(d.getDate() + creditPeriodDays);
                      return d.toLocaleDateString(isEn ? 'en-IN' : 'hi-IN');
                    })()}
                  </strong>
                </div>
              </div>
            )}

            {/* Bill / Receipt Photo Upload Section */}
            <div className="bg-slate-50 dark:bg-slate-800/80 border border-slate-200/90 dark:border-slate-700 rounded-2xl p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>{isEn ? 'Bill / Receipt Photo' : 'बिल / पर्ची का फ़ोटो (Bill Photo)'}</span>
                </span>
                <span className="text-[10px] text-slate-500 dark:text-slate-400">{isEn ? 'Optional' : 'वैकल्पिक (Optional)'}</span>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleImageChange}
                className="hidden"
              />

              {!billImage ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 px-3 border border-dashed border-teal-400/60 dark:border-teal-700/60 hover:border-teal-500 dark:hover:border-teal-600 bg-teal-500/5 dark:bg-slate-900/60 hover:bg-teal-500/10 dark:hover:bg-slate-900 rounded-xl flex items-center justify-center gap-2 text-teal-800 dark:text-teal-200 text-xs font-bold transition-all active:scale-98"
                >
                  <Camera className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  <span>{isEn ? '📷 Take Photo or Upload Bill' : '📷 फ़ोटो खींचें या बिल अपलोड करें'}</span>
                </button>
              ) : (
                <div className="flex items-center justify-between bg-white dark:bg-slate-800 p-2 rounded-xl border border-teal-200 dark:border-slate-700 shadow-xs">
                  <div className="flex items-center space-x-2.5">
                    <img
                      src={billImage}
                      alt="बिल थंबनेल"
                      className="w-12 h-12 object-cover rounded-lg border border-slate-200 dark:border-slate-700 shadow-xs cursor-pointer"
                      onClick={() => setViewBillPreview(true)}
                    />
                    <div>
                      <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                        <Check className="w-3.5 h-3.5" /> {isEn ? 'Bill photo attached' : 'बिल फ़ोटो अटैच है'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setViewBillPreview(true)}
                        className="text-[11px] text-teal-600 dark:text-teal-400 hover:underline font-semibold flex items-center gap-1 mt-0.5"
                      >
                        <ZoomIn className="w-3 h-3" /> {isEn ? 'View Larger' : 'बड़ा करके देखें'}
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                    title={isEn ? 'Remove photo' : 'फ़ोटो हटाएं'}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>

            {/* Instant WhatsApp Slip Toggle */}
            {customer.phone && (
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                    {isEn ? 'Send instant WhatsApp slip upon saving' : 'सेव होते ही ग्राहक को तुरंत WhatsApp पर्ची भेजें'}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={autoWhatsApp}
                  onChange={(e) => setAutoWhatsApp(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 rounded cursor-pointer"
                />
              </div>
            )}
            </div>

            {/* Pinned Actions Footer */}
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
                disabled={submitting || !amount}
                className={`flex-1 py-2.5 rounded-xl text-white text-xs font-extrabold shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-98 ${
                  isUdhaar ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-600/30' : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30'
                }`}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{isEn ? 'Saving...' : 'दर्ज हो रहा है...'}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{isEn ? 'Save to Account' : 'खाते में जोड़ें'}</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Bill Preview Modal */}
      <BillImageModal
        isOpen={viewBillPreview}
        onClose={() => setViewBillPreview(false)}
        imageUrl={billImage}
        title={`बिल पर्ची: ${customer.name}`}
      />
    </>
  );
};
