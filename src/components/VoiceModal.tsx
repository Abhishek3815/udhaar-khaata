import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff, X, Sparkles, Check, ArrowRight, RefreshCw, ShoppingBag, BookOpen, AlertCircle, Camera, Trash2, ZoomIn, Edit3, ArrowUpRight, ArrowDownLeft, Keyboard, Clock, PlusCircle } from 'lucide-react';
import { VoiceParseResult, Customer, Product } from '../types';
import { createSpeechRecognizer, isSpeechRecognitionSupported, playSoundboxVoice, formatCurrency, playMicChime, requestMicrophoneAccess } from '../utils/speech';
import { parseSpokenDukaanVoice } from '../utils/offlineVoiceParser';
import { compressImageFile } from '../utils/imageUtils';
import { BillImageModal } from './BillImageModal';
import { useLanguage } from '../context/LanguageContext';

interface VoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveTransaction: (tx: { customer_name: string; type: 'udhaar' | 'jama'; amount: number; notes: string; bill_image?: string; credit_period_days?: number }) => Promise<void>;
  onSaveProduct: (prod: { name: string; purchase_price: number; selling_price: number; unit: string; stock_quantity: number }) => Promise<void>;
  soundboxEnabled: boolean;
  onOpenMandiAlert?: (prefill?: any) => void;
  customers?: Customer[];
  products?: Product[];
}

