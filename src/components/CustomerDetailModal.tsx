import React, { useState, useEffect, useRef } from 'react';
import { X, ArrowDownLeft, ArrowUpRight, Plus, Phone, MapPin, Trash2, Mic, MicOff, MessageCircle, Calendar, FileText, Check, Camera, ZoomIn, Loader2, QrCode, Clock, RotateCcw, ShieldAlert, BookOpen, Copy, ExternalLink, Edit3 } from 'lucide-react';
import { Customer, Transaction, ShopSettings } from '../types';
import { formatCurrency, generateWhatsAppReminder, generateTransactionWhatsAppSlip, playSoundboxVoice, createSpeechRecognizer, isSpeechRecognitionSupported, formatTransactionDate, formatTransactionTime, formatTransactionDateTime, playMicChime, requestMicrophoneAccess } from '../utils/speech';
import { compressImageFile } from '../utils/imageUtils';
import { BillImageModal } from './BillImageModal';
import { UpiQrModal } from './UpiQrModal';
import { CustomerStatementModal } from './CustomerStatementModal';
import { SecurityPinModal } from './SecurityPinModal';
import { EditCustomerModal } from './EditCustomerModal';
import { useLanguage } from '../context/LanguageContext';

interface CustomerDetailModalProps {
  customer: Customer | null;
  settings: ShopSettings;
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  soundboxEnabled: boolean;
  onUpdateCustomer?: (id: number, updates: {
    name: string;
    phone?: string;
    address?: string;
    credit_limit?: number;
    credit_period_days?: number;
    due_date?: string;
  }) => Promise<boolean>;
  existingCustomers?: Customer[];
}

