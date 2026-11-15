import React, { useState, useEffect, useRef } from 'react';
import { X, Mic, MicOff, Send, Share2, AlertTriangle, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight, Store, Users, Check, Sparkles, RefreshCw, MessageSquare, Volume2, ShieldAlert, Phone } from 'lucide-react';
import { Product, ShopSettings, MandiAlert } from '../types';
import { createSpeechRecognizer, isSpeechRecognitionSupported, playSoundboxVoice, formatCurrency, playMicChime, requestMicrophoneAccess } from '../utils/speech';
import { useLanguage } from '../context/LanguageContext';

interface MandiAlertModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  settings: ShopSettings;
  soundboxEnabled: boolean;
  onSaveAlert: (alert: {
    product_name: string;
    old_price: number;
    new_price: number;
    wholesale_price?: number;
    unit: string;
    notes?: string;
    sender_name?: string;
    update_product?: boolean;
  }) => Promise<void>;
  prefilledData?: {
    productName?: string;
    oldPrice?: number;
    newPrice?: number;
    wholesalePrice?: number;
    unit?: string;
    notes?: string;
  };
}

export const MandiAlertModal: React.FC<MandiAlertModalProps> = ({
  isOpen,
  onClose,
  products,
  settings,
  soundboxEnabled,
  onSaveAlert,
  prefilledData
}) => {
  const { lang } = useLanguage();
  const isEn = lang === 'en';
  const [inputMode, setInputMode] = useState<'voice' | 'type'>('voice');
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successSaved, setSuccessSaved] = useState(false);

  // Form states
  const [productName, setProductName] = useState('');
  const [oldPrice, setOldPrice] = useState<string>('');
  const [newPrice, setNewPrice] = useState<string>('');
  const [wholesalePrice, setWholesalePrice] = useState<string>('');
  const [unit, setUnit] = useState('किलो');
  const [notes, setNotes] = useState('मंडी में भाव बदल गया है, काउंटर पर तुरंत नया रेट लगाएं!');
  const [updateProductRate, setUpdateProductRate] = useState(true);
  const [selectedStaffPhone, setSelectedStaffPhone] = useState('');
  const [customPhone, setCustomPhone] = useState('');

  const recognizerRef = useRef<any>(null);

  // Parse staff phones from settings
  const staffList = (settings.staff_phones || '')
    .split(/[,;\n]+/)
    .map(p => p.trim())
    .filter(p => p.length >= 10);

  useEffect(() => {
    if (isOpen) {
      if (prefilledData) {
        if (prefilledData.productName) setProductName(prefilledData.productName);
        if (prefilledData.oldPrice) setOldPrice(String(prefilledData.oldPrice));
        if (prefilledData.newPrice) setNewPrice(String(prefilledData.newPrice));
        if (prefilledData.wholesalePrice) setWholesalePrice(String(prefilledData.wholesalePrice));
        if (prefilledData.unit) setUnit(prefilledData.unit);
        if (prefilledData.notes) setNotes(prefilledData.notes);
      } else {
        setProductName('');
        setOldPrice('');
        setNewPrice('');
        setWholesalePrice('');
        setUnit('किलो');
        setNotes('मंडी में भाव बदल गया है, काउंटर पर तुरंत नया रेट लगाएं!');
      }

      if (staffList.length > 0) {
        setSelectedStaffPhone(staffList[0]);
      } else {
        setSelectedStaffPhone('');
      }

      setSuccessSaved(false);
      setErrorMsg(null);
      setTranscript('');
    } else {
      stopListening();
    }
  }, [isOpen, prefilledData]);

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

  const startListening = async () => {
    setErrorMsg(null);
    setTranscript('');

    if (!isSpeechRecognitionSupported()) {
      playMicChime('error');
      setErrorMsg('ब्राउज़र में माइक उपलब्ध नहीं है। आप नीचे लिखकर विवरण भर सकते हैं।');
      setInputMode('type');
      return;
    }

    stopListening();
    playMicChime('start');

    await requestMicrophoneAccess();

    try {
      const recognizer = createSpeechRecognizer(
        (text, isFinal) => {
          setTranscript(text);
          if (isFinal && text.trim().length > 2) {
            handleProcessSpeech(text);
          }
        },
        (err) => {
          console.warn('Mandi speech error:', err);
          setIsListening(false);
          if (err === 'not-allowed') {
            setErrorMsg('माइक की अनुमति बंद है। पता बार में 🔒 लॉक आइकॉन से Allow करें।');
          } else if (err === 'network') {
            setErrorMsg('इंटरनेट / नेटवर्क समस्या: Google Speech सेवा उपलब्ध नहीं है। नीचे लिखकर भरें।');
            setInputMode('type');
          } else if (err === 'no-speech') {
            setErrorMsg('कोई आवाज़ नहीं सुनाई दी। कृपया दोबारा माइक दबाकर साफ़ बोलें।');
          } else if (err !== 'aborted') {
            setErrorMsg('माइक में समस्या आई (' + err + ')। कृपया नीचे लिखकर भरें।');
          }
        },
        () => {
          setIsListening(false);
        },
        isEn ? 'en-IN' : 'hi-IN'
      );

      recognizerRef.current = recognizer;
      if (recognizer) {
        recognizer.start();
        setIsListening(true);
      }
    } catch (e: any) {
      console.warn('Failed to start speech:', e);
      setIsListening(false);
    }
  };

  const handleProcessSpeech = async (speechText: string) => {
    if (!speechText.trim()) return;
    setIsProcessing(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/ai/parse-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speechText })
      });
      const data = await res.json();
      if (data.success && data.data) {
        const result = data.data;
        if (result.productName || result.name) {
          const name = result.productName || result.name;
          setProductName(name);

          // Find if product exists in products list
          const match = products.find(p => p.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(p.name.toLowerCase()));
          if (match) {
            setOldPrice(String(match.selling_price));
            setUnit(match.unit || 'किलो');
          } else if (result.oldPrice) {
            setOldPrice(String(result.oldPrice));
          }

          if (result.newPrice) setNewPrice(String(result.newPrice));
          else if (result.sellingPrice) setNewPrice(String(result.sellingPrice));

          if (result.wholesalePrice) setWholesalePrice(String(result.wholesalePrice));
          else if (result.purchasePrice) setWholesalePrice(String(result.purchasePrice));

          if (result.unit) setUnit(result.unit);
          if (result.notes) setNotes(result.notes);
        } else if (result.amount) {
          setNewPrice(String(result.amount));
        }

        if (soundboxEnabled && result.confirmationSpeech) {
          playSoundboxVoice(result.confirmationSpeech, true);
        }
      }
    } catch (err: any) {
      console.warn('Speech process failed:', err);
    } finally {
      setIsProcessing(false);
    }
  };

  // When product is selected from dropdown
  const handleProductSelect = (selectedName: string) => {
    setProductName(selectedName);
    const found = products.find(p => p.name === selectedName);
    if (found) {
      setOldPrice(String(found.selling_price));
      setUnit(found.unit || 'किलो');
      if (found.wholesale_price || found.purchase_price) {
        setWholesalePrice(String(found.wholesale_price || found.purchase_price));
      }
    }
  };

  const oldNum = parseFloat(oldPrice) || 0;
  const newNum = parseFloat(newPrice) || 0;
  const priceDiff = newNum - oldNum;

  // Generate WhatsApp message slip
  const generateWhatsAppMessage = () => {
    const shop = settings.shop_name || 'दुकान';
    const owner = settings.owner_name || 'दुकानदार';
    const now = new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

    let diffText = '';
    if (oldNum > 0) {
      if (priceDiff > 0) {
        diffText = `🔺 *बदलाव:* ₹${priceDiff} भाव बढ़ (तेज) गया है!`;
      } else if (priceDiff < 0) {
        diffText = `🔻 *बदलाव:* ₹${Math.abs(priceDiff)} भाव घटा (मंदा) है!`;
      }
    }

    return `🚨 *मंडी ताज़ा भाव अलर्ट!* 🚨\n` +
      `🏪 *${shop}*\n` +
      `👤 *भेजने वाले:* ${owner} (मंडी से)\n\n` +
      `📦 *सामान:* ${productName || 'किराना सामान'}\n` +
      `💰 *नया बिक्री रेट:* ₹${newPrice} / ${unit}\n` +
      (oldNum > 0 ? `⚠️ *पहले का रेट:* ₹${oldNum} / ${unit}\n` : '') +
      (diffText ? `${diffText}\n` : '') +
      (wholesalePrice ? `🛒 *मंडी खरीद भाव:* ₹${wholesalePrice} / ${unit}\n` : '') +
      `\n📝 *संदेश:* ${notes || 'काउंटर पर तुरंत नया रेट लगाएं!'}\n\n` +
      `⏰ समय: ${now}\n` +
      `— दुकान खाता मंडी अलर्ट सिस्टम`;
  };

  const handleSendWhatsApp = () => {
    const text = encodeURIComponent(generateWhatsAppMessage());
    const targetPhone = (customPhone || selectedStaffPhone || '').replace(/\D/g, '');

    let url = '';
    if (targetPhone.length >= 10) {
      const formatted = targetPhone.length === 10 ? `91${targetPhone}` : targetPhone;
      url = `https://wa.me/${formatted}?text=${text}`;
    } else {
      url = `https://api.whatsapp.com/send?text=${text}`;
    }

    window.open(url, '_blank');
  };

  const handleSaveAndBroadcast = async (alsoSendWhatsApp: boolean = false) => {
    if (!productName.trim()) {
      alert('कृपया सामान का नाम दर्ज करें');
      return;
    }
    if (!newNum || newNum <= 0) {
      alert('कृपया नया भाव / रेट दर्ज करें');
      return;
    }

    setIsProcessing(true);
    setErrorMsg(null);

    try {
      await onSaveAlert({
        product_name: productName.trim(),
        old_price: oldNum,
        new_price: newNum,
        wholesale_price: parseFloat(wholesalePrice) || 0,
        unit: unit.trim() || 'किलो',
        notes: notes.trim(),
        sender_name: settings.owner_name || 'दुकानदार',
        update_product: updateProductRate
      });

      if (soundboxEnabled) {
        const speechMsg = `मंडी अलर्ट जारी हो गया। ${productName} का नया भाव ₹${newNum} प्रति ${unit} दर्ज कर दिया गया है।`;
        playSoundboxVoice(speechMsg, true);
      }

      setSuccessSaved(true);

      if (alsoSendWhatsApp) {
        handleSendWhatsApp();
      }

      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      setErrorMsg('अलर्ट जारी करने में समस्या आई: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 md:p-6 bg-slate-900/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl max-w-lg md:max-w-xl lg:max-w-2xl w-full max-h-[92dvh] flex flex-col shadow-2xl border border-amber-200 dark:border-amber-900/40 overflow-hidden my-auto">
        
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-amber-600 via-orange-600 to-rose-600 text-white flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-white/20 rounded-2xl backdrop-blur-xs">
              <ShieldAlert className="w-6 h-6 text-yellow-200 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-base sm:text-lg tracking-tight">
                  {isEn ? 'Mandi Fresh Rate Alert' : 'मंडी ताज़ा भाव अलर्ट'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-white/20 text-yellow-100 border border-white/20">
                  Notify Staff
                </span>
              </div>
              <p className="text-xs text-amber-100 font-medium">
                {isEn ? 'Broadcast updated market rates directly to shop staff and counter' : 'मंडी से सीधे दुकान स्टाफ और काउंटर को ताज़ा रेट सूचित करें'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/80 hover:text-white hover:bg-white/10 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Toggle Tabs */}
        <div className="flex border-b border-amber-100 dark:border-slate-800 bg-amber-50/50 dark:bg-slate-800/80 p-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setInputMode('voice');
              startListening();
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
              inputMode === 'voice'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm'
                : 'text-amber-900 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-slate-700/60'
            }`}
          >
            <Mic className="w-4 h-4" />
            <span>{isEn ? '🎙️ Voice Alert' : '🎙️ बोलकर अलर्ट दें'}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              stopListening();
              setInputMode('type');
            }}
            className={`flex-1 py-2 rounded-xl text-xs font-black flex items-center justify-center gap-2 transition-all ${
              inputMode === 'type'
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm'
                : 'text-amber-900 dark:text-amber-200 hover:bg-amber-100/60 dark:hover:bg-slate-700/60'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>{isEn ? '⌨️ Type Alert' : '⌨️ लिखकर भरें'}</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 overflow-y-auto space-y-4 flex-1">
          {/* Voice Prompt Box if Voice Mode */}
          {inputMode === 'voice' && (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-950/40 dark:to-orange-950/30 border-2 border-dashed border-amber-300 dark:border-amber-700/60 rounded-2xl p-3.5 text-center space-y-2">
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
                    isListening
                      ? 'bg-rose-500 text-white ring-4 ring-rose-200 dark:ring-rose-900/60 animate-pulse'
                      : 'bg-amber-500 text-white hover:bg-amber-600 shadow-md'
                  }`}
                >
                  {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>
              </div>

              <div className="text-xs font-bold text-amber-950 dark:text-amber-200">
                {isListening
                  ? (isEn ? '🎧 Listening... Speak (e.g. "Sugar ₹44")' : '🎧 सुन रहे हैं... बोलिए (जैसे: "चीनी ₹44 हो गई")')
                  : (isEn ? 'Tap mic to speak' : 'माइक पर टैप करके बोलें')}
              </div>

              {transcript && (
                <div className="bg-white/90 dark:bg-slate-800 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800 text-xs font-semibold text-slate-700 dark:text-slate-200 italic">
                  "{transcript}"
                </div>
              )}

              {/* Sample Hints */}
              <div className="flex flex-wrap gap-1.5 justify-center pt-1">
                {(isEn
                  ? ['Sugar ₹44 now', 'Oil ₹145 up', 'Dal ₹130 now']
                  : ['चीनी ₹44 हो गई', 'फॉर्च्यून तेल ₹145 तेज', 'अरहर दाल ₹130 हो गई']
                ).map((hint, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setTranscript(hint);
                      handleProcessSpeech(hint);
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-full bg-amber-100/80 hover:bg-amber-200 dark:bg-amber-950/60 dark:hover:bg-amber-900/60 text-amber-900 dark:text-amber-200 font-semibold border border-amber-200 dark:border-amber-800 transition-all"
                  >
                    💬 {hint}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Product Selection / Search */}
          <div className="space-y-1">
            <label className="text-xs font-extrabold text-slate-800 dark:text-slate-200 flex items-center justify-between">
              <span>{isEn ? 'Product Name*' : 'सामान का नाम (Product Name)*'}</span>
              {products.length > 0 && (
                <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  {isEn ? 'Pick from list or type new' : 'लिस्ट से चुनें या नया लिखें'}
                </span>
              )}
            </label>
            <div className="space-y-1.5">
              <input
                type="text"
                required
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
                placeholder={isEn ? 'e.g. Sugar, Mustard Oil, Fortune, Arhar Dal' : 'उदा: चीनी, सरसो तेल, फॉर्च्यून, अरहर दाल'}
                className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              />

              {/* Quick pills from existing products */}
              {products.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
                  <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 shrink-0">
                    {isEn ? 'Hints:' : 'सुझाव:'}
                  </span>
                  {products.slice(0, 6).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleProductSelect(p.name)}
                      className={`text-[11px] px-2 py-0.5 rounded-lg shrink-0 font-medium border transition-all ${
                        productName === p.name
                          ? 'bg-amber-500 text-white border-amber-600 font-bold'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {p.name} (₹{p.selling_price})
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Price Input Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            {/* Old Price */}
            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                {isEn ? 'Old Selling Rate' : 'पहले का बिक्री रेट (Old)'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 dark:text-slate-500">₹</span>
                <input
                  type="number"
                  step="any"
                  value={oldPrice}
                  onChange={(e) => setOldPrice(e.target.value)}
                  placeholder="0"
                  className="w-full pl-7 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            {/* New Price */}
            <div>
              <label className="text-xs font-extrabold text-amber-900 dark:text-amber-300 block mb-1">
                {isEn ? 'New Selling Rate*' : 'नया बिक्री रेट (New)*'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-amber-600 dark:text-amber-400">₹</span>
                <input
                  type="number"
                  step="any"
                  required
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="0"
                  className="w-full pl-7 pr-3 py-2 bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-400 dark:border-amber-600 rounded-xl text-sm font-black text-amber-950 dark:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Wholesale Purchase Price & Unit Grid */}
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                {isEn ? 'Mandi Wholesale Price (Opt)' : 'मंडी थोक खरीद भाव (वैकल्पिक)'}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-black text-slate-400 dark:text-slate-500">₹</span>
                <input
                  type="number"
                  step="any"
                  value={wholesalePrice}
                  onChange={(e) => setWholesalePrice(e.target.value)}
                  placeholder="उदा: 40"
                  className="w-full pl-7 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-600 dark:text-slate-400 block mb-1">
                {isEn ? 'Unit' : 'इकाई (Unit)'}
              </label>
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="किलो">{isEn ? 'Kg (किलो)' : 'किलो (Kg)'}</option>
                <option value="लीटर">{isEn ? 'Litre (लीटर)' : 'लीटर (Litre)'}</option>
                <option value="बोरी">{isEn ? 'Bag / Bori (बोरी)' : 'बोरी (Bori/Bag)'}</option>
                <option value="टीन">{isEn ? 'Tin (टीन)' : 'टीन (Tin)'}</option>
                <option value="पैकेट">{isEn ? 'Pkt (पैकेट)' : 'पैकेट (Pkt)'}</option>
                <option value="क्विंटल">{isEn ? 'Quintal (क्विंटल)' : 'क्विंटल (Quintal)'}</option>
                <option value="पीस">{isEn ? 'Pcs (पीस)' : 'पीस (Pcs)'}</option>
              </select>
            </div>
          </div>

          {/* Price Difference Indicator Badge */}
          {newNum > 0 && oldNum > 0 && (
            <div className={`p-2.5 rounded-xl border flex items-center justify-between ${
              priceDiff > 0
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                : priceDiff < 0
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200'
                : 'bg-slate-50 dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
            }`}>
              <div className="flex items-center gap-2">
                {priceDiff > 0 ? (
                  <TrendingUp className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                ) : priceDiff < 0 ? (
                  <TrendingDown className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                ) : (
                  <Sparkles className="w-5 h-5 text-slate-500 dark:text-slate-400" />
                )}
                <span className="text-xs font-extrabold">
                  {priceDiff > 0
                    ? (isEn
                      ? `Rate is ₹${priceDiff} up (+${((priceDiff / oldNum) * 100).toFixed(1)}%)!`
                      : `भाव ₹${priceDiff} तेज (+${((priceDiff / oldNum) * 100).toFixed(1)}%) हो गया है!`)
                    : priceDiff < 0
                    ? (isEn
                      ? `Rate is ₹${Math.abs(priceDiff)} down (-${((Math.abs(priceDiff) / oldNum) * 100).toFixed(1)}%)!`
                      : `भाव ₹${Math.abs(priceDiff)} मंदा (-${((Math.abs(priceDiff) / oldNum) * 100).toFixed(1)}%) हुआ है!`)
                    : (isEn ? 'No price change' : 'भाव में कोई बदलाव नहीं')}
                </span>
              </div>
              <span className="text-[11px] font-bold">
                ₹{oldNum} ➔ <strong className="text-sm underline">₹{newNum}</strong>
              </span>
            </div>
          )}

          {/* Notes / Special Instructions for Staff */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              {isEn ? 'Staff Note / Instructions' : 'स्टाफ के लिए संदेश / निर्देश (Staff Note)'}
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={isEn ? 'e.g. Do not sell on old rate, update price immediately!' : 'उदा: पुराना रेट में नहीं बेचना, तुरंत नया रेट लगाओ!'}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Auto-update Product Rate List Checkbox */}
          <div className="flex items-center gap-2.5 p-2.5 bg-amber-500/10 dark:bg-slate-800/80 border border-amber-400/30 dark:border-amber-500/20 rounded-xl">
            <input
              type="checkbox"
              id="updateProductRate"
              checked={updateProductRate}
              onChange={(e) => setUpdateProductRate(e.target.checked)}
              className="w-4 h-4 text-amber-600 rounded-md focus:ring-amber-500 cursor-pointer"
            />
            <label htmlFor="updateProductRate" className="text-xs font-bold text-amber-900 dark:text-amber-200 cursor-pointer">
              {isEn ? 'Also update this new rate immediately in Shop Rate List' : 'दुकान की रेट लिस्ट में भी यह नया भाव तुरंत अपडेट कर दें'}
            </label>
          </div>

          {/* Staff WhatsApp Dispatch Target */}
          <div className="bg-emerald-500/10 dark:bg-slate-800/80 border border-emerald-400/30 dark:border-emerald-500/20 rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-emerald-950 dark:text-emerald-200">
                <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>{isEn ? 'Staff WhatsApp Number' : 'स्टाफ WhatsApp नंबर'}</span>
              </div>
              {staffList.length === 0 && (
                <span className="text-[10px] text-amber-700 dark:text-amber-400 font-semibold">
                  {isEn ? '(No numbers saved in settings)' : '(सेटिंग्स में नंबर सेव नहीं हैं)'}
                </span>
              )}
            </div>

            {staffList.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {staffList.map((num, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setSelectedStaffPhone(num);
                      setCustomPhone('');
                    }}
                    className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
                      selectedStaffPhone === num && !customPhone
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <Phone className="w-3 h-3" />
                    <span>{num}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <div>
              <input
                type="tel"
                value={customPhone}
                onChange={(e) => setCustomPhone(e.target.value)}
                placeholder={isEn ? 'Or enter any other WhatsApp number (e.g. 9876543210)' : 'या कोई अन्य WhatsApp मोबाइल नंबर डालें (उदा: 9876543210)'}
                className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Success Flash */}
          {successSaved && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs font-extrabold text-emerald-800 dark:text-emerald-200 flex items-center justify-center gap-2 animate-in zoom-in-95">
              <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>{isEn ? '✅ Mandi rate alert dispatched successfully!' : '✅ मंडी अलर्ट सफलतापूर्वक जारी कर दिया गया!'}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 bg-slate-50 dark:bg-slate-900/90 border-t border-slate-200 dark:border-slate-800 shrink-0 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {/* WhatsApp Send Button */}
            <button
              type="button"
              onClick={handleSendWhatsApp}
              disabled={isProcessing || !newNum}
              className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
            >
              <Share2 className="w-4 h-4" />
              <span>{isEn ? '📲 WhatsApp Alert' : '📲 WhatsApp अलर्ट'}</span>
            </button>

            {/* In-App Broadcast Button */}
            <button
              type="button"
              onClick={() => handleSaveAndBroadcast(false)}
              disabled={isProcessing || !newNum || !productName}
              className="py-2.5 px-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 active:from-amber-800 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
            >
              <ShieldAlert className="w-4 h-4" />
              <span>{isEn ? '📢 Broadcast In-App' : '📢 ऐप में जारी करें'}</span>
            </button>
          </div>

          {/* Dual Action Primary Button */}
          <button
            type="button"
            onClick={() => handleSaveAndBroadcast(true)}
            disabled={isProcessing || !newNum || !productName}
            className="w-full py-2.5 bg-gradient-to-r from-teal-700 via-emerald-600 to-green-600 hover:from-teal-800 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-md transition-all disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>{isEn ? '📢 Broadcast In-App + Send WhatsApp to Staff' : '📢 दुकान ऐप में जारी करें + स्टाफ को WhatsApp भेजें'}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