export const VoiceModal: React.FC<VoiceModalProps> = ({
  isOpen,
  onClose,
  onSaveTransaction,
  onSaveProduct,
  soundboxEnabled,
  onOpenMandiAlert,
  customers = [],
  products = []
}) => {
  const { lang: appLang } = useLanguage();
  const isEn = appLang === 'en';
  const [inputMode, setInputMode] = useState<'voice' | 'text'>('voice');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [manualText, setManualText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [parsedData, setParsedData] = useState<VoiceParseResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successSaved, setSuccessSaved] = useState(false);
  const [lang, setLang] = useState<'hi-IN' | 'en-IN'>(() => (appLang === 'en' ? 'en-IN' : 'hi-IN'));

  useEffect(() => {
    setLang(appLang === 'en' ? 'en-IN' : 'hi-IN');
  }, [appLang]);

  const [billImage, setBillImage] = useState<string | null>(null);
  const [viewBillPreview, setViewBillPreview] = useState(false);

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

  // Conversational Confirmation State
  const [isAwaitingConfirmation, setIsAwaitingConfirmation] = useState(false);
  const awaitingRef = useRef(false);
  const handleConfirmSaveRef = useRef<() => Promise<void>>(async () => {});

  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognizerRef = useRef<any>(null);

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

  const handleConfirmationSpeech = async (spokenText: string) => {
    const clean = spokenText.toLowerCase().trim();

    // Check negative / cancel first
    const isNo = /(?:नहीं|ना|no|nah|cancel|रद्द|रद्द करो|मत करो|कैंसिल|stop|abort|don't save|dont save)/i.test(clean);
    if (isNo) {
      stopListening();
      setIsAwaitingConfirmation(false);
      awaitingRef.current = false;
      playMicChime('error');
      const cancelMsg = isEn ? 'Cancelled. You can edit the details below.' : 'रद्द कर दिया गया। आप नीचे सुधार कर सकते हैं।';
      playSoundboxVoice(cancelMsg, soundboxEnabled);
      return;
    }

    // Check affirmative / save
    const isYes = /(?:हाँ|हां|ha+|haan|yes|yep|yeah|yup|kar do|save karo|save|confirm|ok|okay|theek hai|proceed|done|कर दो|सेव करो|सेव कर दो|सेव|कन्फर्म|कन्फर्म करो|कन्फर्म है|ठीक है|सही है)/i.test(clean);
    if (isYes) {
      stopListening();
      setIsAwaitingConfirmation(false);
      awaitingRef.current = false;
      playMicChime('success');
      await handleConfirmSaveRef.current();
      return;
    }

    // If spoken something substantial (>3 chars) that is not simple confirmation, assume shopkeeper wants to re-speak a new entry
    if (clean.length > 3) {
      setIsAwaitingConfirmation(false);
      awaitingRef.current = false;
      handleProcessSpeech(spokenText);
    }
  };

  const startConfirmationListening = async () => {
    if (!isSpeechRecognitionSupported()) return;
    stopListening();
    setIsAwaitingConfirmation(true);
    awaitingRef.current = true;
    playMicChime('start');

    try {
      const recognizer = createSpeechRecognizer(
        (text, isFinal) => {
          setTranscript(text);
          if (isFinal && text.trim().length > 0) {
            handleConfirmationSpeech(text);
          }
        },
        (error) => {
          console.warn('[Speech] Confirmation error:', error);
          setIsListening(false);
        },
        () => {
          setIsListening(false);
        },
        lang
      );

      recognizerRef.current = recognizer;
      if (recognizer) {
        recognizer.start();
        setIsListening(true);
      }
    } catch (e: any) {
      console.warn('Confirmation speech start error:', e);
      setIsListening(false);
    }
  };

  const startListening = async (overrideLang?: 'hi-IN' | 'en-IN') => {
    setErrorMsg(null);
    setSuccessSaved(false);
    setTranscript('');
    setParsedData(null);
    setIsAwaitingConfirmation(false);
    awaitingRef.current = false;

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
            if (awaitingRef.current) {
              handleConfirmationSpeech(text);
            } else if (text.trim().length > 1) {
              handleProcessSpeech(text);
            }
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
    if (!isOpen) {
      stopListening();
      setTranscript('');
      setManualText('');
      setParsedData(null);
      setErrorMsg(null);
      setSuccessSaved(false);
      setBillImage(null);
    }
  }, [isOpen]);

  const handleProcessSpeech = async (textToProcess: string) => {
    if (!textToProcess.trim()) return;
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      let resultData: VoiceParseResult | null = null;

      // 1. Try server AI / PHP endpoint first
      try {
        const res = await fetch('/api/ai/parse-voice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ speechText: textToProcess })
        });
        const data = await res.json();
        if (data.success && data.data && data.data.intent !== 'unknown') {
          resultData = data.data;
        }
      } catch {
        // network or server error - fallback to local parser below
      }

      // 2. Client-side smart parser fallback (100% reliable offline & instant)
      if (!resultData || resultData.intent === 'unknown') {
        const localParsed = parseSpokenDukaanVoice(textToProcess, customers, products);
        if (localParsed) {
          resultData = localParsed;
        }
      }

      if (resultData) {
        setParsedData(resultData);

        // Pre-fill editable states so shopkeeper can easily verify and change anything!
        if (resultData.intent === 'transaction') {
          setEditCustomerName(resultData.customerName || 'नया ग्राहक');
          setEditAmount(resultData.amount ? String(resultData.amount) : '100');
          setEditType(resultData.type || 'udhaar');
          setEditNotes(resultData.notes || (resultData.type === 'udhaar' ? 'उधार माल' : 'जमा राशि'));
          setEditCreditPeriodDays(resultData.creditPeriodDays || resultData.customer?.credit_period_days || 15);
        } else if (resultData.intent === 'product') {
          setEditProductName(resultData.name || resultData.productName || 'नया सामान');
          setEditPurchasePrice(resultData.purchasePrice ? String(resultData.purchasePrice) : '50');
          setEditSellingPrice(resultData.sellingPrice ? String(resultData.sellingPrice) : '60');
          setEditQuantity(resultData.quantity ? String(resultData.quantity) : '10');
          setEditUnit(resultData.unit || 'पैकेट');
        }

        // Soundbox conversational prompt & confirmation listening
        if (resultData.confirmationSpeech) {
          setIsAwaitingConfirmation(true);
          awaitingRef.current = true;
          if (soundboxEnabled) {
            playSoundboxVoice(resultData.confirmationSpeech, true, () => {
              // Once assistant finishes speaking question, start listening for "हाँ" or "Yes"
              startConfirmationListening();
            });
          } else {
            // If soundbox is muted, still activate listening for confirmation after brief pause
            setTimeout(() => {
              startConfirmationListening();
            }, 600);
          }
        } else {
          setIsAwaitingConfirmation(false);
          awaitingRef.current = false;
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
    stopListening();
    setIsAwaitingConfirmation(false);
    awaitingRef.current = false;
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
          customer_name: cName,
          type,
          amount,
          notes,
          bill_image: billImage || undefined,
          credit_period_days: type === 'udhaar' ? editCreditPeriodDays : undefined
        });

        const speakText = isEn
          ? `Recorded ${type === 'udhaar' ? 'credit' : 'payment'} of ${formatCurrency(amount)} for ${cName}.`
          : `${cName} के खाते में ${formatCurrency(amount)} ${type === 'udhaar' ? 'उधार' : 'जमा'} दर्ज हो गया है`;
        playSoundboxVoice(speakText, soundboxEnabled);
      } else if (parsedData.intent === 'product') {
        const name = editProductName.trim() || parsedData.name || (isEn ? 'New Item' : 'नया सामान');
        const purchase_price = parseFloat(editPurchasePrice) || Number(parsedData.purchasePrice) || 0;
        const selling_price = parseFloat(editSellingPrice) || Number(parsedData.sellingPrice) || 0;
        const unit = editUnit.trim() || parsedData.unit || (isEn ? 'Packet' : 'पैकेट');
        const stock_quantity = parseFloat(editQuantity) || Number(parsedData.quantity) || 10;

        if (!name) {
          alert(isEn ? 'Please enter product name' : 'कृपया सामान का नाम दर्ज करें');
          setIsProcessing(false);
          return;
        }

        await onSaveProduct({
          name,
          purchase_price,
          selling_price,
          unit,
          stock_quantity
        });

        const speakText = isEn
          ? `Saved ${name} (${stock_quantity} ${unit}) buying ₹${purchase_price} and selling ₹${selling_price}.`
          : `${name} (${stock_quantity} ${unit}) का खरीद मूल्य ₹${purchase_price} और बिक्री ₹${selling_price} सेव हो गया है`;
        playSoundboxVoice(speakText, soundboxEnabled);
      }

      setSuccessSaved(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(isEn ? 'Failed to save: ' + err.message : 'सेव करने में समस्या आई: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  useEffect(() => {
    handleConfirmSaveRef.current = handleConfirmSave;
  });

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
              <h3 className="font-extrabold text-base leading-tight truncate">
                {isEn ? 'Smart Assistant (Voice & Type)' : 'स्मार्ट असिस्टेंट (बोलकर या लिखकर)'}
              </h3>
              <p className="text-xs text-teal-100 truncate font-medium">
                {isEn ? 'Speak with voice or type entry details' : 'आवाज़ से बोलें या लिखकर विवरण भरें'}
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

        {/* Content */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
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
                className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg active:scale-95 ${
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
                        className="mt-1 px-3.5 py-1 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[11px] shadow-sm flex items-center gap-1 active:scale-95 transition-all"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>{isEn ? 'Done Speaking' : 'बोलना पूरा हुआ (विवरण भरें)'}</span>
                      </button>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                    {isEn ? 'e.g. "Ramesh credit 500 rupees" or "Maggi buy 12 sell 15"' : 'उदा: "रमेश को 500 रुपये उधार दिया" या "फॉर्च्यून तेल खरीद 120 बिक्री 140"'}
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
                placeholder={isEn ? 'e.g. "Ramesh 500 grocery udhaar" or "Suresh 400 paid" or "Maggi buy 12 sell 15"...' : 'उदा: "रमेश को ₹500 का राशन उधार दिया" या "सुरेश ₹400 जमा" या "मैगी 12 खरीद 15 बिक्री"...'}
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
                className="w-full py-2.5 bg-gradient-to-r from-teal-700 to-emerald-700 hover:from-teal-800 hover:to-emerald-800 text-white font-extrabold text-xs rounded-xl shadow-xs active:scale-95 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span>{isEn ? 'Parse Details Automatically' : 'लिखे हुए वाक्य से विवरण भरें (Auto Fill Details)'}</span>
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
                  className="text-left px-2.5 py-2 rounded-xl bg-slate-100 hover:bg-teal-50 dark:bg-slate-800 dark:hover:bg-teal-950/40 border border-slate-200 dark:border-slate-700 hover:border-teal-300 dark:hover:border-teal-800 transition-all text-xs text-slate-700 dark:text-slate-300 group"
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
                    className="px-3 py-1.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all active:scale-95"
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
              <span>{isEn ? 'Analyzing details (AI Smart Extraction)...' : 'विवरण की जांच हो रही है (AI Smart Extraction)...'}</span>
            </div>
          )}

          {/* Success Check */}
          {successSaved && (
            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-center space-y-1 animate-in zoom-in-95">
              <div className="w-10 h-10 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <p className="font-bold text-sm">{isEn ? 'Saved successfully!' : 'सफलतापूर्वक दर्ज हो गया!'}</p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">{isEn ? 'Soundbox voice alert played' : 'साउंडबॉक्स पर आवाज आ रही है'}</p>
            </div>
          )}

          {/* EDITABLE PARSED RESULT CARD */}
          {parsedData && !successSaved && (
            <div className="p-4 rounded-2xl bg-slate-100/90 dark:bg-slate-800/90 border border-slate-300/80 dark:border-slate-700 shadow-md space-y-3.5 animate-in zoom-in-95">
              {/* Header with 1-click Intent Switcher */}
              <div className="space-y-2 border-b border-slate-200 dark:border-slate-700 pb-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5 uppercase tracking-wide">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>{isEn ? 'Automatic Detection:' : 'सिस्टम ने अपने आप समझा:'}</span>
                  </span>
                  <span className="text-[10px] text-teal-800 dark:text-emerald-300 font-bold bg-teal-100 dark:bg-slate-700/90 px-2 py-0.5 rounded-full flex items-center gap-1 border border-teal-200 dark:border-slate-600">
                    <Edit3 className="w-3 h-3" />
                    <span>{isEn ? 'Editable' : 'हाथ से बदल सकते हैं'}</span>
                  </span>
                </div>

                {/* Intent Type Toggle (1-Tap Switch between Customer Khata vs Store Product) */}
                <div className="flex bg-slate-200 dark:bg-slate-900 p-1 rounded-xl text-xs font-black border border-slate-300 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => {
                      setParsedData(prev => prev ? { ...prev, intent: 'transaction' } : null);
                    }}
                    className={`flex-1 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
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
                      setParsedData(prev => prev ? { ...prev, intent: 'product' } : null);
                    }}
                    className={`flex-1 py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                      parsedData.intent === 'product'
                        ? 'bg-teal-600 text-white shadow-xs font-black'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                    }`}
                  >
                    <ShoppingBag className="w-3.5 h-3.5" />
                    <span>{isEn ? 'Store Product (Inventory)' : '📦 दुकान सामान (Product)'}</span>
                  </button>
                </div>
              </div>

              {/* Conversational Voice Confirmation Banner */}
              {isAwaitingConfirmation && (
                <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white shadow-lg space-y-2.5 animate-in slide-in-from-top duration-200">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-white"></span>
                      </span>
                      <span className="font-extrabold text-xs sm:text-sm tracking-wide">
                        {isEn ? '🎙️ Assistant is listening for your confirmation...' : '🎙️ असिस्टेंट आपकी पुष्टि सुन रहा है...'}
                      </span>
                    </div>
                    <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold">
                      {isListening ? (isEn ? 'Live Mic' : 'माइक चालू') : (isEn ? 'Ready' : 'तैयार')}
                    </span>
                  </div>

                  <p className="text-xs text-emerald-100 font-medium leading-relaxed">
                    {isEn
                      ? 'Say "Yes" / "Save" / "Confirm" to save automatically, or "No" / "Cancel" to abort.'
                      : 'सेव करने के लिए बोलें: "हाँ" / "कर दो" / "कन्फर्म", या रद्द करने के लिए बोलें: "नहीं" / "कैंसिल"'}
                  </p>

                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleConfirmationSpeech('हाँ')}
                      className="flex-1 py-2 px-3 rounded-xl bg-white text-emerald-800 hover:bg-emerald-50 font-black text-xs shadow-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>{isEn ? '✓ Yes, Save' : '✓ हाँ, सेव करो'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleConfirmationSpeech('नहीं')}
                      className="py-2 px-3.5 rounded-xl bg-black/25 hover:bg-black/35 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5 text-rose-300" />
                      <span>{isEn ? '✕ Cancel' : '✕ नहीं (रद्द)'}</span>
                    </button>

                    {!isListening && (
                      <button
                        type="button"
                        onClick={() => startConfirmationListening()}
                        className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white cursor-pointer"
                        title={isEn ? 'Open Mic Again' : 'दोबारा माइक चालू करें'}
                      >
                        <Mic className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              )}

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
                      onChange={(e) => setEditCustomerName(e.target.value)}
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
                          onClick={() => setEditType('udhaar')}
                          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-0.5 transition-all ${
                            editType === 'udhaar' ? 'bg-rose-600 text-white shadow-2xs font-black' : 'text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          <ArrowUpRight className="w-3 h-3" />
                          <span>{isEn ? 'Udhaar (-)' : 'उधार (-)'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditType('jama')}
                          className={`flex-1 py-1.5 rounded-lg flex items-center justify-center gap-0.5 transition-all ${
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
                          onChange={(e) => setEditAmount(e.target.value)}
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
                      onChange={(e) => setEditNotes(e.target.value)}
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
                            onClick={() => setEditCreditPeriodDays(p.val)}
                            className={`flex-1 py-1.5 rounded-lg text-[11px] font-bold transition-all border ${
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
                        onClick={() => fileInputRef.current?.click()}
                        className="w-full py-2 px-3 border border-dashed border-teal-400/60 dark:border-teal-700/60 bg-teal-500/5 dark:bg-slate-900/60 hover:bg-teal-500/10 dark:hover:bg-slate-900 text-teal-800 dark:text-teal-300 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all shadow-2xs"
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
                              className="text-[10px] text-teal-600 dark:text-teal-400 hover:underline font-semibold flex items-center gap-0.5"
                            >
                              <ZoomIn className="w-2.5 h-2.5" /> {isEn ? 'View Larger' : 'बड़ा करके देखें'}
                            </button>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setBillImage(null)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg"
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
                  {/* Product Name (Editable) */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                      {isEn ? 'Product Name*' : 'सामान / प्रोडक्ट का नाम*'}
                    </label>
                    <input
                      type="text"
                      value={editProductName}
                      onChange={(e) => setEditProductName(e.target.value)}
                      placeholder={isEn ? 'e.g. Maggi, Sugar, Mustard Oil...' : 'उदा: मैगी, चीनी, फॉर्च्यून तेल...'}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-teal-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    />
                  </div>

                  {/* Quantity & Unit Row */}
                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        {isEn ? 'Stock Quantity*' : 'स्टॉक मात्रा (Quantity)*'}
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={editQuantity}
                        onChange={(e) => setEditQuantity(e.target.value)}
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
                        onChange={(e) => setEditUnit(e.target.value)}
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
                          onChange={(e) => setEditPurchasePrice(e.target.value)}
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
                          onChange={(e) => setEditSellingPrice(e.target.value)}
                          className="w-full pl-6 pr-2.5 py-1.5 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs font-bold text-emerald-900 dark:text-emerald-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Matched product indicator */}
                  {products?.some(p => p.name.toLowerCase().trim() === editProductName.toLowerCase().trim()) && (
                    <div className="p-2 rounded-xl bg-teal-50 dark:bg-teal-950/40 border border-teal-200 dark:border-teal-800 text-[11px] text-teal-800 dark:text-teal-200 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 shrink-0" />
                      <span>यह सामान पहले से आपकी दुकान में दर्ज है। नया स्टॉक जुड़ जाएगा।</span>
                    </div>
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
                    className="w-full py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all"
                  >
                    <span>{isEn ? '📢 Broadcast Mandi Alert to Staff' : '📢 मंडी अलर्ट जारी करें & स्टाफ को भेजें'}</span>
                  </button>
                </div>
              ) : (
                <div className="text-xs text-slate-600">
                  <p>{parsedData.suggestion || (isEn ? 'Please speak again or type details below.' : 'कृपया दोबारा बोलें या लिखकर विवरण भरें।')}</p>
                </div>
              )}

              {parsedData.intent !== 'unknown' && parsedData.intent !== 'mandi_alert' && (
                <button
                  onClick={handleConfirmSave}
                  disabled={isProcessing}
                  className={`w-full mt-2 py-3 px-4 rounded-xl text-white font-extrabold text-sm shadow-md flex items-center justify-center gap-2 active:scale-98 transition-all ${
                    parsedData.intent === 'transaction'
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 shadow-emerald-900/30'
                      : 'bg-gradient-to-r from-teal-600 to-cyan-700 hover:from-teal-700 hover:to-cyan-800 shadow-teal-900/30'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span>
                    {parsedData.intent === 'transaction'
                      ? (isEn ? 'Confirm & Save to Khata' : 'पुष्टि करें व खाते में दर्ज करें')
                      : (isEn ? 'Confirm & Save Product' : 'पुष्टि करें व सामान/स्टॉक सेव करें')}
                  </span>
                </button>
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