export const CustomerDetailModal: React.FC<CustomerDetailModalProps> = ({
  customer,
  settings,
  isOpen,
  onClose,
  onRefresh,
  soundboxEnabled,
  onUpdateCustomer,
  existingCustomers = []
}) => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [txType, setTxType] = useState<'udhaar' | 'jama'>('udhaar');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentTimeStr, setCurrentTimeStr] = useState(() =>
    new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  );
  const [creditPeriodDays, setCreditPeriodDays] = useState<number>(15);
  const [billImage, setBillImage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceNotice, setVoiceNotice] = useState<string | null>(null);
  const [viewingBillUrl, setViewingBillUrl] = useState<string | null>(null);
  const [viewingBillTitle, setViewingBillTitle] = useState('बिल / पर्ची');
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);
  const [isStatementOpen, setIsStatementOpen] = useState(false);
  const [isPassbookModalOpen, setIsPassbookModalOpen] = useState(false);
  const [isEditCustomerOpen, setIsEditCustomerOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [autoWhatsApp, setAutoWhatsApp] = useState(true);

  // 🛡️ Security PIN Modal state
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [targetTxForSecurity, setTargetTxForSecurity] = useState<Transaction | null>(null);
  const [securityActionType, setSecurityActionType] = useState<'delete' | 'restore'>('delete');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognizerRef = useRef<any>(null);

  useEffect(() => {
    if (isOpen && customer) {
      loadCustomerTransactions(customer.id);
      setShowAddForm(false);
      setCreditPeriodDays(customer.credit_period_days || 15);
      setBillImage(null);
      setVoiceNotice(null);
    } else {
      stopVoice();
    }
  }, [isOpen, customer]);

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

  const loadCustomerTransactions = async (customerId: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/transactions?customerId=${customerId}`);
      const data = await res.json();
      if (data.success) {
        setTransactions(data.data);
      }
    } catch (e) {
      console.error('Failed to load transactions:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleVoice = async () => {
    if (isListening) {
      stopVoice();
      return;
    }

    if (!isSpeechRecognitionSupported()) {
      playMicChime('error');
      setVoiceNotice('वॉइस सपोर्ट इस ब्राउज़र में उपलब्ध नहीं है।');
      return;
    }

    playMicChime('start');
    await requestMicrophoneAccess();
    setVoiceNotice('सुन रहे हैं... बोलें जैसे: "500 रुपये उधार"');

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
            setVoiceNotice('माइक की अनुमति (Permission) बंद है। पता बार में 🔒 लॉक आइकॉन से Allow करें।');
          } else if (err === 'network') {
            setVoiceNotice('नेटवर्क समस्या: वॉइस के लिए इंटरनेट आवश्यक है।');
          } else if (err !== 'no-speech' && err !== 'aborted') {
            setVoiceNotice('आवाज समझ नहीं आई');
          }
        },
        () => {
          setIsListening(false);
        },
        isEn ? 'en-IN' : 'hi-IN'
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
    const clean = text.toLowerCase().trim();

    // Amount
    let extractedAmount = 0;
    const numMatch = clean.match(/(\d+(\.\d+)?)/);
    if (numMatch) {
      extractedAmount = parseFloat(numMatch[1]);
    } else if (/डेढ़ सौ/.test(clean)) extractedAmount = 150;
    else if (/ढाई सौ/.test(clean)) extractedAmount = 250;
    else if (/साढ़े तीन सौ/.test(clean)) extractedAmount = 350;
    else if (/हजार|हज़ार/.test(clean)) extractedAmount = 1000;
    else if (/सौ/.test(clean)) extractedAmount = 100;

    if (extractedAmount > 0) {
      setAmount(String(extractedAmount));
    }

    // Type
    const isUdhaar = /उधार|बाकी|लिखो|लिख लो|दिया|udhar/.test(clean);
    const isJama = /जमा|पेमेंट|मिला|आया|paid|jama|phonepe|gpay|paytm|cash|नकद/.test(clean);

    let detectedType = txType;
    if (isJama && !isUdhaar) {
      detectedType = 'jama';
      setTxType('jama');
    } else if (isUdhaar) {
      detectedType = 'udhaar';
      setTxType('udhaar');
    }

    // Notes
    let detectedNote = '';
    if (/phonepe|फोनपे/i.test(clean)) detectedNote = 'PhonePe ऑनलाइन';
    else if (/gpay|गूगल पे/i.test(clean)) detectedNote = 'Google Pay';
    else if (/paytm|पेटीएम/i.test(clean)) detectedNote = 'Paytm';
    else if (/कैश|नकद|cash/i.test(clean)) detectedNote = 'नकद कैश';
    else if (/आटा/i.test(clean)) detectedNote = 'आटा किराना';
    else if (/तेल/i.test(clean)) detectedNote = 'तेल';
    else if (/दाल/i.test(clean)) detectedNote = 'दाल';
    else if (/राशन/i.test(clean)) detectedNote = 'राशन सामान';

    if (detectedNote) {
      setNotes(detectedNote);
    }

    if (extractedAmount > 0) {
      setVoiceNotice(`✅ सेट: ₹${extractedAmount} (${detectedType === 'udhaar' ? 'उधार' : 'जमा'})`);
      if (soundboxEnabled) {
        playSoundboxVoice(`₹${extractedAmount} ${detectedType === 'udhaar' ? 'उधार' : 'जमा'} सेट हो गया`, true);
      }
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

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customer || !amount || Number(amount) <= 0) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: customer.id,
          type: txType,
          amount: Number(amount),
          notes: notes.trim() || (txType === 'udhaar' ? 'उधार माल' : 'जमा राशि'),
          date,
          voice_recorded: Boolean(isListening || voiceNotice),
          bill_image: billImage || undefined
        })
      });

      const data = await res.json();
      if (data.success) {
        const txAmount = Number(amount);
        const currentBal = customer.net_balance || 0;
        const newBal = txType === 'udhaar' ? currentBal + txAmount : currentBal - txAmount;
        const finalNotes = notes.trim() || (txType === 'udhaar' ? 'उधार माल' : 'जमा राशि');

        let calculatedDueDate: string | undefined = undefined;
        if (txType === 'udhaar' && creditPeriodDays > 0) {
          const baseDate = new Date(date || new Date().toISOString().split('T')[0]);
          baseDate.setDate(baseDate.getDate() + creditPeriodDays);
          calculatedDueDate = baseDate.toISOString().split('T')[0];

          try {
            await fetch(`/api/customers/${customer.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                due_date: calculatedDueDate,
                credit_period_days: creditPeriodDays
              })
            });
          } catch (err) {
            console.warn('Failed to update customer due date:', err);
          }
        }

        // Instant WhatsApp Status Slip
        if (autoWhatsApp && customer.phone) {
          const waUrl = generateTransactionWhatsAppSlip(
            customer.name,
            txType,
            txAmount,
            newBal,
            finalNotes,
            date,
            settings.shop_name,
            customer.phone,
            settings.upi_id,
            txType === 'udhaar' ? calculatedDueDate : undefined,
            txType === 'udhaar' ? creditPeriodDays : undefined,
            customer.passbook_token
          );
          window.open(waUrl, '_blank');
        }

        setAmount('');
        setNotes('');
        setBillImage(null);
        setVoiceNotice(null);
        setShowAddForm(false);
        await loadCustomerTransactions(customer.id);
        onRefresh();

        // Soundbox announcement
        const phrase = `${customer.name} के खाते में ${formatCurrency(txAmount)} ${txType === 'udhaar' ? 'उधार' : 'जमा'} दर्ज हो गया है`;
        playSoundboxVoice(phrase, soundboxEnabled);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // 🛡️ Security-Protected Cancel / Delete & Restore Handlers
  const handleInitiateDelete = (tx: Transaction) => {
    setTargetTxForSecurity(tx);
    setSecurityActionType('delete');
    setSecurityModalOpen(true);
  };

  const handleInitiateRestore = (tx: Transaction) => {
    setTargetTxForSecurity(tx);
    setSecurityActionType('restore');
    setSecurityModalOpen(true);
  };

  const handleConfirmSecurityAction = async (pin: string, reason: string): Promise<boolean> => {
    if (!targetTxForSecurity || !customer) return false;

    try {
      if (securityActionType === 'delete') {
        const res = await fetch(`/api/transactions/${targetTxForSecurity.id}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin, reason, deleted_by: 'Owner' })
        });
        const data = await res.json();
        if (data.success) {
          await loadCustomerTransactions(customer.id);
          onRefresh();
          playSoundboxVoice('लेनदेन रिकॉर्ड पर कट लगा दिया गया है और हिसाब से काट दिया गया है', soundboxEnabled);
          return true;
        } else {
          throw new Error(data.error || 'डिलीट करने में विफल');
        }
      } else {
        const res = await fetch(`/api/transactions/${targetTxForSecurity.id}/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pin })
        });
        const data = await res.json();
        if (data.success) {
          await loadCustomerTransactions(customer.id);
          onRefresh();
          playSoundboxVoice('लेनदेन रिकॉर्ड दोबारा खाते में जोड़ दिया गया है', soundboxEnabled);
          return true;
        } else {
          throw new Error(data.error || 'पुनर्स्थापित करने में विफल');
        }
      }
    } catch (err: any) {
      console.error(err);
      throw err;
    }
  };

  if (!isOpen || !customer) return null;

  const netBalance = customer.net_balance ?? 0;
  const isOwed = netBalance > 0;
  const isAdvance = netBalance < 0;

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-slate-900/70 backdrop-blur-xs no-print customer-detail-modal-root overflow-y-auto">
        <div className="w-full max-w-lg md:max-w-2xl lg:max-w-3xl xl:max-w-4xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden my-auto animate-in zoom-in-95 duration-150 border border-slate-100 dark:border-slate-800">
          {/* Header */}
          <div className="shrink-0 p-4 bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-teal-600/60 border border-teal-300/40 flex items-center justify-center font-bold text-lg">
                {customer.name.charAt(0)}
              </div>
              <div>
                <h3 className="font-bold text-base leading-tight">{customer.name}</h3>
                <div className="flex items-center space-x-2 text-xs text-teal-100/90 mt-0.5">
                  {customer.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3 h-3" />
                      {customer.phone}
                    </span>
                  )}
                  {customer.address && (
                    <span className="flex items-center gap-1 text-[11px] truncate max-w-[150px]">
                      <MapPin className="w-3 h-3" />
                      {customer.address}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onUpdateCustomer && (
                <button
                  type="button"
                  onClick={() => setIsEditCustomerOpen(true)}
                  className="px-2.5 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 active:bg-white/30 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-2xs border border-white/20"
                  title={isEn ? 'Edit name, phone, address & credit rules' : 'ग्राहक का नाम, मोबाइल नंबर, पता व उधार नियम बदलें'}
                >
                  <Edit3 className="w-3.5 h-3.5 text-emerald-300" />
                  <span>{isEn ? 'Edit' : 'विवरण बदलें'}</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-full hover:bg-white/10 text-white/80 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Balance & Quick Actions Bar */}
          <div className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200/80 dark:border-slate-700 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {isEn ? 'Current Balance' : 'वर्तमान कुल बाकी (Balance)'}
                </p>
                <div
                  className={`text-2xl font-black mt-0.5 ${
                    isOwed ? 'text-rose-600 dark:text-rose-400' : isAdvance ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {formatCurrency(Math.abs(netBalance))}
                  <span className="text-xs font-normal ml-1">
                    {isOwed
                      ? (isEn ? '(Pending to Receive)' : '(बाकी लेना है)')
                      : isAdvance
                      ? (isEn ? '(Advance Deposit)' : '(जमा है)')
                      : (isEn ? '(Settled)' : '(हिसाब बराबर)')}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap justify-end">
                {/* 📖 Customer Passbook Link Button */}
                <button
                  type="button"
                  onClick={() => {
                    setIsPassbookModalOpen(true);
                    setCopiedLink(false);
                  }}
                  className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs transition-all active:scale-95"
                  title={isEn ? 'Share customer digital passbook link' : 'ग्राहक को उनकी लाइव खाता पासबुक का सुरक्षित लिंक दें'}
                >
                  <BookOpen className="w-3.5 h-3.5 text-indigo-200" />
                  <span>{isEn ? 'Passbook' : '📖 पासबुक'}</span>
                </button>

                {/* Statement PDF Slip Button */}
                <button
                  type="button"
                  onClick={() => setIsStatementOpen(true)}
                  className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold shadow-xs transition-all active:scale-95"
                  title={isEn ? 'View and print account statement' : 'खाता पर्ची / बिल स्टेटमेंट देखें व प्रिंट करें'}
                >
                  <FileText className="w-3.5 h-3.5 text-teal-300" />
                  <span>{isEn ? '📄 Statement' : '📄 पर्ची'}</span>
                </button>

                {/* UPI QR Payment Button */}
                <button
                  type="button"
                  onClick={() => setIsQrModalOpen(true)}
                  className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-bold shadow-xs transition-all active:scale-95"
                  title={isEn ? 'Show UPI QR Code' : 'UPI QR कोड दिखाएं या भेजें'}
                >
                  <QrCode className="w-3.5 h-3.5 text-amber-300" />
                  <span>{isEn ? '📲 QR Code' : '📲 QR'}</span>
                </button>

                {/* ✏️ Edit Customer Details Button */}
                {onUpdateCustomer && (
                  <button
                    type="button"
                    onClick={() => setIsEditCustomerOpen(true)}
                    className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-xs font-bold shadow-xs transition-all active:scale-95"
                    title={isEn ? 'Edit customer name, phone, address & credit rules' : 'ग्राहक का नाम, मोबाइल नंबर, पता व उधार नियम बदलें'}
                  >
                    <Edit3 className="w-3.5 h-3.5 text-amber-300" />
                    <span>{isEn ? 'Edit' : '✏️ बदलें'}</span>
                  </button>
                )}

                {/* WhatsApp Reminder Button */}
                {customer.phone && isOwed && (
                  <a
                    href={generateWhatsAppReminder(
                      customer.name,
                      netBalance,
                      settings.shop_name,
                      customer.phone,
                      settings.upi_id,
                      customer.due_date,
                      customer.due_date ? Math.ceil((new Date().getTime() - new Date(customer.due_date).getTime()) / (1000 * 3600 * 24)) : undefined,
                      customer.passbook_token
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1 px-2.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all active:scale-95"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Remind' : 'तकादा'}</span>
                  </a>
                )}
              </div>
            </div>

            {/* Credit Limit & Due Date Row */}
            <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                {/* Due Date */}
                <div className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  <Calendar className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>{isEn ? 'Due Date:' : 'वादा तारीख:'}</span>
                  <input
                    type="date"
                    value={customer.due_date || ''}
                    onChange={async (e) => {
                      const newDate = e.target.value;
                      await fetch(`/api/customers/${customer.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ due_date: newDate || null })
                      });
                      onRefresh();
                    }}
                    className="bg-transparent font-bold text-slate-800 dark:text-slate-100 text-[11px] focus:outline-none cursor-pointer"
                  />
                </div>

                {/* Credit Period Days */}
                <div className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                  <span>{isEn ? 'Days:' : 'अवधि:'}</span>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    defaultValue={customer.credit_period_days || 15}
                    onBlur={async (e) => {
                      const days = parseInt(e.target.value, 10) || 15;
                      const targetDate = new Date();
                      targetDate.setDate(targetDate.getDate() + days);
                      const newDueDate = targetDate.toISOString().split('T')[0];

                      await fetch(`/api/customers/${customer.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          credit_period_days: days,
                          due_date: newDueDate
                        })
                      });
                      onRefresh();
                    }}
                    className="w-10 bg-transparent font-extrabold text-slate-800 dark:text-slate-100 text-[11px] focus:outline-none border-b border-dashed border-slate-300 dark:border-slate-600 text-center"
                    title={isEn ? 'Click to change udhaar period days' : 'उधार के दिन बदलें'}
                  />
                  <span>{isEn ? 'd' : 'दिन'}</span>
                </div>

                {/* Credit Limit */}
                <div className="flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  <span>{isEn ? 'Limit:' : 'लिमिट:'}</span>
                  <input
                    type="number"
                    step="500"
                    defaultValue={customer.credit_limit || 5000}
                    onBlur={async (e) => {
                      const val = parseFloat(e.target.value) || 5000;
                      await fetch(`/api/customers/${customer.id}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ credit_limit: val })
                      });
                      onRefresh();
                    }}
                    className="w-14 bg-transparent font-extrabold text-slate-800 dark:text-slate-100 text-[11px] focus:outline-none border-b border-dashed border-slate-300 dark:border-slate-600 text-right"
                    title={isEn ? 'Click to change credit limit' : 'क्लिक करके उधारी लिमिट बदलें'}
                  />
                </div>
              </div>

              {/* Limit exceeded warning */}
              {netBalance > (customer.credit_limit || 5000) && (
                <span className="px-2 py-0.5 rounded-lg bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300 dark:border-rose-800 font-black text-[10px] animate-pulse">
                  ⚠️ {isEn ? 'Limit Exceeded!' : 'लिमिट पार!'}
                </span>
              )}
            </div>

            {/* Quick entry toggle buttons */}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                onClick={() => {
                  setTxType('udhaar');
                  setShowAddForm(true);
                }}
                className="py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 dark:hover:bg-rose-950/60 border border-rose-200 dark:border-rose-800/80 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs"
              >
                <ArrowUpRight className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                <span>{isEn ? 'Give Udhaar (-)' : 'उधार दें (-)'}</span>
              </button>
              <button
                onClick={() => {
                  setTxType('jama');
                  setShowAddForm(true);
                }}
                className="py-2.5 px-3 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/80 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-xs"
              >
                <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>{isEn ? 'Get Payment (+)' : 'रुपये जमा (+)'}</span>
              </button>
            </div>
          </div>

          {/* Collapsible Add Form */}
          {showAddForm && (
            <form
              onSubmit={handleAddTransaction}
              className="bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 p-4 space-y-3 animate-in slide-in-from-top-4 duration-150"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1">
                  {txType === 'udhaar' ? (
                    <span className="text-rose-600 font-bold">● {isEn ? 'Record New Udhaar' : 'नया उधार दर्ज करें'}</span>
                  ) : (
                    <span className="text-emerald-700 font-bold">● {isEn ? 'Record Payment/Jama' : 'नया भुगतान/जमा दर्ज करें'}</span>
                  )}
                </span>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Quick Voice Bar */}
              <div className="bg-amber-500/10 dark:bg-slate-800/80 border border-amber-400/30 dark:border-amber-500/20 rounded-xl p-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleToggleVoice}
                    className={`p-1.5 rounded-lg flex items-center justify-center transition-all ${
                      isListening
                        ? 'bg-rose-600 text-white animate-pulse shadow-md ring-2 ring-rose-400'
                        : 'bg-amber-500 hover:bg-amber-600 text-white'
                    }`}
                    title={isEn ? 'Voice input for amount and note' : 'बोलकर राशि और नोट भरें'}
                  >
                    {isListening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                  </button>
                  <div className="text-left">
                    <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 block">
                      {isListening ? (isEn ? '🎙️ Listening...' : '🎙️ सुन रहे हैं...') : (isEn ? '🎙️ Voice Input' : '🎙️ बोलकर भरें')}
                    </span>
                    <span className="text-[10px] text-slate-600 dark:text-slate-400">
                      {voiceNotice || (isEn ? 'e.g. "500 rupees udhaar" or "300 jama"' : 'जैसे: "500 रुपये राशन उधार" या "300 जमा"')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">
                    {isEn ? 'Amount (₹)*' : 'राशि (₹Amount)*'}
                  </label>
                  <input
                    type="number"
                    required
                    min="1"
                    step="any"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="₹ 500"
                    className="w-full mt-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-teal-500"
                    autoFocus
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      {isEn ? 'Date & Time' : 'तारीख व समय'}
                    </label>
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.2 rounded border border-amber-200 dark:border-amber-800 flex items-center gap-0.5">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{currentTimeStr}</span>
                    </span>
                  </div>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                  {isEn ? 'Details / Note (Optional)' : 'विवरण / नोट (Optional)'}
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={txType === 'udhaar' ? (isEn ? 'e.g. 5kg Flour, Oil, Dal' : 'उदा: 5kg आटा, तेल, दाल') : (isEn ? 'e.g. Cash, PhonePe, Google Pay' : 'उदा: कैश, फोनपे, गूगल पे')}
                  className="w-full mt-1 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>

              {/* ⏳ Credit Period Selection (उधार कितने दिन के लिए) - Inline Form */}
              {txType === 'udhaar' && (
                <div className="bg-amber-500/10 dark:bg-slate-800/80 border border-amber-400/30 dark:border-amber-500/20 rounded-xl p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black text-amber-900 dark:text-amber-200 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>{isEn ? 'Udhaar Period (Days)' : 'यह उधार कितने दिन के लिए दिया?'}</span>
                    </span>
                    <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 px-2 py-0.5 rounded-full border border-amber-300/60 dark:border-amber-700/60">
                      {creditPeriodDays} {isEn ? 'Days' : 'दिन बाद तगादा'}
                    </span>
                  </div>

                  <div className="flex items-center gap-1">
                    {[
                      { label: isEn ? '7 Days' : '7 दिन', val: 7 },
                      { label: isEn ? '15 Days' : '15 दिन', val: 15 },
                      { label: isEn ? '30 Days' : '30 दिन', val: 30 }
                    ].map(p => (
                      <button
                        key={p.val}
                        type="button"
                        onClick={() => setCreditPeriodDays(p.val)}
                        className={`flex-1 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                          creditPeriodDays === p.val
                            ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-xs font-black'
                            : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 font-bold'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between text-[10px] pt-0.5">
                    <span className="text-slate-600 dark:text-slate-400 font-medium">
                      {isEn ? 'Due Date:' : 'भुगतान वादा तारीख:'}
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

              {/* Bill Photo Section in Inline Form */}
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-2.5">
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
                    className="w-full py-2 px-3 border border-dashed border-teal-400/60 dark:border-teal-700/60 hover:border-teal-500 bg-teal-500/5 dark:bg-slate-800/60 hover:bg-teal-500/10 dark:hover:bg-slate-800 rounded-lg flex items-center justify-center gap-1.5 text-teal-800 dark:text-teal-200 text-[11px] font-bold transition-all"
                  >
                    <Camera className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                    <span>{isEn ? '📷 Attach Bill / Receipt Photo' : '📷 बिल / पर्ची का फ़ोटो अपलोड करें'}</span>
                  </button>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <img
                        src={billImage}
                        alt="बिल"
                        className="w-10 h-10 object-cover rounded-md border border-slate-200 cursor-pointer"
                        onClick={() => {
                          setViewingBillUrl(billImage);
                          setViewingBillTitle(`बिल पर्ची: ${customer.name}`);
                        }}
                      />
                      <div>
                        <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                          <Check className="w-3 h-3" /> {isEn ? 'Bill photo attached' : 'बिल फ़ोटो तैयार है'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setViewingBillUrl(billImage);
                            setViewingBillTitle(`बिल पर्ची: ${customer.name}`);
                          }}
                          className="text-[10px] text-teal-600 hover:underline font-semibold flex items-center gap-0.5"
                        >
                          <ZoomIn className="w-2.5 h-2.5" /> {isEn ? 'View' : 'देखें'}
                        </button>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setBillImage(null)}
                      className="p-1 text-rose-500 hover:bg-rose-50 rounded"
                      title={isEn ? 'Remove photo' : 'फ़ोटो हटाएं'}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
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
                      {isEn ? 'Send instant WhatsApp slip upon saving' : 'सेव होते ही ग्राहक को तुरंत WhatsApp रसीद भेजें'}
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

              <button
                type="submit"
                disabled={submitting || !amount}
                className={`w-full py-2.5 rounded-xl font-bold text-xs text-white shadow-sm flex items-center justify-center gap-1.5 transition-all ${
                  txType === 'udhaar' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>{isEn ? 'Saving...' : 'सेव हो रहा है...'}</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>{isEn ? 'Save to Account' : 'खाते में जोड़ें'}</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Transactions Ledger List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {isEn ? 'Transaction History' : 'लेन-देन इतिहास'} ({transactions.length})
            </p>

            {loading ? (
              <div className="text-center py-8 text-xs text-slate-500 dark:text-slate-400">{isEn ? 'Loading transactions...' : 'खाता लोड हो रहा है...'}</div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700 p-4">
                <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{isEn ? 'No transactions recorded yet' : 'अभी कोई लेन-देन नहीं है'}</p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">{isEn ? 'Use buttons above to record debit or credit' : 'ऊपर दिए गए बटन से उधार या जमा दर्ज करें'}</p>
              </div>
            ) : (
              transactions.map((tx) => {
                const isUdhaar = tx.type === 'udhaar';
                const isDeleted = Boolean(tx.is_deleted);

                return (
                  <div
                    key={tx.id}
                    className={`p-3 rounded-2xl border transition-all flex items-start justify-between relative overflow-hidden ${
                      isDeleted
                        ? 'bg-slate-100/90 dark:bg-slate-800/80 border-slate-300 dark:border-slate-700 opacity-75'
                        : isUdhaar
                        ? 'bg-rose-50/40 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/60'
                        : 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
                    }`}
                  >
                    {/* Security Red Stamped Banner if Cancelled / Cut */}
                    {isDeleted && (
                      <div className="absolute top-0 right-0 bg-rose-600 text-white text-[9px] font-black px-2 py-0.5 rounded-bl-lg shadow-xs flex items-center gap-1">
                        <span>🚫 {isEn ? 'CANCELLED / CUT' : 'रद्द / काटा गया'}</span>
                      </div>
                    )}

                    <div className="flex items-start space-x-2.5">
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shrink-0 mt-0.5 ${
                          isDeleted
                            ? 'bg-slate-400'
                            : isUdhaar
                            ? 'bg-rose-500'
                            : 'bg-emerald-500'
                        }`}
                      >
                        {isUdhaar ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownLeft className="w-4 h-4" />}
                      </div>

                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`text-xs font-bold ${
                            isDeleted ? 'line-through text-slate-500 dark:text-slate-400 decoration-rose-600 decoration-2' : 'text-slate-900 dark:text-white'
                          }`}>
                            {isUdhaar ? (isEn ? 'Udhaar (Debit)' : 'उधार माल') : (isEn ? 'Jama (Payment)' : 'जमा राशि')}
                          </span>

                          {isDeleted ? (
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 font-extrabold border border-rose-300 dark:border-rose-800 flex items-center gap-0.5">
                              <span>🚫 {isEn ? 'Cut Mark' : 'हिसाब से काटा गया'}</span>
                            </span>
                          ) : tx.voice_recorded ? (
                            <span className="px-1.5 py-0.2 rounded text-[9px] bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 font-bold flex items-center gap-0.5" title={isEn ? 'Recorded by voice' : 'आवाज से दर्ज'}>
                              <Mic className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400" />
                              <span>{isEn ? 'Voice' : 'वॉइस'}</span>
                            </span>
                          ) : null}
                        </div>

                        <p className={`text-[11px] mt-0.5 ${
                          isDeleted ? 'line-through text-slate-400 dark:text-slate-500 decoration-slate-400' : 'text-slate-600 dark:text-slate-300'
                        }`}>
                          {tx.notes}
                        </p>
                        
                        {/* Cancellation Audit details */}
                        {isDeleted && (
                          <div className="mt-1 p-1.5 bg-rose-50/80 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 rounded-lg text-[10px] text-rose-800 dark:text-rose-200 space-y-0.5">
                            <div className="flex items-center gap-1 font-bold">
                              <span>🔒 {isEn ? 'Cancelled by Owner:' : 'मालिक द्वारा रद्द किया गया:'}</span>
                              <span>{formatTransactionDateTime(tx.deleted_at, undefined, isEn ? 'en' : 'hi')}</span>
                            </div>
                            <div className="text-rose-700 dark:text-rose-300 italic">
                              {isEn ? 'Reason:' : 'वजह:'} {tx.deleted_reason || (isEn ? 'Cancelled by shopkeeper' : 'दुकानदार द्वारा रद्द')}
                            </div>
                          </div>
                        )}

                        <div className="flex items-center gap-2.5 mt-1 flex-wrap">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1">
                            <Calendar className="w-3 h-3 text-slate-400" />
                            <span>{formatTransactionDate(tx.date, tx.created_at, isEn ? 'en' : 'hi')}</span>
                          </span>

                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold flex items-center gap-1">
                            <Clock className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                            <span>{formatTransactionTime(tx.created_at, tx.date, isEn ? 'en' : 'hi')}</span>
                          </span>

                          {/* Bill Photo Badge & Click to view */}
                          {tx.bill_image && (
                            <button
                              type="button"
                              onClick={() => {
                                setViewingBillUrl(tx.bill_image || null);
                                setViewingBillTitle(`बिल पर्ची: ${customer.name} (₹${tx.amount})`);
                              }}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-teal-100 dark:bg-teal-950/60 hover:bg-teal-200 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-300 border border-transparent dark:border-teal-800/50 text-[10px] font-bold transition-colors cursor-pointer"
                              title={isEn ? 'View bill photo' : 'बिल का फ़ोटो देखें'}
                            >
                              <Camera className="w-2.5 h-2.5 text-teal-700" />
                              <span>{isEn ? '📷 View Bill' : '📷 बिल फ़ोटो देखें'}</span>
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-2.5">
                      {/* Optional mini thumbnail preview */}
                      {tx.bill_image && (
                        <img
                          src={tx.bill_image}
                          alt="बिल"
                          className="w-9 h-9 object-cover rounded-lg border border-teal-300 shadow-2xs cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => {
                            setViewingBillUrl(tx.bill_image || null);
                            setViewingBillTitle(`बिल पर्ची: ${customer.name} (₹${tx.amount})`);
                          }}
                          title="बड़ा करके देखें"
                        />
                      )}

                      <div className="text-right">
                        <div
                          className={`text-sm font-black ${
                            isDeleted
                              ? 'line-through text-slate-400 decoration-rose-600 decoration-2'
                              : isUdhaar
                              ? 'text-rose-600'
                              : 'text-emerald-700'
                          }`}
                        >
                          {isUdhaar ? '-' : '+'} {formatCurrency(tx.amount)}
                        </div>
                        {isDeleted && (
                          <span className="text-[9px] font-bold text-rose-600 block">
                            {isEn ? '(Excluded)' : '(बैलेंस से बाहर)'}
                          </span>
                        )}
                      </div>

                      {/* Security Action Buttons: Restore vs Cancel */}
                      {isDeleted ? (
                        <button
                          onClick={() => handleInitiateRestore(tx)}
                          className="px-2 py-1 text-teal-800 dark:text-teal-200 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/60 border border-teal-200 dark:border-teal-800 rounded-lg transition-colors flex items-center gap-1 text-[10px] font-bold shrink-0 shadow-2xs"
                          title={isEn ? 'Restore entry using Owner PIN' : 'मालिक पिन से दोबारा चालू करें'}
                        >
                          <RotateCcw className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                          <span className="hidden sm:inline">{isEn ? 'Restore' : 'वापस चालू करें'}</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => handleInitiateDelete(tx)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                          title={isEn ? 'Cancel / Cut Entry (Owner PIN required)' : 'काटें / रद्द करें (मालिक पिन अनिवार्य)'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Bill Viewer Modal */}
      <BillImageModal
        isOpen={Boolean(viewingBillUrl)}
        onClose={() => setViewingBillUrl(null)}
        imageUrl={viewingBillUrl}
        title={viewingBillTitle}
      />

      {/* UPI QR Payment Modal */}
      <UpiQrModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        customer={customer}
        settings={settings}
      />

      {/* Account Statement / PDF Slip Modal */}
      <CustomerStatementModal
        isOpen={isStatementOpen}
        onClose={() => setIsStatementOpen(false)}
        customer={customer}
        transactions={transactions}
        settings={settings}
      />

      {/* 🛡️ Anti-Tamper Security PIN Confirmation Modal */}
      <SecurityPinModal
        isOpen={securityModalOpen}
        onClose={() => {
          setSecurityModalOpen(false);
          setTargetTxForSecurity(null);
        }}
        transaction={targetTxForSecurity}
        customerName={customer.name}
        expectedPin={settings.pin || '1234'}
        actionType={securityActionType}
        onConfirm={handleConfirmSecurityAction}
      />

      {/* 📖 Customer Passbook Modal */}
      {isPassbookModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 md:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
          <div className="w-full max-w-md md:max-w-lg bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden border border-slate-100 dark:border-slate-800 flex flex-col max-h-[92dvh] my-auto">
            <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-800 to-indigo-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-white/10 rounded-xl">
                  <BookOpen className="w-5 h-5 text-indigo-200" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">ग्राहक लाइव पासबुक लिंक</h3>
                  <p className="text-[11px] text-indigo-200">{customer.name} (मो: {customer.phone || 'उपलब्ध नहीं'})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPassbookModalOpen(false)}
                className="p-1.5 rounded-full hover:bg-white/10 text-white/80 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 sm:p-6 space-y-4 flex-1 overflow-y-auto overscroll-contain">
              <div className="bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800 rounded-2xl p-3.5 text-xs text-indigo-950 dark:text-indigo-200 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-indigo-700 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">100% सुरक्षित और गोपनीय लिंक</p>
                  <p className="text-indigo-800 dark:text-indigo-300 text-[11px] mt-0.5 leading-relaxed">
                    यह लिंक क्रिप्टोग्राफिक HMAC टोकन से सुरक्षित है। ग्राहक इस लिंक से <strong>केवल अपना खाता</strong> देख सकते हैं, किसी अन्य ग्राहक का डेटा या दुकान का मुनाफा कभी नहीं दिखेगा।
                  </p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  पासबुक वेब लिंक:
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/?passbook=${customer.passbook_token || ''}`}
                    className="flex-1 bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-mono text-slate-700 dark:text-slate-200 focus:outline-hidden select-all"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/?passbook=${customer.passbook_token || ''}`;
                      navigator.clipboard.writeText(url);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2500);
                    }}
                    className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
                      copiedLink
                        ? 'bg-emerald-600 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedLink ? 'कॉपी हो गया' : 'कॉपी'}</span>
                  </button>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-2">
                {customer.phone && (
                  <a
                    href={`https://wa.me/${customer.phone.replace(/[^0-9]/g, '').length === 10 ? '91' + customer.phone.replace(/[^0-9]/g, '') : customer.phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`नमस्ते ${customer.name} जी! 🙏\n\nआपकी दुकान *${settings.shop_name}* से आपका खाता पासबुक लिंक:\n📖 ${window.location.origin}/?passbook=${customer.passbook_token || ''}\n\nइस लिंक पर क्लिक करके आप अपने सभी उधार व जमा लेनदेन और बाकी बैलेंस देख सकते हैं। धन्यवाद!\n- *${settings.shop_name}*`)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-all active:scale-95"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>WhatsApp पर भेजें</span>
                  </a>
                )}
                <a
                  href={`${window.location.origin}/?passbook=${customer.passbook_token || ''}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold shadow-xs transition-all active:scale-95"
                >
                  <ExternalLink className="w-4 h-4" />
                  <span>पासबुक खोलें</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✏️ Edit Customer Details Modal */}
      {onUpdateCustomer && (
        <EditCustomerModal
          isOpen={isEditCustomerOpen}
          onClose={() => setIsEditCustomerOpen(false)}
          customer={customer}
          onUpdateCustomer={async (id, updates) => {
            const ok = await onUpdateCustomer(id, updates);
            if (ok) {
              onRefresh();
            }
            return ok;
          }}
          existingCustomers={existingCustomers}
          soundboxEnabled={soundboxEnabled}
          lang={lang}
        />
      )}
    </>
  );
};
