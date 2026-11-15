import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, X, Sparkles, Check, ArrowRight, RefreshCw, ShoppingBag, BookOpen, AlertCircle, Camera, Trash2, ZoomIn, Edit3, ArrowUpRight, ArrowDownLeft, Keyboard, Clock, PlusCircle, Zap, PauseCircle, RotateCcw, Tag, TrendingDown, Info } from 'lucide-react';
import { VoiceParseResult, Customer, Product } from '../types';
import { createSpeechRecognizer, isSpeechRecognitionSupported, playSoundboxVoice, formatCurrency, playMicChime, requestMicrophoneAccess } from '../utils/speech';
import { parseSpokenDukaanVoice } from '../utils/offlineVoiceParser';
import { compressImageFile } from '../utils/imageUtils';
import { BillImageModal } from './BillImageModal';
import { useLanguage } from '../context/LanguageContext';

interface VoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveTransaction: (tx: { customer_id?: number; customer_name: string; type: 'udhaar' | 'jama'; amount: number; notes: string; bill_image?: string; credit_period_days?: number }) => Promise<void>;
  onSaveProduct: (prod: { id?: number; name: string; purchase_price: number; selling_price: number; unit: string; stock_quantity: number; action?: 'add_stock' | 'reduce_stock' | 'update_price' | 'delete' | 'inquiry'; delta_quantity?: number }) => Promise<void>;
  soundboxEnabled: boolean;
  onOpenMandiAlert?: (prefill?: any) => void;
  customers?: Customer[];
  products?: Product[];
  activeTab?: 'ledger' | 'products';
}

export const VoiceModal: React.FC<VoiceModalProps> = ({
  isOpen,
  onClose,
  onSaveTransaction,
  onSaveProduct,
  soundboxEnabled,
  onOpenMandiAlert,
  customers = [],
  products = [],
  activeTab = 'ledger'
}) => {
  const { lang: appLang } = useLanguage();
  const isEn = appLang === 'en';
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [voiceMode, setVoiceMode] = useState<'auto' | 'transaction' | 'product'>('auto');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [manualText, setManualText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedData, setParsedData] = useState<VoiceParseResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successSaved, setSuccessSaved] = useState(false);
  const [lang, setLang] = useState<'hi-IN' | 'en-IN'>(() => (appLang === 'en' ? 'en-IN' : 'hi-IN'));

  // ⚡ Smart Auto-Complete (Saves task in 2s if shopkeeper doesn't touch anything)
  const [autoSaveEnabled, setAutoSaveEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return localStorage.getItem('dukaan_voice_autosave') !== 'false';
  });
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownTimerRef = useRef<any>(null);

  useEffect(() => {
    setLang(appLang === 'en' ? 'en-IN' : 'hi-IN');
  }, [appLang]);

  useEffect(() => {
    if (isOpen) {
      setVoiceMode('auto');
    }
  }, [isOpen]);

  const [billImage, setBillImage] = useState<string | null>(null);
  const [viewBillPreview, setViewBillPreview] = useState(false);
  const [showAdvancedEdit, setShowAdvancedEdit] = useState(false);

  // Editable fields in preview
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editAmount, setEditAmount] = useState('');
  const [editType, setEditType] = useState<'udhaar' | 'jama'>('udhaar');
  const [editNotes, setEditNotes] = useState('');
  const [editCreditPeriodDays, setEditCreditPeriodDays] = useState<number>(15);

  const [editProductName, setEditProductName] = useState('');
  const [editPurchasePrice, setEditPurchasePrice] = useState('');
  const [editSellingPrice, setEditSellingPrice] = useState('');
  const [editUnit, setEditUnit] = useState('पैकेट');
  const [editQuantity, setEditQuantity] = useState('10');
  const [editProductAction, setEditProductAction] = useState<'add_stock' | 'reduce_stock' | 'update_price' | 'delete' | 'inquiry'>('add_stock');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognizerRef = useRef<any>(null);
  const handleConfirmSaveRef = useRef<() => Promise<void>>(async () => {});

  const clearAutoSaveCountdown = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
      countdownTimerRef.current = null;
    }
    setCountdown(null);
  };

  const handleToggleAutoSave = () => {
    setAutoSaveEnabled(prev => {
      const next = !prev;
      localStorage.setItem('dukaan_voice_autosave', String(next));
      if (!next) clearAutoSaveCountdown();
      return next;
    });
  };

  // Suggested Voice / Text Prompts covering both Khata & Products
  const quickPrompts = [
    { label: 'उधार दर्ज', text: 'रमेश को ₹500 का राशन उधार दिया' },
    { label: 'जमा दर्ज', text: 'सुरेश ने ₹300 कैश जमा किया' },
    { label: 'सामान रेट', text: 'मैगी 20 पैकेट खरीद ₹12 और बिक्री ₹15' },
    { label: 'स्टॉक जोड़ें', text: 'फॉर्च्यून तेल 10 लीटर स्टॉक में जोड़ो' },
    { label: 'मंडी भाव', text: 'मंडी में चीनी का भाव ₹44 हो गया है' }
  ];

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const compressed = await compressImageFile(file, 1200, 0.75);
      setBillImage(compressed);
      clearAutoSaveCountdown();
    } catch (err) {
      console.error('Image compression failed:', err);
      alert('फ़ोटो लोड करने में विफल रहा');
    }
  };

  const stopListening = () => {
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

  const startListening = async (overrideLang?: 'hi-IN' | 'en-IN') => {
    clearAutoSaveCountdown();
    setErrorMsg(null);
    setSuccessSaved(false);
    setTranscript('');
    setParsedData(null);

    const activeLang = overrideLang || lang;

    if (!isSpeechRecognitionSupported()) {
      setErrorMsg('इस ब्राउज़र में स्पीच रिकॉग्निशन उपलब्ध नहीं है। आप नीचे लिखकर दर्ज कर सकते हैं।');
      setInputMode('text');
      return;
    }

    stopListening();
    playMicChime('start');

    // Ensure mic hardware permission
    await requestMicrophoneAccess();

    try {
      const recognizer = createSpeechRecognizer(
        (text, isFinal) => {
          setTranscript(text);
          if (isFinal && text.trim().length > 0) {
            handleProcessSpeech(text);
          }
        },
        (error) => {
          console.warn('Speech error:', error);
          setIsListening(false);
          if (error === 'not-allowed') {
            setErrorMsg(isEn
              ? 'Microphone permission blocked. Please allow mic in browser address bar (🔒 lock icon).'
              : 'माइक की अनुमति बंद है। कृपया पता बार में 🔒 लॉक आइकॉन पर क्लिक करके Microphone को "Allow" करें।');
            setInputMode('text');
          } else if (error === 'no-speech') {
            setErrorMsg(isEn
              ? 'No voice heard. Please tap the mic button and speak clearly.'
              : 'कोई आवाज़ नहीं सुनाई दी। कृपया दोबारा माइक दबाकर साफ़ बोलें।');
          } else if (error === 'network') {
            const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
            const isSecure = typeof window !== 'undefined' && window.isSecureContext;
            if (!isSecure && !isLocal) {
              setErrorMsg(isEn
                ? 'Network/Security Error: Chrome requires HTTPS or http://localhost for voice speech. Please open on localhost:3000 or type below.'
                : 'नेटवर्क / सुरक्षा प्रतिबंध: Chrome ब्राउज़र में वॉइस पहचान के लिए localhost या HTTPS होना जरूरी है। कृपया localhost:3000 से खोलें या नीचे "लिखकर भरें" से एंट्री करें।');
            } else if (typeof navigator !== 'undefined' && !navigator.onLine) {
              setErrorMsg(isEn
                ? 'Offline Mode: Voice recognition requires an internet connection for Google Speech service. Please type your entry below.'
                : 'ऑफलाइन मोड: Google स्पीच वॉइस पहचान के लिए इंटरनेट जरूरी है। कृपया नीचे "लिखकर भरें" पर टैप करें।');
            } else {
              setErrorMsg(isEn
                ? 'Network Error: Google Speech service was unreachable. Please check your internet connection or use typing below.'
                : 'नेटवर्क समस्या (Google Speech Error): ब्राउज़र की वॉइस सेवा से संपर्क नहीं हो सका। कृपया इंटरनेट कनेक्शन जांचें या नीचे "लिखकर भरें" से एंट्री करें।');
            }
          } else if (error !== 'aborted') {
            setErrorMsg(isEn
              ? `Mic issue (${error}). You can type your entry below.`
              : `माइक में समस्या आई (${error})। आप नीचे लिखकर दर्ज कर सकते हैं।`);
          }
        },
        () => {
          setIsListening(false);
        },
        activeLang
      );

      recognizerRef.current = recognizer;
      if (recognizer) {
        recognizer.start();
        setIsListening(true);
      }
    } catch (e: any) {
      console.warn('Speech start error:', e);
      setIsListening(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      // ⚡ As requested: Immediately start listening on voice assistant button click!
      setInputMode('voice');
      setShowAdvancedEdit(false);
      setParsedData(null);
      setTranscript('');
      setManualText('');
      setErrorMsg(null);
      setSuccessSaved(false);
      setBillImage(null);

      const timer = setTimeout(() => {
        startListening();
      }, 50);
      return () => clearTimeout(timer);
    } else {
      stopListening();
      clearAutoSaveCountdown();
      setTranscript('');
      setManualText('');
      setParsedData(null);
      setErrorMsg(null);
      setSuccessSaved(false);
      setBillImage(null);
      setShowAdvancedEdit(false);
    }
  }, [isOpen]);

  const handleSpeakAgain = () => {
    clearAutoSaveCountdown();
    setParsedData(null);
    setTranscript('');
    setManualText('');
    setErrorMsg(null);
    setShowAdvancedEdit(false);
    startListening();
  };

  const handleCancel = () => {
    stopListening();
    clearAutoSaveCountdown();
    onClose();
  };

  const handleProcessSpeech = async (textToProcess: string) => {
    const raw = textToProcess.trim();
    if (!raw) return;

    clearAutoSaveCountdown();

    // Check if user is confirming or aborting an open card
    const cleanLower = raw.toLowerCase();
    const isYes = /(?:हाँ|हां|ha+|haan|yes|yep|yeah|yup|kar do|save karo|save|confirm|ok|okay|theek hai|proceed|done|कर दो|सेव करो|सेव कर दो|सेव|कन्फर्म|कन्फर्म करो|कन्फर्म है|ठीक है|सही है)/i.test(cleanLower);
    const isNo = /(?:नहीं|ना|no|nah|cancel|रद्द|रद्द करो|मत करो|कैंसिल|stop|abort|don't save|dont save)/i.test(cleanLower);

    if (parsedData && isYes) {
      stopListening();
      playMicChime('success');
      await handleConfirmSaveRef.current();
      return;
    }
    if (parsedData && isNo) {
      stopListening();
      clearAutoSaveCountdown();
      playMicChime('error');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      // ⚡ 1. INSTANT LOCAL CLIENT PARSER (0ms delay, 100% offline & real-time)
      const pref = voiceMode === 'auto' ? undefined : voiceMode;
      let resultData: VoiceParseResult | null = parseSpokenDukaanVoice(raw, customers, products, pref);

      // 2. If client parser was unsure, try server endpoint as secondary enhancement
      if (!resultData || resultData.intent === 'unknown' || (resultData.intent === 'transaction' && !resultData.amount)) {
        try {
          const res = await fetch('/api/ai/parse-voice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ speechText: raw })
          });
          const data = await res.json();
          if (data.success && data.data && data.data.intent !== 'unknown') {
            resultData = data.data;
          }
        } catch {
          // ignore server network error
        }
      }

      if (resultData && resultData.intent !== 'unknown') {
        setParsedData(resultData);
        playMicChime('success');

        // Pre-fill editable states
        if (resultData.intent === 'transaction') {
          const matchedName = resultData.customerName || 'नया ग्राहक';
          const amt = resultData.amount ? String(resultData.amount) : '';
          setEditCustomerName(matchedName);
          setEditAmount(amt);
          setEditType(resultData.type || 'udhaar');
          setEditNotes(resultData.notes || (resultData.type === 'udhaar' ? 'उधार माल' : 'जमा राशि'));
          setEditCreditPeriodDays(resultData.creditPeriodDays || resultData.customer?.credit_period_days || 15);

          // ⚡ Start 2-second Auto-Save Countdown only if single unambiguous match
          const hasMultipleCustomers = resultData.candidateCustomers && resultData.candidateCustomers.length > 1;
          if (autoSaveEnabled && Number(amt) > 0 && !hasMultipleCustomers) {
            setCountdown(2);
            countdownTimerRef.current = setInterval(() => {
              setCountdown(prev => {
                if (prev === null) return null;
                if (prev <= 1) {
                  clearInterval(countdownTimerRef.current);
                  countdownTimerRef.current = null;
                  handleConfirmSaveRef.current();
                  return null;
                }
                return prev - 1;
              });
            }, 1000);
          }
        } else if (resultData.intent === 'product') {
          const pName = resultData.name || resultData.productName || 'नया सामान';
          const pAction = resultData.productAction || 'add_stock';
          setEditProductAction(pAction);
          setEditProductName(pName);
          setEditPurchasePrice(resultData.purchasePrice ? String(resultData.purchasePrice) : '50');
          setEditSellingPrice(resultData.sellingPrice ? String(resultData.sellingPrice) : '60');
          setEditQuantity(resultData.quantity ? String(resultData.quantity) : (pAction === 'reduce_stock' ? '1' : '10'));
          setEditUnit(resultData.unit || 'पैकेट');

          // 📢 If voice inquiry: instantly speak the exact stock and rate!
          if (pAction === 'inquiry' && resultData.confirmationSpeech) {
            playSoundboxVoice(resultData.confirmationSpeech, soundboxEnabled);
          }

          // ⚡ Start 2-second Auto-Save Countdown only if single unambiguous match AND NOT inquiry/delete
          const hasMultipleProducts = resultData.candidateProducts && resultData.candidateProducts.length > 1;
          if (autoSaveEnabled && pName && pName !== 'नया सामान' && !hasMultipleProducts && pAction !== 'inquiry' && pAction !== 'delete') {
            setCountdown(2);
            countdownTimerRef.current = setInterval(() => {
              setCountdown(prev => {
                if (prev === null) return null;
                if (prev <= 1) {
                  clearInterval(countdownTimerRef.current);
                  countdownTimerRef.current = null;
                  handleConfirmSaveRef.current();
                  return null;
                }
                return prev - 1;
              });
            }, 1000);
          }
        }
      } else {
        setErrorMsg(isEn ? 'Could not understand, please speak again or type below.' : 'बात समझ नहीं आई, कृपया दोबारा बोलें या नीचे लिखकर दर्ज करें');
      }
    } catch (err: any) {
      setErrorMsg(isEn ? 'Failed to process: ' + err.message : 'प्रोसेस करने में विफल: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleConfirmSave = async () => {
    if (!parsedData) return;
    clearAutoSaveCountdown();
    stopListening();
    setIsProcessing(true);

    try {
      if (parsedData.intent === 'transaction') {
        const cName = editCustomerName.trim() || parsedData.customerName || (isEn ? 'New Customer' : 'नया ग्राहक');
        const type = editType;
        const amount = parseFloat(editAmount) || Number(parsedData.amount) || 0;
        const notes = editNotes.trim() || (type === 'udhaar' ? (isEn ? 'Credit goods' : 'उधार माल') : (isEn ? 'Payment received' : 'जमा राशि'));

        if (amount <= 0) {
          alert(isEn ? 'Please enter a valid amount' : 'कृपया मान्य राशि दर्ज करें');
          setIsProcessing(false);
          return;
        }

        await onSaveTransaction({
          customer_id: parsedData.customerId,
          customer_name: cName,
          type,
          amount,
          notes,
          bill_image: billImage || undefined,
          credit_period_days: type === 'udhaar' ? editCreditPeriodDays : undefined
        });

        // 📢 Authentic Paytm-Style Soundbox Announcement Voice
        const speakText = isEn
          ? `Recorded ${type === 'udhaar' ? 'credit' : 'payment'} of ₹${amount} for ${cName}.`
          : (type === 'jama' ? `${cName} से ₹${amount} प्राप्त हुए` : `${cName} के खाते में ₹${amount} उधार दर्ज हुआ`);
        playSoundboxVoice(speakText, soundboxEnabled);
      } else if (parsedData.intent === 'product') {
        const name = editProductName.trim() || parsedData.name || (isEn ? 'New Item' : 'नया सामान');
        const purchase_price = parseFloat(editPurchasePrice) || Number(parsedData.purchasePrice) || 0;
        const selling_price = parseFloat(editSellingPrice) || Number(parsedData.sellingPrice) || 0;
        const unit = editUnit.trim() || parsedData.unit || (isEn ? 'Packet' : 'पैकेट');
        const qty = parseFloat(editQuantity) || Number(parsedData.quantity) || 0;
        const action = editProductAction || parsedData.productAction || 'add_stock';

        if (!name) {
          alert(isEn ? 'Please enter product name' : 'कृपया सामान का नाम दर्ज करें');
          setIsProcessing(false);
          return;
        }

        if (action === 'inquiry') {
          setSuccessSaved(true);
          setTimeout(() => {
            onClose();
          }, 400);
          return;
        }

        const existingStock = parsedData.currentStock ?? (parsedData.product ? Number(parsedData.product.stock_quantity) || 0 : 0);
        let finalStock = existingStock;
        if (action === 'add_stock') {
          finalStock = existingStock + qty;
        } else if (action === 'reduce_stock') {
          finalStock = Math.max(0, existingStock - qty);
        } else {
          finalStock = existingStock;
        }

        await onSaveProduct({
          id: parsedData.productId || parsedData.product?.id,
          name,
          purchase_price,
          selling_price,
          unit,
          stock_quantity: finalStock,
          delta_quantity: qty,
          action
        });

        let speakText = '';
        if (action === 'delete') {
          speakText = isEn
            ? `${name} has been removed from store.`
            : `${name} दुकान से हटा दिया गया है`;
        } else if (action === 'reduce_stock') {
          speakText = isEn
            ? `Deducted ${qty} ${unit} from ${name}. Remaining stock is ${finalStock} ${unit}.`
            : `${name} से ${qty} ${unit} बिक्री दर्ज! अब बचा स्टॉक ${finalStock} ${unit} है`;
        } else if (action === 'update_price') {
          speakText = isEn
            ? `Updated ${name} selling rate to ₹${selling_price}.`
            : `${name} का बिक्री रेट ₹${selling_price} अपडेट हो गया`;
        } else {
          speakText = isEn
            ? `Added ${qty} ${unit} to ${name}. Total stock is ${finalStock} ${unit}.`
            : `${name} में ${qty} ${unit} नया स्टॉक सेव! कुल स्टॉक ${finalStock} ${unit}`;
        }
        playSoundboxVoice(speakText, soundboxEnabled);
      }

      setSuccessSaved(true);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMsg(isEn ? 'Failed to save: ' + err.message : 'सेव करने में समस्या आई: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    handleConfirmSaveRef.current = handleConfirmSave;
  });

  const handleSwitchParsedIntent = (targetIntent: 'transaction' | 'product') => {
    clearAutoSaveCountdown();
    if (targetIntent === 'product') {
      const amt = parseFloat(editAmount) || 0;
      const initialQty = amt > 0 && amt <= 20 ? amt : 10;
      const initialSell = amt > 20 ? amt : (parseFloat(editSellingPrice) || 60);
      const initialBuy = Math.round(initialSell * 0.85);
      const pName = editCustomerName || (isEn ? 'New Product' : 'नया सामान');

      setParsedData(prev => prev ? {
        ...prev,
        intent: 'product',
        productAction: 'add_stock',
        name: pName,
        productName: pName,
        quantity: initialQty,
        unit: editUnit || 'पैकेट',
        sellingPrice: initialSell,
        purchasePrice: initialBuy
      } : null);
      setEditProductName(pName);
      setEditQuantity(String(initialQty));
      setEditSellingPrice(String(initialSell));
      setEditPurchasePrice(String(initialBuy));
      setEditProductAction('add_stock');
    } else {
      const cName = editProductName || (isEn ? 'New Customer' : 'नया ग्राहक');
      const amt = parseFloat(editSellingPrice) || parseFloat(editPurchasePrice) || parseFloat(editQuantity) || 0;

      setParsedData(prev => prev ? {
        ...prev,
        intent: 'transaction',
        type: 'udhaar',
        customerName: cName,
        amount: amt
      } : null);
      setEditCustomerName(cName);
      setEditAmount(amt ? String(amt) : '');
      setEditType('udhaar');
    }
  };

  const handleSwitchMode = (newMode: 'auto' | 'transaction' | 'product') => {
    clearAutoSaveCountdown();
    setVoiceMode(newMode);
    if (parsedData) {
      if (newMode === 'product' && parsedData.intent !== 'product') {
        handleSwitchParsedIntent('product');
      } else if (newMode === 'transaction' && parsedData.intent !== 'transaction') {
        handleSwitchParsedIntent('transaction');
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 md:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-lg md:max-w-xl lg:max-w-2xl bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden my-auto border border-slate-100 dark:border-slate-800 animate-in zoom-in-95 duration-150">
        {/* Pinned Header */}
        <div className="shrink-0 px-5 py-4 bg-gradient-to-r from-emerald-800 to-teal-800 text-white flex items-center justify-between">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-white/10 text-emerald-300 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base leading-tight truncate">
                  {isEn ? 'Fast Voice Assistant' : 'सुपरफास्ट वॉइस असिस्टेंट'}
                </h3>
                <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-400/20 text-emerald-200 border border-emerald-400/30">
                  FREE Web Speech API
                </span>
              </div>
              <p className="text-xs text-teal-100 truncate font-medium">
                {isEn ? '100% Free Browser Speech Recognition (No API keys needed)' : '100% मुफ़्त ब्राउज़र वेब स्पीच API (किसी पेड API की जरूरत नहीं)'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Auto-Save Toggle Pill */}
            <button
              type="button"
              onClick={handleToggleAutoSave}
              className={`px-2.5 py-1 rounded-xl text-[11px] font-bold flex items-center gap-1 transition-all ${
                autoSaveEnabled
                  ? 'bg-amber-400 text-slate-950 shadow-xs'
                  : 'bg-white/15 text-white/80 hover:bg-white/25'
              }`}
              title={isEn ? 'Toggle 2s Auto-Complete' : '2-सेकंड स्वतः सेव चालू/बंद करें'}
            >
              <Zap className="w-3 h-3" />
              <span>{autoSaveEnabled ? (isEn ? 'Auto-Save ON' : 'स्वतः सेव चालू') : (isEn ? 'Auto-Save OFF' : 'स्वतः सेव बंद')}</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-white/15 text-white/80 hover:text-white transition-colors shrink-0 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {/* Target Mode Selector: Auto vs Customer Ledger vs Product Inventory */}
          {!successSaved && (
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-bold gap-1">
              <button
                type="button"
                onClick={() => handleSwitchMode('auto')}
                className={`flex-1 py-1.5 px-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  voiceMode === 'auto'
                    ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-xs font-black'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>{isEn ? '⚡ Smart Auto' : '⚡ स्मार्ट ऑटो'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchMode('transaction')}
                className={`flex-1 py-1.5 px-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  (parsedData ? parsedData.intent === 'transaction' : voiceMode === 'transaction')
                    ? 'bg-emerald-600 text-white shadow-xs font-black'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>{isEn ? '👤 Customer (Khata)' : '👤 ग्राहक खाता (उधार/जमा)'}</span>
              </button>

              <button
                type="button"
                onClick={() => handleSwitchMode('product')}
                className={`flex-1 py-1.5 px-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  (parsedData ? parsedData.intent === 'product' : voiceMode === 'product')
                    ? 'bg-teal-600 text-white shadow-xs font-black'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>{isEn ? '📦 Store Product' : '📦 दुकान सामान (स्टॉक)'}</span>
              </button>
            </div>
          )}

          {!parsedData && !successSaved && (
            <>
              {/* Top Switcher: 🎙️ बोलकर vs ⌨️ लिखकर */}
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl border border-slate-200 dark:border-slate-700 text-xs font-extrabold">
            <button
              type="button"
              onClick={() => {
                setInputMode('voice');
                startListening();
              }}
              className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                inputMode === 'voice'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>{isEn ? '🎙️ Voice (Speak)' : '🎙️ बोलकर दर्ज करें (Voice)'}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                stopListening();
                clearAutoSaveCountdown();
                setInputMode('text');
              }}
              className={`flex-1 py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all ${
                inputMode === 'text'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <Keyboard className="w-3.5 h-3.5" />
              <span>{isEn ? '⌨️ Type Text' : '⌨️ लिखकर दर्ज करें (Type)'}</span>
            </button>
          </div>

          {/* MODE A: 🎙️ Voice Input Card */}
          {inputMode === 'voice' && (
            <div className="flex flex-col items-center justify-center py-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200/80 dark:border-slate-700">
              {/* Language Switcher */}
              <div className="mb-3 flex items-center bg-slate-200/70 dark:bg-slate-700/80 p-1 rounded-xl text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setLang('hi-IN');
                    if (isListening) startListening('hi-IN');
                  }}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${
                    lang === 'hi-IN' ? 'bg-white dark:bg-slate-600 text-teal-800 dark:text-teal-200 shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  🇮🇳 {isEn ? 'Hindi' : 'हिंदी (Hindi)'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLang('en-IN');
                    if (isListening) startListening('en-IN');
                  }}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${
                    lang === 'en-IN' ? 'bg-white dark:bg-slate-600 text-teal-800 dark:text-teal-200 shadow-xs' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  🅰️ {isEn ? 'English' : 'English / हिंग्लिश'}
                </button>
              </div>

              <button
                onClick={isListening ? stopListening : () => startListening()}
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-95 cursor-pointer ${
                  isListening
                    ? 'bg-rose-500 text-white animate-mic-pulse ring-4 ring-rose-200 dark:ring-rose-900/60 shadow-rose-500/40'
                    : 'bg-gradient-to-br from-teal-600 to-emerald-600 text-white hover:opacity-95 shadow-teal-700/30'
                }`}
              >
                {isListening ? <Mic className="w-9 h-9 animate-pulse" /> : <Mic className="w-9 h-9" />}
              </button>

              <div className="mt-3 flex flex-col items-center gap-1">
                <p className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  {isListening ? (
                    <>
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping" />
                      <span>{isEn ? 'Listening... Speak now!' : 'दुकानदार जी, बोलिए... सुन रहे हैं'}</span>
                    </>
                  ) : (
                    <span>{isEn ? 'Tap mic to speak' : `माइक दबाएं और ${lang === 'hi-IN' ? 'हिंदी' : 'English / हिंग्लिश'} में बोलें`}</span>
                  )}
                </p>

                {/* Animated Voice Waves when mic is live */}
                {isListening && (
                  <div className="flex items-center gap-1 py-1">
                    <span className="w-1 bg-rose-500 rounded-full animate-soundwave-1 inline-block"></span>
                    <span className="w-1 bg-rose-500 rounded-full animate-soundwave-2 inline-block"></span>
                    <span className="w-1 bg-rose-500 rounded-full animate-soundwave-3 inline-block"></span>
                    <span className="w-1 bg-rose-500 rounded-full animate-soundwave-2 inline-block"></span>
                    <span className="w-1 bg-rose-500 rounded-full animate-soundwave-1 inline-block"></span>
                  </div>
                )}
              </div>

              {/* Live Transcript */}
              <div className="mt-2.5 px-4 py-2.5 w-11/12 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 min-h-12 text-center flex flex-col items-center justify-center space-y-1">
                {transcript ? (
                  <>
                    <p className="text-slate-900 dark:text-white font-extrabold text-sm sm:text-base tracking-wide">
                      "{transcript}"
                    </p>
                    {isListening && (
                      <button
                        type="button"
                        onClick={() => {
                          if ((recognizerRef.current as any)?.finalizeNow) {
                            (recognizerRef.current as any).finalizeNow();
                          }
                          stopListening();
                        }}
                        className="mt-1 px-3.5 py-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-sm flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Done Speaking' : 'बोलना पूरा हुआ (तुरंत सेव करें)'}</span>
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                    {isEn ? 'e.g. "Ramesh 500 udhar" or "Suresh 200 jama" or "Maggi 20 packet"' : 'उदा: "रमेश 500 उधार" या "सुरेश 200 जमा" या "मैगी 20 पैकेट"'}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* MODE B: ⌨️ Text Typing Input Card */}
          {inputMode === 'text' && (
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl space-y-2.5 animate-in fade-in duration-150">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                {isEn ? 'Type entry text in your own words:' : 'यहाँ अपनी भाषा में लिखकर दर्ज करें:'}
              </label>
              <textarea
                rows={2}
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (manualText.trim()) {
                      setTranscript(manualText);
                      handleProcessSpeech(manualText);
                    }
                  }
                }}
                placeholder={isEn ? 'e.g. "Ramesh 500 udhar" or "Suresh 200 jama" or "Maggi 20 buy 12 sell 15"...' : 'उदा: "रमेश 500 उधार" या "सुरेश 200 जमा" या "मैगी 20 खरीद 12 बिक्री 15"...'}
                className="w-full p-3 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl text-xs sm:text-sm font-medium focus:outline-none focus:ring-2 focus:ring-teal-500 shadow-2xs"
                autoFocus
              />
              <button
                type="button"
                disabled={!manualText.trim() || isProcessing}
                onClick={() => {
                  setTranscript(manualText);
                  handleProcessSpeech(manualText);
                }}
                className="w-full py-2.5 bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-800 hover:to-emerald-800 text-white font-extrabold text-xs rounded-xl shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>{isEn ? 'Process Entry' : 'तुरंत प्रोसेस करें (Auto Fill Details)'}</span>
              </button>
            </div>
          )}

          {/* Quick Tap Samples */}
          <div>
            <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
              {isEn ? 'Sample Prompts (Tap to test):' : 'तुरंत टेस्ट के लिए दबाएं (Sample Prompts):'}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {quickPrompts.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setTranscript(p.text);
                    setManualText(p.text);
                    handleProcessSpeech(p.text);
                  }}
                  className="text-left px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-teal-50 dark:bg-slate-800 dark:hover:bg-teal-950/40 border border-slate-200 dark:border-slate-700 hover:border-teal-300 dark:hover:border-teal-800 transition-all text-xs text-slate-700 dark:text-slate-300 group cursor-pointer"
                >
                  <span className="font-extrabold text-teal-700 dark:text-teal-400 block group-hover:text-teal-800 dark:group-hover:text-teal-300 text-[11px]">
                    {p.label}
                  </span>
                  <span className="text-[10px] text-slate-600 dark:text-slate-400 line-clamp-1">"{p.text}"</span>
                </button>
              ))}
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs space-y-2">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                <span className="font-medium leading-relaxed">{errorMsg}</span>
              </div>
              {inputMode === 'voice' && (
                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setInputMode('text');
                      setErrorMsg(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95 cursor-pointer"
                  >
                    <Keyboard className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Switch to Typing' : '⌨️ लिखकर भरें (Type Instead)'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Processing Indicator */}
          {isProcessing && (
            <div className="py-4 flex flex-col items-center justify-center text-teal-700 dark:text-teal-400 text-xs space-y-1">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>{isEn ? 'Saving entry...' : 'विवरण सेव हो रहा है...'}</span>
            </div>
          )}
          </>
          )}

          {/* Success Check */}
          {successSaved && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-center space-y-1 animate-in zoom-in-95">
              <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-md">
                <Check className="w-6 h-6" />
              </div>
              <p className="font-black text-sm">{isEn ? 'Task Completed Successfully!' : 'काम पूरा हुआ! खाता दर्ज हो गया'}</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">{isEn ? 'Paytm-style Soundbox Announcement played 📢' : '📢 साउंडबॉक्स पर घोषणा हो चुकी है'}</p>
            </div>
          )}

          {/* EDITABLE PARSED RESULT CARD */}
          {parsedData && !successSaved && (
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-100/95 dark:bg-slate-800/95 border border-slate-300/80 dark:border-slate-700 shadow-md space-y-3.5 animate-in zoom-in-95">
              {/* ⚡ SMART AUTO INTENT INDICATOR WITH 1-CLICK TOGGLE */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-700 shadow-2xs">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-bold text-slate-500 dark:text-slate-400">
                    {isEn ? '🤖 Smart Auto Detected:' : '🤖 ऑटो पहचान:'}
                  </span>
                  <span className={`font-black px-2.5 py-1 rounded-xl flex items-center gap-1.5 shadow-2xs ${
                    parsedData.intent === 'transaction'
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-700'
                      : 'bg-teal-100 text-teal-800 dark:bg-teal-950/80 dark:text-teal-300 border border-teal-300/60 dark:border-teal-700'
                  }`}>
                    {parsedData.intent === 'transaction' ? (
                      <><BookOpen className="w-3.5 h-3.5" /> {isEn ? 'Customer Ledger (Khata)' : '👤 ग्राहक खाता (उधार/जमा)'}</>
                    ) : (
                      <><ShoppingBag className="w-3.5 h-3.5" /> {isEn ? 'Store Product (Stock)' : '📦 दुकान सामान (स्टॉक/रेट)'}</>
                    )}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleSwitchParsedIntent(parsedData.intent === 'transaction' ? 'product' : 'transaction')}
                  className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-teal-50 to-emerald-50 hover:from-teal-100 hover:to-emerald-100 dark:from-slate-800 dark:to-slate-850 dark:hover:from-slate-700 dark:hover:to-slate-750 text-teal-900 dark:text-teal-200 border border-teal-300/80 dark:border-teal-700 text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-xs active:scale-95"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  <span>
                    {parsedData.intent === 'transaction'
                      ? (isEn ? 'Switch to Store Product ⇄' : 'दुकान सामान में बदलें ⇄')
                      : (isEn ? 'Switch to Customer Khata ⇄' : 'ग्राहक खाता में बदलें ⇄')
                    }
                  </span>
                </button>
              </div>

              {/* 1. Header Banner showing Confirmation Type */}
              <div className={`p-3.5 sm:p-4 rounded-2xl border shadow-xs flex items-center justify-between ${
                parsedData.intent === 'transaction'
                  ? editType === 'jama'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-100'
                    : 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-900 dark:text-rose-100'
                  : 'bg-teal-50 dark:bg-teal-950/40 border-teal-300 dark:border-teal-800 text-teal-900 dark:text-teal-100'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center text-white shadow-md ${
                    parsedData.intent === 'transaction'
                      ? editType === 'jama' ? 'bg-emerald-600' : 'bg-rose-600'
                      : 'bg-teal-600'
                  }`}>
                    {parsedData.intent === 'transaction'
                      ? (editType === 'jama' ? <ArrowDownLeft className="w-6 h-6 sm:w-7 sm:h-7" /> : <ArrowUpRight className="w-6 h-6 sm:w-7 sm:h-7" />)
                      : <ShoppingBag className="w-6 h-6 sm:w-7 sm:h-7" />
                    }
                  </div>
                  <div>
                    <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider opacity-80 block">
                      {isEn ? 'Confirmation Required' : 'कृपया पुष्टि करें (Confirmation)'}
                    </span>
                    <h3 className="text-base sm:text-lg font-black leading-tight">
                      {parsedData.intent === 'transaction'
                        ? (editType === 'jama' ? (isEn ? 'Payment Received (Jama)' : '🟢 जमा राशि पुष्टि') : (isEn ? 'Credit Given (Udhaar)' : '🔴 उधार खाता पुष्टि'))
                        : (isEn ? 'Product Stock Entry' : '📦 दुकान सामान / स्टॉक पुष्टि')
                      }
                    </h3>
                  </div>
                </div>

                {transcript && (
                  <div className="hidden sm:block text-right max-w-48">
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block">{isEn ? 'Heard Voice:' : 'सुना गया:'}</span>
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate block">"{transcript}"</span>
                  </div>
                )}
              </div>

              {/* ⚡ SMART AUTO-COMPLETE COUNTDOWN BANNER */}
              {countdown !== null && (
                <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md space-y-2 animate-in slide-in-from-top duration-150">
                  <div className="flex items-center justify-between font-black text-xs">
                    <span className="flex items-center gap-1.5">
                      <Zap className="w-4 h-4 fill-slate-950 animate-bounce" />
                      <span>{isEn ? `Auto-completing in ${countdown}s...` : `${countdown} सेकंड में स्वतः सेव हो जाएगा...`}</span>
                    </span>
                    <button
                      type="button"
                      onClick={clearAutoSaveCountdown}
                      className="px-2 py-0.5 rounded-lg bg-black/20 hover:bg-black/30 text-slate-950 font-bold text-[10px] cursor-pointer"
                    >
                      {isEn ? 'Pause & Edit' : 'रोकें व सुधारें ✏️'}
                    </button>
                  </div>

                  {/* Visual countdown progress */}
                  <div className="w-full bg-black/20 h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-slate-950 h-full rounded-full transition-all duration-1000 ease-linear"
                      style={{ width: `${(countdown / 4) * 100}%` }}
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => handleConfirmSave()}
                      className="flex-1 py-1.5 px-3 rounded-lg bg-slate-950 hover:bg-slate-900 text-white font-black text-xs shadow-xs flex items-center justify-center gap-1 cursor-pointer active:scale-95 transition-all"
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span>{isEn ? 'Save Right Now ⚡' : 'तुरंत सेव करें ⚡'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 2. High-Impact Highlights Card */}
              <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 shadow-xs space-y-3">
                {parsedData.intent === 'transaction' ? (
                  <>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block">{isEn ? 'Customer Name' : 'ग्राहक का नाम'}</span>
                        <p className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
                          <span>👤</span>
                          <span>{editCustomerName}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block">{isEn ? 'Amount' : 'रुपये / राशि'}</span>
                        <p className={`text-2xl sm:text-3xl font-black tracking-tight ${
                          editType === 'jama' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                        }`}>
                          ₹{editAmount || '0'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
                      <span className="flex items-center gap-1.5">
                        <span className="font-bold">{isEn ? 'Type:' : 'प्रकार:'}</span>
                        <span className={`px-2.5 py-0.5 rounded-full font-black text-[11px] ${
                          editType === 'jama' ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300' : 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-300'
                        }`}>
                          {editType === 'jama' ? (isEn ? 'Payment (+)' : '🟢 जमा (+)') : (isEn ? 'Udhaar (-)' : '🔴 उधार (-)')}
                        </span>
                      </span>
                      {editNotes && (
                        <span className="truncate max-w-xs text-slate-500 dark:text-slate-400 font-medium">
                          📝 {editNotes}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                      <div>
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block">{isEn ? 'Product Name' : 'सामान / प्रोडक्ट'}</span>
                        <p className="text-lg sm:text-xl font-black text-slate-900 dark:text-white flex items-center gap-1.5 mt-0.5">
                          <span>📦</span>
                          <span>{editProductName}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400 block">{isEn ? 'Stock Quantity' : 'स्टॉक मात्रा'}</span>
                        <p className="text-xl sm:text-2xl font-black text-teal-600 dark:text-teal-400">
                          {editQuantity} {editUnit}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <span className="text-slate-500 dark:text-slate-400 font-bold block text-[10px]">{isEn ? 'Purchase Rate' : 'खरीद रेट'}</span>
                        <span className="font-black text-slate-900 dark:text-slate-100 text-sm">₹{editPurchasePrice} / {editUnit}</span>
                      </div>
                      <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                        <span className="text-emerald-700 dark:text-emerald-400 font-bold block text-[10px]">{isEn ? 'Selling Rate' : 'बिक्री रेट'}</span>
                        <span className="font-black text-emerald-800 dark:text-emerald-300 text-sm">₹{editSellingPrice} / {editUnit}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* 👥 Multiple Matching Customers Disambiguation Card (Prominently visible) */}
              {parsedData.candidateCustomers && parsedData.candidateCustomers.length > 1 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700/80 rounded-2xl space-y-2 animate-in zoom-in-95">
                  <div className="flex items-center justify-between text-xs font-black text-amber-950 dark:text-amber-200">
                    <span className="flex items-center gap-1.5">
                      <span className="text-base">👥</span>
                      <span>{isEn ? `Found ${parsedData.candidateCustomers.length} customers with this name. Tap to select:` : `इस नाम के ${parsedData.candidateCustomers.length} ग्राहक मिले (कृपया सही ग्राहक चुनें):`}</span>
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {parsedData.candidateCustomers.map((c) => {
                      const isSelected = parsedData.customerId ? parsedData.customerId === c.id : editCustomerName.trim().toLowerCase() === c.name.trim().toLowerCase();
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => {
                            clearAutoSaveCountdown();
                            setEditCustomerName(c.name);
                            setParsedData(prev => prev ? { ...prev, customerId: c.id, customer: c } : null);
                          }}
                          className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs ring-2 ring-emerald-300'
                              : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-amber-200 dark:border-slate-700 hover:border-emerald-400'
                          }`}
                        >
                          <div className="font-extrabold text-xs flex items-center justify-between">
                            <span>{c.name}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                          </div>
                          <div className={`text-[11px] flex items-center gap-2 mt-0.5 ${isSelected ? 'text-emerald-100' : 'text-slate-500 dark:text-slate-400'}`}>
                            {c.phone && <span>📱 {c.phone}</span>}
                            {c.address && <span>📍 {c.address}</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 3. Detailed Editing Form (Visible when user taps 'बदलें / सुधारें') */}
              {showAdvancedEdit && (
                <div className="p-3.5 rounded-2xl bg-slate-200/60 dark:bg-slate-900/60 border border-slate-300 dark:border-slate-700 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between border-b border-slate-300 dark:border-slate-700 pb-2">
                    <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 flex items-center gap-1 uppercase">
                      <Edit3 className="w-3.5 h-3.5 text-teal-600" />
                      <span>{isEn ? 'Edit Fields:' : 'विवरण सुधारें / बदलें:'}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAdvancedEdit(false)}
                      className="text-[10px] text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-bold"
                    >
                      {isEn ? 'Collapse' : 'समेटें 🔼'}
                    </button>
                  </div>

                  {/* Intent Type Toggle (1-Tap Switch between Customer Khata vs Store Product) */}
                  <div className="flex bg-slate-200 dark:bg-slate-900 p-1 rounded-xl text-xs font-black border border-slate-300 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => {
                        clearAutoSaveCountdown();
                        setParsedData(prev => prev ? { ...prev, intent: 'transaction' } : null);
                      }}
                      className={`flex-1 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        parsedData.intent === 'transaction'
                          ? 'bg-emerald-600 text-white shadow-xs font-black'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Customer Ledger (Udhaar/Jama)' : '👤 ग्राहक खाता (उधार / जमा)'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        clearAutoSaveCountdown();
                        setParsedData(prev => prev ? { ...prev, intent: 'product' } : null);
                      }}
                      className={`flex-1 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        parsedData.intent === 'product'
                          ? 'bg-teal-600 text-white shadow-xs font-black'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Store Product (Inventory)' : '📦 दुकान सामान (Product)'}</span>
                    </button>
                  </div>

              {parsedData.intent === 'transaction' ? (
                <div className="space-y-3">

                  {/* Customer Name (Editable) */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      {isEn ? 'Customer Name*' : 'ग्राहक का नाम (Customer Name)*'}
                    </label>
                    <input
                      type="text"
                      value={editCustomerName}
                      onFocus={clearAutoSaveCountdown}
                      onChange={(e) => {
                        clearAutoSaveCountdown();
                        setEditCustomerName(e.target.value);
                      }}
                      placeholder={isEn ? 'e.g. Ramesh Kumar...' : 'उदा: रमेश कुमार...'}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* Transaction Type & Amount Grid */}
                  <div className="grid grid-cols-2 gap-2.5">
                    {/* Type Toggle */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">{isEn ? 'Type' : 'प्रकार (Type)'}</label>
                      <div className="flex bg-slate-200 dark:bg-slate-900 p-0.5 rounded-xl text-xs font-bold border border-slate-300 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => {
                            clearAutoSaveCountdown();
                            setEditType('udhaar');
                          }}
                          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-0.5 transition-all cursor-pointer ${
                            editType === 'udhaar' ? 'bg-rose-600 text-white shadow-2xs font-black' : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <ArrowUpRight className="w-3 h-3" />
                          <span>{isEn ? 'Udhaar (-)' : 'उधार (-)'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            clearAutoSaveCountdown();
                            setEditType('jama');
                          }}
                          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-0.5 transition-all cursor-pointer ${
                            editType === 'jama' ? 'bg-emerald-600 text-white shadow-2xs font-black' : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <ArrowDownLeft className="w-3 h-3" />
                          <span>{isEn ? 'Payment (+)' : 'जमा (+)'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Amount Input */}
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        {isEn ? 'Amount (₹)*' : 'रुपये (Amount ₹)*'}
                      </label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 font-bold text-xs">
                          ₹
                        </span>
                        <input
                          type="number"
                          step="any"
                          value={editAmount}
                          onFocus={clearAutoSaveCountdown}
                          onChange={(e) => {
                            clearAutoSaveCountdown();
                            setEditAmount(e.target.value);
                          }}
                          placeholder="0"
                          className="w-full pl-6 pr-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-black text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Notes / Item Details (Editable) */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      {isEn ? 'Item / Note' : 'सामान / विवरण / नोट'}
                    </label>
                    <input
                      type="text"
                      value={editNotes}
                      onFocus={clearAutoSaveCountdown}
                      onChange={(e) => {
                        clearAutoSaveCountdown();
                        setEditNotes(e.target.value);
                      }}
                      placeholder={isEn ? 'e.g. 5kg Flour, Oil, Cash...' : 'उदा: 5kg आटा, तेल, नकद...'}
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  {/* ⏳ Credit Period Days (Only if Udhaar) */}
                  {editType === 'udhaar' && (
                    <div className="bg-amber-500/10 dark:bg-slate-900/80 border border-amber-400/40 dark:border-amber-500/30 rounded-xl p-2.5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                          <span>{isEn ? 'Udhaar Period (Days):' : 'उधार कितने दिन के लिए:'}</span>
                        </span>
                        <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/70 px-2 py-0.5 rounded-full border border-amber-300/60 dark:border-amber-700/60">
                          {editCreditPeriodDays} {isEn ? 'Days' : 'दिन बाद तगादा'}
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
                            onClick={() => {
                              clearAutoSaveCountdown();
                              setEditCreditPeriodDays(p.val);
                            }}
                            className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all border cursor-pointer ${
                              editCreditPeriodDays === p.val
                                ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-600 shadow-xs'
                                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Bill Photo Upload Option */}
                  <div className="pt-1 border-t border-slate-200 dark:border-slate-700">
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
                        onClick={() => {
                          clearAutoSaveCountdown();
                          fileInputRef.current?.click();
                        }}
                        className="w-full py-2 px-3 border border-dashed border-teal-400/60 dark:border-teal-700/60 bg-teal-500/5 dark:bg-slate-900/60 hover:bg-teal-500/10 dark:hover:bg-slate-900 text-teal-800 dark:text-teal-300 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all shadow-2xs cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                        <span>{isEn ? '📷 Attach Bill Photo (Optional)' : '📷 बिल / पर्ची का फ़ोटो जोड़ें (वैकल्पिक)'}</span>
                      </button>
                    ) : (
                      <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-2 rounded-xl border border-teal-300 dark:border-slate-700 shadow-xs">
                        <div className="flex items-center space-x-2">
                          <img
                            src={billImage}
                            alt="बिल"
                            className="w-10 h-10 object-cover rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                            onClick={() => setViewBillPreview(true)}
                          />
                          <div>
                            <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                              <Check className="w-3 h-3" /> {isEn ? 'Bill photo attached' : 'बिल फ़ोटो अटैच है'}
                            </span>
                            <button
                              type="button"
                              onClick={() => setViewBillPreview(true)}
                              className="text-[10px] text-teal-600 dark:text-teal-400 hover:underline font-semibold flex items-center gap-0.5 cursor-pointer"
                            >
                              <ZoomIn className="w-2.5 h-2.5" /> {isEn ? 'View Larger' : 'बड़ा करके देखें'}
                            </button>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setBillImage(null)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer"
                          title={isEn ? 'Remove photo' : 'फ़ोटो हटाएं'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : parsedData.intent === 'product' ? (
                <div className="space-y-3">
                  {/* Action Selector Bar */}
                  <div className="p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex items-center gap-1 text-[11px] font-bold overflow-x-auto">
                    <button
                      type="button"
                      onClick={() => {
                        clearAutoSaveCountdown();
                        setEditProductAction('add_stock');
                      }}
                      className={`flex-1 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 whitespace-nowrap transition-all cursor-pointer ${
                        editProductAction === 'add_stock'
                          ? 'bg-teal-600 text-white shadow-xs font-black'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <PlusCircle className="w-3 h-3" />
                      <span>{isEn ? 'Add Stock' : 'स्टॉक जोड़ें (+)'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        clearAutoSaveCountdown();
                        setEditProductAction('reduce_stock');
                      }}
                      className={`flex-1 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 whitespace-nowrap transition-all cursor-pointer ${
                        editProductAction === 'reduce_stock'
                          ? 'bg-amber-600 text-white shadow-xs font-black'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <TrendingDown className="w-3 h-3" />
                      <span>{isEn ? 'Deduct/Sale' : 'बिक्री / घटाएं (-)'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        clearAutoSaveCountdown();
                        setEditProductAction('update_price');
                      }}
                      className={`flex-1 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 whitespace-nowrap transition-all cursor-pointer ${
                        editProductAction === 'update_price'
                          ? 'bg-indigo-600 text-white shadow-xs font-black'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <Tag className="w-3 h-3" />
                      <span>{isEn ? 'Change Rate' : 'रेट बदलें (₹)'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        clearAutoSaveCountdown();
                        setEditProductAction('inquiry');
                      }}
                      className={`flex-1 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 whitespace-nowrap transition-all cursor-pointer ${
                        editProductAction === 'inquiry'
                          ? 'bg-blue-600 text-white shadow-xs font-black'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                    >
                      <Info className="w-3 h-3" />
                      <span>{isEn ? 'Stock Info' : 'स्टॉक जानकारी'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        clearAutoSaveCountdown();
                        setEditProductAction('delete');
                      }}
                      className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 whitespace-nowrap transition-all cursor-pointer ${
                        editProductAction === 'delete'
                          ? 'bg-rose-600 text-white shadow-xs font-black'
                          : 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                      }`}
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{isEn ? 'Delete' : 'हटाएं'}</span>
                    </button>
                  </div>

                  {/* 📦 Multiple Matching Product Variants Disambiguation Card */}
                  {parsedData.candidateProducts && parsedData.candidateProducts.length > 1 && (
                    <div className="p-3 bg-teal-50 dark:bg-teal-950/40 border border-teal-300 dark:border-teal-700/80 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between text-xs font-black text-teal-950 dark:text-teal-200">
                        <span className="flex items-center gap-1.5">
                          <span className="text-base">📦</span>
                          <span>{isEn ? `Found ${parsedData.candidateProducts.length} matching variants. Select one:` : `इस नाम के ${parsedData.candidateProducts.length} सामान/वेरिएंट मिले (सही चुनें):`}</span>
                        </span>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {parsedData.candidateProducts.map((p) => {
                          const isSelected = editProductName.trim().toLowerCase() === p.name.trim().toLowerCase();
                          return (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => {
                                clearAutoSaveCountdown();
                                setEditProductName(p.name);
                                setEditUnit(p.unit || 'पैकेट');
                                if (p.purchase_price) setEditPurchasePrice(String(p.purchase_price));
                                if (p.selling_price) setEditSellingPrice(String(p.selling_price));
                              }}
                              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-teal-700 text-white border-teal-800 shadow-xs'
                                  : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-teal-200 dark:border-slate-700 hover:border-teal-400'
                              }`}
                            >
                              <div className="font-extrabold text-xs flex items-center justify-between">
                                <span>{p.name}</span>
                                {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                              </div>
                              <div className={`text-[11px] flex items-center justify-between mt-0.5 ${isSelected ? 'text-teal-100' : 'text-slate-500 dark:text-slate-400'}`}>
                                <span>₹{p.selling_price} / {p.unit}</span>
                                <span>स्टॉक: {p.stock_quantity || 0}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ACTION SPECIFIC CARD BODIES */}
                  {editProductAction === 'inquiry' ? (
                    /* ℹ️ INQUIRY CARD */
                    <div className="p-3.5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border-2 border-blue-300 dark:border-blue-700/80 rounded-2xl space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="p-1.5 rounded-xl bg-blue-600 text-white">
                            <Info className="w-4 h-4" />
                          </span>
                          <div>
                            <span className="text-[10px] uppercase tracking-wider font-black text-blue-700 dark:text-blue-300">
                              {isEn ? 'Stock & Rate Inquiry' : 'स्टॉक व रेट जानकारी'}
                            </span>
                            <h4 className="text-sm font-black text-slate-900 dark:text-white">
                              {editProductName}
                            </h4>
                          </div>
                        </div>
                        <span className={`px-2.5 py-1 rounded-full text-xs font-black ${
                          (parsedData.currentStock || 0) > 5
                            ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200 border border-emerald-300'
                            : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200 border border-rose-300'
                        }`}>
                          {isEn ? 'Stock: ' : 'स्टॉक: '}{parsedData.currentStock ?? (parsedData.product?.stock_quantity || 0)} {editUnit}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-blue-200 dark:border-slate-800">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold block">
                            {isEn ? 'Selling Price' : 'बिक्री रेट (₹)'}
                          </span>
                          <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                            ₹{editSellingPrice} <span className="text-[10px] font-medium text-slate-500">/ {editUnit}</span>
                          </span>
                        </div>
                        <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-blue-200 dark:border-slate-800">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 font-bold block">
                            {isEn ? 'Purchase Cost' : 'खरीद भाव (₹)'}
                          </span>
                          <span className="text-base font-black text-amber-600 dark:text-amber-400">
                            ₹{editPurchasePrice} <span className="text-[10px] font-medium text-slate-500">/ {editUnit}</span>
                          </span>
                        </div>
                      </div>

                      <div className="text-[11px] text-blue-900 dark:text-blue-200 flex items-center justify-between">
                        <span>📢 साउंडबॉक्स द्वारा आवाज में सुनाया गया है।</span>
                        <button
                          type="button"
                          onClick={() => {
                            clearAutoSaveCountdown();
                            setEditProductAction('add_stock');
                          }}
                          className="font-bold underline text-blue-700 dark:text-blue-300 hover:text-blue-900 cursor-pointer"
                        >
                          बदलें या नया स्टॉक जोड़ें ✏️
                        </button>
                      </div>
                    </div>
                  ) : editProductAction === 'delete' ? (
                    /* 🗑️ DELETE WARNING CARD */
                    <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border-2 border-rose-300 dark:border-rose-700/80 rounded-2xl space-y-3">
                      <div className="flex items-center gap-2.5">
                        <span className="p-2 rounded-xl bg-rose-600 text-white">
                          <Trash2 className="w-5 h-5" />
                        </span>
                        <div>
                          <h4 className="text-xs font-black text-rose-950 dark:text-rose-200">
                            {isEn ? 'Confirm Product Removal' : 'सामान हटाने की पुष्टि करें'}
                          </h4>
                          <p className="text-[11px] text-rose-800 dark:text-rose-300">
                            {isEn ? 'Are you sure you want to delete ' : 'क्या आप '}<strong>{editProductName}</strong>{isEn ? ' from the shop catalog?' : ' को दुकान की इन्वेंट्री से हटाना चाहते हैं?'}
                          </p>
                        </div>
                      </div>

                      <div className="p-2 bg-white dark:bg-slate-900 rounded-xl border border-rose-200 dark:border-slate-800 text-[11px] flex items-center justify-between text-slate-600 dark:text-slate-400">
                        <span>वर्तमान स्टॉक: <strong>{parsedData.currentStock ?? (parsedData.product?.stock_quantity || 0)} {editUnit}</strong></span>
                        <span>बिक्री रेट: <strong>₹{editSellingPrice}</strong></span>
                      </div>
                    </div>
                  ) : (
                    /* 📦 ADD STOCK / REDUCE STOCK / UPDATE PRICE FORM */
                    <>
                      {/* Product Name (Editable) */}
                      <div>
                        <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                          {isEn ? 'Product Name*' : 'सामान / प्रोडक्ट का नाम*'}
                        </label>
                        <input
                          type="text"
                          value={editProductName}
                          onFocus={clearAutoSaveCountdown}
                          onChange={(e) => {
                            clearAutoSaveCountdown();
                            setEditProductName(e.target.value);
                          }}
                          placeholder={isEn ? 'e.g. Maggi, Sugar, Mustard Oil...' : 'उदा: मैगी, चीनी, फॉर्च्यून तेल...'}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-teal-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                        />
                      </div>

                      {/* Stock Calculation Preview Bar */}
                      {editProductAction === 'reduce_stock' && (
                        <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/80 text-xs space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-bold text-amber-900 dark:text-amber-200">
                            <span>वर्तमान स्टॉक: {parsedData.currentStock ?? (parsedData.product?.stock_quantity || 0)} {editUnit}</span>
                            <span>बिका/कम: -{editQuantity || 0} {editUnit}</span>
                          </div>
                          <div className="pt-1 border-t border-amber-200 dark:border-amber-800 flex items-center justify-between text-xs font-black text-amber-950 dark:text-amber-100">
                            <span>नया बचा स्टॉक:</span>
                            <span className="text-sm text-rose-600 dark:text-rose-400">
                              {Math.max(0, (parsedData.currentStock ?? (parsedData.product?.stock_quantity || 0)) - parseFloat(editQuantity || '0'))} {editUnit}
                            </span>
                          </div>
                        </div>
                      )}

                      {editProductAction === 'add_stock' && (parsedData.currentStock !== undefined || parsedData.product) && (
                        <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-300 dark:border-teal-700/80 text-xs space-y-1">
                          <div className="flex items-center justify-between text-[11px] font-bold text-teal-900 dark:text-teal-200">
                            <span>वर्तमान स्टॉक: {parsedData.currentStock ?? (parsedData.product?.stock_quantity || 0)} {editUnit}</span>
                            <span>नया माल: +{editQuantity || 0} {editUnit}</span>
                          </div>
                          <div className="pt-1 border-t border-teal-200 dark:border-teal-800 flex items-center justify-between text-xs font-black text-teal-950 dark:text-teal-100">
                            <span>कुल नया स्टॉक होगा:</span>
                            <span className="text-sm text-emerald-600 dark:text-emerald-400">
                              {(parsedData.currentStock ?? (parsedData.product?.stock_quantity || 0)) + parseFloat(editQuantity || '0')} {editUnit}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Quantity & Unit Row */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            {editProductAction === 'reduce_stock'
                              ? (isEn ? 'Qty to Deduct*' : 'कम करने की मात्रा*')
                              : editProductAction === 'update_price'
                              ? (isEn ? 'Current Stock' : 'वर्तमान स्टॉक')
                              : (isEn ? 'Stock Quantity*' : 'स्टॉक मात्रा (Quantity)*')}
                          </label>
                          <input
                            type="number"
                            step="any"
                            value={editQuantity}
                            onFocus={clearAutoSaveCountdown}
                            onChange={(e) => {
                              clearAutoSaveCountdown();
                              setEditQuantity(e.target.value);
                            }}
                            placeholder="10"
                            className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                          />
                        </div>

                        <div>
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                            {isEn ? 'Unit (इकाई)*' : 'इकाई (Unit)*'}
                          </label>
                          <select
                            value={editUnit}
                            onChange={(e) => {
                              clearAutoSaveCountdown();
                              setEditUnit(e.target.value);
                            }}
                            className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                          >
                            <option value="पैकेट">पैकेट (Packet)</option>
                            <option value="किलो">किलो (Kg)</option>
                            <option value="लीटर">लीटर (Ltr)</option>
                            <option value="पीस">पीस (Piece)</option>
                            <option value="बोरी">बोरी (Bori)</option>
                            <option value="बोतल">बोतल (Bottle)</option>
                            <option value="कार्टन">कार्टन (Carton)</option>
                            <option value="दर्जन">दर्जन (Dozen)</option>
                            <option value="ग्राम">ग्राम (Gram)</option>
                          </select>
                        </div>
                      </div>

                      {/* Purchase vs Selling Price (Editable) */}
                      <div className="grid grid-cols-2 gap-2.5">
                        <div>
                          <label className="text-[11px] font-bold text-amber-800 dark:text-amber-300 block mb-1">
                            {isEn ? 'Buy Price (₹)' : 'खरीद भाव (₹)'}
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-amber-600 dark:text-amber-400 font-bold text-xs">₹</span>
                            <input
                              type="number"
                              step="any"
                              value={editPurchasePrice}
                              onFocus={clearAutoSaveCountdown}
                              onChange={(e) => {
                                clearAutoSaveCountdown();
                                setEditPurchasePrice(e.target.value);
                              }}
                              className="w-full pl-6 pr-2.5 py-1.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl text-xs font-bold text-amber-900 dark:text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 block mb-1">
                            {isEn ? 'Sell Price (₹)*' : 'बिक्री रेट (₹)*'}
                          </label>
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">₹</span>
                            <input
                              type="number"
                              step="any"
                              value={editSellingPrice}
                              onFocus={clearAutoSaveCountdown}
                              onChange={(e) => {
                                clearAutoSaveCountdown();
                                setEditSellingPrice(e.target.value);
                              }}
                              className="w-full pl-6 pr-2.5 py-1.5 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs font-bold text-emerald-900 dark:text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Matched product indicator */}
                      {products?.some(p => p.name.toLowerCase().trim() === editProductName.toLowerCase().trim()) && (
                        <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-[11px] text-teal-800 dark:text-teal-200 flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                          <span>
                            {editProductAction === 'reduce_stock'
                              ? 'सामान मिला — स्टॉक में से मात्रा कम हो जाएगी।'
                              : editProductAction === 'update_price'
                              ? 'सामान मिला — नया बिक्री व खरीद रेट अपडेट हो जाएगा।'
                              : 'यह सामान पहले से आपकी दुकान में दर्ज है। नया स्टॉक जुड़ जाएगा।'}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : parsedData.intent === 'mandi_alert' ? (
                <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 border-2 border-amber-300 dark:border-amber-700/60 rounded-2xl p-3.5 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">🚜</span>
                    <div>
                      <h4 className="text-xs font-black text-amber-950 dark:text-amber-200">{isEn ? 'Mandi Price Alert Detected!' : 'मंडी भाव अलर्ट पहचाना गया!'}</h4>
                      <p className="text-[11px] text-amber-800 dark:text-amber-300">
                        {isEn ? 'Product: ' : 'सामान: '}<strong className="text-slate-900 dark:text-slate-100">{parsedData.productName || parsedData.name}</strong> • 
                        {isEn ? ' New Price: ' : ' नया भाव: '}<strong className="text-rose-600 dark:text-rose-400 font-black">₹{parsedData.newPrice || parsedData.sellingPrice}</strong>/{parsedData.unit || 'किलो'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      if (onOpenMandiAlert) {
                        onOpenMandiAlert({
                          productName: parsedData.productName || parsedData.name,
                          oldPrice: parsedData.oldPrice,
                          newPrice: parsedData.newPrice || parsedData.sellingPrice,
                          wholesalePrice: parsedData.wholesalePrice || parsedData.purchasePrice,
                          unit: parsedData.unit || 'किलो',
                          notes: parsedData.notes || 'मंडी में भाव बदल गया है'
                        });
                      }
                    }}
                    className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
                  >
                    <span>{isEn ? '📢 Broadcast Mandi Alert to Staff' : '📢 मंडी अलर्ट जारी करें & स्टाफ को भेजें'}</span>
                  </button>
                </div>
              ) : (
                <div className="text-xs text-slate-600">
                  <p>{parsedData.suggestion || (isEn ? 'Please speak again or type details below.' : 'कृपया दोबारा बोलें या लिखकर विवरण भरें।')}</p>
                </div>
              )}
              </div>
              )}

              {/* PRIMARY ACTION BUTTONS */}
              {parsedData.intent !== 'unknown' && parsedData.intent !== 'mandi_alert' && (
                <div className="space-y-2.5 pt-1">
                  <button
                    type="button"
                    onClick={handleConfirmSave}
                    disabled={isProcessing}
                    className={`w-full py-3.5 px-5 rounded-2xl text-white font-black text-sm sm:text-base shadow-lg flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer ${
                      parsedData.intent === 'transaction'
                        ? editType === 'jama'
                          ? 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 shadow-emerald-900/30'
                          : 'bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-700 hover:to-red-800 shadow-rose-900/30'
                        : editProductAction === 'delete'
                        ? 'bg-gradient-to-r from-red-600 to-rose-700 hover:from-red-700 hover:to-rose-800 shadow-rose-900/30'
                        : editProductAction === 'reduce_stock'
                        ? 'bg-gradient-to-r from-amber-600 to-orange-700 hover:from-amber-700 hover:to-orange-800 shadow-amber-900/30'
                        : editProductAction === 'inquiry'
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 shadow-blue-900/30'
                        : editProductAction === 'update_price'
                        ? 'bg-gradient-to-r from-teal-600 to-emerald-700 hover:from-teal-700 hover:to-emerald-800 shadow-teal-900/30'
                        : 'bg-gradient-to-r from-teal-600 to-cyan-700 hover:from-teal-700 hover:to-cyan-800 shadow-teal-900/30'
                    }`}
                  >
                    <Check className="w-5 h-5 stroke-[3]" />
                    <span>
                      {parsedData.intent === 'transaction'
                        ? (editType === 'jama' ? (isEn ? 'Confirm & Record Payment ⚡' : 'हाँ, सही है — जमा दर्ज करें ⚡') : (isEn ? 'Confirm & Record Udhaar ⚡' : 'हाँ, सही है — उधार दर्ज करें ⚡'))
                        : editProductAction === 'delete'
                        ? (isEn ? 'Yes, Remove Product 🗑️' : 'हाँ, सामान हटाएं 🗑️')
                        : editProductAction === 'reduce_stock'
                        ? (isEn ? 'Confirm & Deduct Stock 📉' : 'हाँ, सही है — स्टॉक घटाएं 📉')
                        : editProductAction === 'inquiry'
                        ? (isEn ? 'Got it, Thanks 👍' : 'ठीक है, धन्यवाद 👍')
                        : editProductAction === 'update_price'
                        ? (isEn ? 'Confirm & Update Rate 🏷️' : 'हाँ, सही है — नया रेट अपडेट करें 🏷️')
                        : (isEn ? 'Confirm & Save Stock ⚡' : 'हाँ, सही है — स्टॉक जोड़ें ⚡')}
                    </span>
                  </button>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        clearAutoSaveCountdown();
                        setShowAdvancedEdit(prev => !prev);
                      }}
                      className="py-2.5 px-2 rounded-xl bg-slate-200/90 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      <span>{showAdvancedEdit ? (isEn ? 'Hide' : 'छुपाएं') : (isEn ? 'Edit' : 'सुधारें ✏️')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleSpeakAgain}
                      className="py-2.5 px-2 rounded-xl bg-slate-200/90 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>{isEn ? 'Speak Again' : 'दोबारा बोलें 🎙️'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleCancel}
                      className="py-2.5 px-2 rounded-xl bg-rose-100 hover:bg-rose-200 dark:bg-rose-950/60 dark:hover:bg-rose-900 text-rose-700 dark:text-rose-300 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>{isEn ? 'Cancel' : 'रद्द करें'}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bill Preview Modal */}
      <BillImageModal
        isOpen={viewBillPreview}
        onClose={() => setViewBillPreview(false)}
        imageUrl={billImage}
        title="बिल / पर्ची फ़ोटो"
      />
    </div>
  );
};
