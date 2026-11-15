/**
 * Speech Recognition and Soundbox Synthesis Utility
 */

export const isSpeechRecognitionSupported = (): boolean => {
  return typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
};

export const getSpeechErrorMessage = (error: string): string => {
  switch (error) {
    case 'not-allowed':
    case 'permission_denied':
      return 'माइक्रोफ़ोन की अनुमति (Permission) बंद है। कृपया ब्राउज़र के एड्रेस बार में लॉक (🔒) आइकॉन पर क्लिक करके Microphone को "Allow" (अनुमति दें) करें।';
    case 'audio-capture':
    case 'no_device':
      return 'कंप्यूटर या मोबाइल में माइक्रोफ़ोन नहीं मिला या किसी दूसरे ऐप में व्यस्त है। कृपया माइक चेक करें।';
    case 'network':
      return 'नेटवर्क एरर: गूगल स्पीच सेवा के लिए सक्रिय इंटरनेट कनेक्शन आवश्यक है। आप नीचे दिए गए टेस्ट बटन या टेक्स्ट बॉक्स से भी आसानी से दर्ज कर सकते हैं।';
    case 'service-not-allowed':
      return 'इस ब्राउज़र में स्पीच सर्विस ब्लॉक है। कृपया Google Chrome या Microsoft Edge इस्तेमाल करें।';
    case 'no-speech':
      return 'कोई आवाज़ सुनाई नहीं दी। कृपया स्पष्ट और थोड़ा तेज़ बोलें।';
    case 'aborted':
      return 'माइक बंद किया गया।';
    default:
      return `माइक त्रुटि (${error})। आप नीचे दिए गए विकल्पों से भी दर्ज कर सकते हैं।`;
  }
};

// Pleasant audio feedback cues using Web Audio API (100% offline, zero dependencies)
let sharedAudioCtx: AudioContext | null = null;

const getSharedAudioContext = (): AudioContext | null => {
  if (typeof window === 'undefined') return null;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedAudioCtx || sharedAudioCtx.state === 'closed') {
      sharedAudioCtx = new AudioCtx();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
};

export const playMicChime = (type: 'start' | 'success' | 'error') => {
  const ctx = getSharedAudioContext();
  if (!ctx) return;

  const playTone = () => {
    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (type === 'start') {
        // High distinct 2-tone listening beep: 550Hz -> 850Hz
        osc.type = 'sine';
        osc.frequency.setValueAtTime(550, now);
        osc.frequency.exponentialRampToValueAtTime(850, now + 0.12);
        gain.gain.setValueAtTime(0.28, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === 'success') {
        // Cheerful confirmation ding: 587Hz -> 880Hz
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'error') {
        // Low warning beep
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(260, now);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.25);
      }
    } catch {
      // safely ignore
    }
  };

  if (ctx.state === 'suspended') {
    ctx.resume().then(playTone).catch(() => {});
  } else {
    playTone();
  }
};

// Request microphone access explicitly if permission is needed
export const requestMicrophoneAccess = async (): Promise<boolean> => {
  if (typeof navigator === 'undefined') return true;
  try {
    if ((navigator as any).permissions?.query) {
      const status = await (navigator as any).permissions.query({ name: 'microphone' });
      if (status.state === 'denied') return false;
      if (status.state === 'granted') return true;
    }
  } catch {
    // ignore
  }
  return true;
};

// Track globally active speech recognizer to prevent instance collisions
let activeSpeechRecognizer: any = null;

export const stopActiveSpeechRecognizer = () => {
  if (activeSpeechRecognizer) {
    try {
      activeSpeechRecognizer.abort();
    } catch {
      // ignore
    }
    activeSpeechRecognizer = null;
  }
};

export const createSpeechRecognizer = (
  onResult: (text: string, isFinal: boolean) => void,
  onError: (error: string) => void,
  onEnd: () => void,
  lang: string = 'hi-IN'
) => {
  if (!isSpeechRecognitionSupported()) {
    onError('Speech recognition is not supported on this device/browser');
    return null;
  }

  // Cleanly abort any prior active speech recognition session
  stopActiveSpeechRecognizer();

  const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  activeSpeechRecognizer = recognition;

  // continuous = true ensures Chrome / Edge keeps listening for the full sentence without cutting off
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.lang = lang;

  let silenceTimer: any = null;
  let lastRecognizedText = '';
  let hasFinalized = false;
  let hasNetworkRetried = false;

  const triggerFinal = (text: string) => {
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    const trimmed = text.trim();
    if (trimmed && !hasFinalized) {
      hasFinalized = true;
      try {
        recognition.stop();
      } catch {
        // ignore
      }
      playMicChime('success');
      onResult(trimmed, true);
    }
  };

  // Expose immediate manual finalizer for finish buttons
  (recognition as any).finalizeNow = () => {
    if (lastRecognizedText) {
      triggerFinal(lastRecognizedText);
    }
  };

  recognition.onresult = (event: any) => {
    let fullTranscript = '';

    // Build the complete transcript across all results so earlier words (customer name, etc.) are never dropped
    for (let i = 0; i < event.results.length; ++i) {
      const res = event.results[i];
      if (res && res[0] && res[0].transcript) {
        fullTranscript += res[0].transcript + ' ';
      }
    }

    const currentText = fullTranscript.trim();
    if (currentText) {
      lastRecognizedText = currentText;
      onResult(currentText, false);

      // Reset natural silence timer so shopkeeper can speak their full sentence comfortably
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        triggerFinal(lastRecognizedText);
      }, 1400); // 1.4 seconds of calm pause before automatic finalization
    }
  };

  recognition.onspeechend = () => {
    if (lastRecognizedText && !hasFinalized) {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = setTimeout(() => {
        triggerFinal(lastRecognizedText);
      }, 700);
    }
  };

  recognition.onerror = (event: any) => {
    console.warn('[Speech] Error:', event.error);
    if (silenceTimer) clearTimeout(silenceTimer);

    // If we already received speech text, finalize rather than dropping what was spoken
    if (lastRecognizedText && !hasFinalized && (event.error === 'no-speech' || event.error === 'aborted')) {
      triggerFinal(lastRecognizedText);
      return;
    }

    // Chrome network error fallback: if Google Speech regional endpoint had a transient failure
    if (event.error === 'network' && !hasNetworkRetried && typeof navigator !== 'undefined' && navigator.onLine) {
      hasNetworkRetried = true;
      try {
        const fallbackLang = lang.startsWith('hi') ? 'hi' : 'en-IN';
        recognition.lang = fallbackLang;
        setTimeout(() => {
          try {
            recognition.start();
          } catch {
            playMicChime('error');
            onError('network');
          }
        }, 250);
        return;
      } catch {
        // proceed
      }
    }

    playMicChime('error');
    onError(event.error);
  };

  recognition.onend = () => {
    if (silenceTimer) clearTimeout(silenceTimer);
    if (lastRecognizedText && !hasFinalized) {
      triggerFinal(lastRecognizedText);
    }
    if (activeSpeechRecognizer === recognition) {
      activeSpeechRecognizer = null;
    }
    if (typeof onEnd === 'function') {
      onEnd();
    }
  };

  return recognition;
};

// Convert numeric digits into natural spoken Hindi words for 100% authentic, realistic Indian soundbox announcement
export const numberToHindiWords = (num: number): string => {
  num = Math.round(Number(num) || 0);
  if (num <= 0) return 'शून्य';
  if (num === 150) return 'डेढ़ सौ';
  if (num === 250) return 'ढाई सौ';
  if (num === 1500) return 'डेढ़ हज़ार';
  if (num === 2500) return 'ढाई हज़ार';

  const units = ['', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस',
    'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस', 'बीस',
    'इक्कीस', 'बाईस', 'तेईस', 'चौबीस', 'पच्चीस', 'छब्बीस', 'सत्ताईस', 'अट्ठाइस', 'उनतीस', 'तीस',
    'इकतीस', 'बत्तीस', 'तैंतीस', 'चौंतीस', 'पैंतीस', 'छत्तीस', 'सैंतीस', 'अड़तीस', 'उनतालीस', 'चालीस',
    'इकतालीस', 'बयालीस', 'तैंतालीस', 'चवालीस', 'पैंतालीस', 'छियालीस', 'सैंतालीस', 'अड़तालीस', 'उनचास', 'पचास',
    'इक्यावन', 'बावन', 'तिरेपन', 'चौवन', 'पचपन', 'छप्पन', 'सत्तावन', 'अट्ठावन', 'उनसठ', 'साठ',
    'इकसठ', 'बासठ', 'तिरेसठ', 'चौंसठ', 'पैंसठ', 'छियासठ', 'सरसठ', 'अड़सठ', 'उनहत्तर', 'सत्तर',
    'इकहत्तर', 'बहत्तर', 'तिहत्तर', 'चौहत्तर', 'पचहत्तर', 'छिहत्तर', 'सतहत्तर', 'अठहत्तर', 'उनासी', 'अस्सी',
    'इक्यासी', 'बयासी', 'तिरासी', 'चौरासी', 'पचासी', 'छियासी', 'सत्तासी', 'अट्ठासी', 'नवासी', 'नब्बे',
    'इक्यानवे', 'बानवे', 'तिरानवे', 'चौरानवे', 'पंचानवे', 'छियानवे', 'सत्तानवे', 'अट्ठानवे', 'निन्यानवे'];

  const parts: string[] = [];
  if (num >= 10000000) {
    const cr = Math.floor(num / 10000000);
    parts.push(numberToHindiWords(cr) + ' करोड़');
    num %= 10000000;
  }
  if (num >= 100000) {
    const lk = Math.floor(num / 100000);
    parts.push((units[lk] || numberToHindiWords(lk)) + ' लाख');
    num %= 100000;
  }
  if (num >= 1000) {
    const th = Math.floor(num / 1000);
    parts.push((units[th] || numberToHindiWords(th)) + ' हज़ार');
    num %= 1000;
  }
  if (num >= 100) {
    const h = Math.floor(num / 100);
    parts.push(units[h] + ' सौ');
    num %= 100;
  }
  if (num > 0) {
    parts.push(units[num] || String(num));
  }
  return parts.join(' ');
};

/**
 * 🔔 Realistic Paytm / PhonePe Soundbox Signature Chime
 * 4-tone harmonic bell chime with acoustic resonance
 * Plays immediately before the voice announcement!
 */
export const playPaytmSoundboxChime = async (): Promise<void> => {
  const ctx = getSharedAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {}
  }

  return new Promise(resolve => {
    try {
      const now = ctx.currentTime;
      // Paytm ascending harmonic sequence: Eb5 (622Hz) -> G5 (784Hz) -> Bb5 (932Hz) -> Eb6 (1244Hz)
      const notes = [
        { freq: 622.25, time: 0.00, dur: 0.13 },
        { freq: 783.99, time: 0.09, dur: 0.13 },
        { freq: 932.33, time: 0.18, dur: 0.14 },
        { freq: 1244.51, time: 0.28, dur: 0.36 }
      ];

      notes.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle'; // warm melodious bell harmonic
        osc.frequency.setValueAtTime(freq, now + time);

        gain.gain.setValueAtTime(0.001, now + time);
        gain.gain.exponentialRampToValueAtTime(0.35, now + time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + time);
        osc.stop(now + time + dur + 0.05);
      });

      // Give 420ms for the melodic chime to resonate before voice announcement begins
      setTimeout(resolve, 420);
    } catch {
      resolve();
    }
  });
};

// Dukaan Soundbox Voice Speaker (Paytm / PhonePe style) with onEnd callback support
export const playSoundboxVoice = async (
  text: string,
  enabled: boolean = true,
  onEnd?: () => void,
  options?: { skipChime?: boolean }
) => {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    if (typeof onEnd === 'function') {
      setTimeout(onEnd, 200);
    }
    return;
  }

  try {
    // 1. Play authentic Paytm Soundbox Chime first unless explicitly disabled
    if (!options?.skipChime) {
      await playPaytmSoundboxChime();
    }

    window.speechSynthesis.cancel();

    const isEnText = !/[\u0900-\u097F]/.test(text) && /^[a-zA-Z0-9\s.,₹!?'"-]+$/.test(text);

    // 2. Clean & convert currency/numbers into natural spoken Hindi/English words
    let cleanText = text;
    if (isEnText) {
      cleanText = cleanText
        .replace(/₹\s*([0-9,.]+)/g, '$1 rupees')
        .replace(/Rs\.?\s*([0-9,.]+)/gi, '$1 rupees')
        .replace(/\s+/g, ' ')
        .trim();
    } else {
      // Natural Hindi soundbox speech:
      // Replace "₹ 500" or "500 रुपये" with spoken words like "पाँच सौ रुपये"
      cleanText = cleanText
        .replace(/(?:₹\s*|Rs\.?\s*)([0-9,]+(?:\.[0-9]+)?)/gi, (_, val) => {
          const n = parseFloat(val.replace(/,/g, ''));
          return (isNaN(n) || n === 0) ? 'रुपये' : `${numberToHindiWords(n)} रुपये`;
        })
        .replace(/([0-9,]+(?:\.[0-9]+)?)\s*(?:रुपये|रुपया)/gi, (_, val) => {
          const n = parseFloat(val.replace(/,/g, ''));
          return (isNaN(n) || n === 0) ? 'रुपये' : `${numberToHindiWords(n)} रुपये`;
        })
        .replace(/\s+/g, ' ')
        .trim();
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = isEnText ? 'en-IN' : 'hi-IN';
    utterance.rate = 0.96; // Optimal conversational cadence of Paytm soundbox
    utterance.pitch = 1.0; // Natural authentic pitch (not high/squeaky)
    utterance.volume = 1.0;

    if (typeof onEnd === 'function') {
      utterance.onend = () => {
        try {
          onEnd();
        } catch {}
      };
      utterance.onerror = () => {
        try {
          onEnd();
        } catch {}
      };
    }

    const pickBestVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      if (!voices || voices.length === 0) return null;

      if (isEnText) {
        let enVoice = voices.find(v => (v.lang === 'en-IN' || v.name.includes('India')) && 
          (v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Google') || v.name.includes('Neerja')));
        if (!enVoice) enVoice = voices.find(v => v.lang === 'en-IN' || v.name.toLowerCase().includes('india'));
        if (!enVoice) enVoice = voices.find(v => v.lang.startsWith('en'));
        return enVoice;
      }

      // Priority 1: High quality Neural Hindi voices (Microsoft Swara / Madhur, Google Hindi)
      let bestVoice = voices.find(v => 
        (v.lang === 'hi-IN' || v.lang.toLowerCase().startsWith('hi')) && 
        (v.name.includes('Swara') || v.name.includes('Madhur') || v.name.includes('Natural') || v.name.includes('Online') || v.name.includes('Google') || v.name.includes('Kalpana'))
      );

      // Priority 2: Any Hindi voice (including local Android TTS)
      if (!bestVoice) {
        bestVoice = voices.find(v => v.lang.toLowerCase().startsWith('hi') || v.name.toLowerCase().includes('hindi'));
      }

      // Priority 3: Natural Indian English voice
      if (!bestVoice) {
        bestVoice = voices.find(v => (v.lang === 'en-IN' || v.name.includes('India')) && (v.name.includes('Natural') || v.name.includes('Online')));
      }

      // Priority 4: Standard Indian English voice
      if (!bestVoice) {
        bestVoice = voices.find(v => v.lang === 'en-IN' || v.name.toLowerCase().includes('india'));
      }

      return bestVoice;
    };

    const selectedVoice = pickBestVoice();
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    }

    // Workaround for Chrome voice loading delay
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        const v = pickBestVoice();
        if (v) {
          utterance.voice = v;
          utterance.lang = v.lang;
        }
        window.speechSynthesis.speak(utterance);
      };
      return;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Speech synthesis error:', err);
    if (typeof onEnd === 'function') {
      setTimeout(onEnd, 300);
    }
  }
};

// Format rupees
export const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0
  }).format(amount);
};

// Format Transaction Date & Time
export const formatTransactionDateTime = (dateStr?: string, createdAt?: string, lang: 'hi' | 'en' = 'hi'): string => {
  let d: Date;
  let hasSpecificTime = false;

  if (createdAt) {
    d = new Date(createdAt);
    hasSpecificTime = !isNaN(d.getTime());
  } else if (dateStr && (dateStr.includes(':') || dateStr.includes('T'))) {
    d = new Date(dateStr);
    hasSpecificTime = !isNaN(d.getTime());
  } else if (dateStr) {
    d = new Date(dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr);
  } else {
    d = new Date();
    hasSpecificTime = true;
  }

  if (isNaN(d.getTime())) return dateStr || '';

  const dateFormatted = d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });

  const now = new Date();
  const timeDate = hasSpecificTime ? d : now;
  const timeFormatted = timeDate.toLocaleTimeString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

  return `${dateFormatted}, ${timeFormatted}`;
};

export const formatTransactionDate = (dateStr?: string, createdAt?: string, lang: 'hi' | 'en' = 'hi'): string => {
  let d: Date;
  if (createdAt) {
    d = new Date(createdAt);
  } else if (dateStr) {
    d = new Date(dateStr.length === 10 ? `${dateStr}T12:00:00` : dateStr);
  } else {
    d = new Date();
  }

  if (isNaN(d.getTime())) return dateStr || '';

  return d.toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
};

export const formatTransactionTime = (createdAt?: string, dateStr?: string, lang: 'hi' | 'en' = 'hi'): string => {
  let d: Date | null = null;
  if (createdAt) {
    d = new Date(createdAt);
  } else if (dateStr && (dateStr.includes(':') || dateStr.includes('T'))) {
    d = new Date(dateStr);
  }

  const targetDate = (d && !isNaN(d.getTime())) ? d : new Date();

  return targetDate.toLocaleTimeString(lang === 'hi' ? 'hi-IN' : 'en-IN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
};

// WhatsApp Reminder message generator
export const generateWhatsAppReminder = (
  customerName: string,
  amount: number,
  shopName: string,
  phone: string,
  upiId?: string,
  dueDate?: string,
  daysOverdue?: number,
  passbookToken?: string
): string => {
  const effectiveUpi = upiId || '';
  const upiPayUrl = effectiveUpi
    ? `upi://pay?pa=${encodeURIComponent(effectiveUpi)}&pn=${encodeURIComponent(shopName)}&am=${amount}&cu=INR&tn=${encodeURIComponent('Dukaan Udhaar Payment')}`
    : '';
  const qrImageUrl = effectiveUpi
    ? `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(upiPayUrl)}`
    : '';

  let msg = `नमस्ते ${customerName} जी! 🙏\n\n`;
  msg += `आपकी दुकान *${shopName}* से बकाया उधार भुगतान संदेश:\n`;
  msg += `💰 *कुल बकाया राशि: ₹${amount.toLocaleString('en-IN')}*\n`;

  if (dueDate) {
    if (daysOverdue && daysOverdue > 0) {
      msg += `⚠️ *उधार वादा तारीख: ${dueDate} (${daysOverdue} दिन पहले पूरी हो चुकी है)*\n`;
    } else {
      msg += `📅 *उधार वादा तारीख: ${dueDate}*\n`;
    }
  }
  msg += `\n`;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  if (passbookToken && origin) {
    msg += `📖 *अपनी लाइव खाता पासबुक देखें (लेनदेन का पूरा ब्योरा):*\n${origin}/?passbook=${passbookToken}\n\n`;
  }

  const webPayUrl = effectiveUpi && origin
    ? `${origin}/pay?pa=${encodeURIComponent(effectiveUpi)}&pn=${encodeURIComponent(shopName)}&am=${amount}&cust=${encodeURIComponent(customerName)}`
    : upiPayUrl;

  if (effectiveUpi) {
    msg += `📲 *दुकान UPI ID:* \`${effectiveUpi}\`\n\n`;
    msg += `👉 *सीधे PhonePe / Google Pay / Paytm से ऑनलाइन भुगतान के लिए क्लिक करें:*\n${webPayUrl}\n\n`;
    msg += `🖼️ *QR कोड देखकर स्कैन करने के लिए लिंक:*\n${qrImageUrl}\n\n`;
  }

  msg += `कृपया समय पर बकाया राशि का भुगतान करें। धन्यवाद!\n- *${shopName}*`;

  const cleanPhone = phone.replace(/[^0-9]/g, '');
  const encodedMsg = encodeURIComponent(msg);
  return `https://wa.me/${cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone}?text=${encodedMsg}`;
};

// Instant WhatsApp Transaction Slip (sent immediately when udhaar or jama is recorded)
export const generateTransactionWhatsAppSlip = (
  customerName: string,
  type: 'udhaar' | 'jama',
  amount: number,
  newBalance: number,
  notes: string,
  date: string,
  shopName: string,
  phone: string,
  upiId?: string,
  dueDate?: string,
  creditPeriodDays?: number,
  passbookToken?: string
): string => {
  const isUdhaar = type === 'udhaar';
  const typeLabel = isUdhaar ? 'उधार (Debit)' : 'जमा (Credit)';
  const typeEmoji = isUdhaar ? '🔴' : '🟢';

  let msg = `*🏬 ${shopName || 'दुकान खाता'} - खाता रसीद*\n\n`;
  msg += `नमस्ते *${customerName}* जी! 🙏\n\n`;
  msg += `${typeEmoji} आपके खाते में *₹${amount.toLocaleString('en-IN')}* ${isUdhaar ? 'का उधार दर्ज हुआ' : 'रुपये जमा हुआ'}।\n`;
  if (notes) msg += `📝 *विवरण:* ${notes}\n`;
  msg += `📅 *तारीख व समय:* ${formatTransactionDateTime(date, undefined, 'hi')}\n`;
  if (isUdhaar && dueDate) {
    msg += `⏳ *उधार चुकता करने की तारीख:* ${dueDate}${creditPeriodDays ? ` (${creditPeriodDays} दिन की अवधि)` : ''}\n`;
  }
  msg += `--------------------------------\n`;
  msg += `💰 *वर्तमान कुल बाकी बैलेंस: ₹${Math.abs(newBalance).toLocaleString('en-IN')}* ${
    newBalance > 0 ? '(बाकी लेना है)' : newBalance < 0 ? '(एडवांस जमा है)' : '(हिसाब चुकता)'
  }\n`;
  msg += `--------------------------------\n`;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (passbookToken && origin) {
    msg += `📖 *अपनी खाता पासबुक ऑनलाइन देखें:*\n${origin}/?passbook=${passbookToken}\n\n`;
  }

  if (newBalance > 0 && upiId) {
    const webPayUrl = origin
      ? `${origin}/pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(shopName || 'Dukaan')}&am=${newBalance}&cust=${encodeURIComponent(customerName)}`
      : `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(shopName || 'Dukaan')}&am=${newBalance}&cu=INR`;
    msg += `\n📲 *UPI ऑनलाइन भुगतान लिंक (PhonePe / GPay / Paytm):*\n${webPayUrl}\n`;
  }

  msg += `\nधन्यवाद! 🙏\n- *${shopName || 'दुकान खाता'}*`;

  const cleanPhone = phone ? phone.replace(/[^0-9]/g, '') : '';
  const formattedPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
  const encodedMsg = encodeURIComponent(msg);

  return formattedPhone ? `https://wa.me/${formattedPhone}?text=${encodedMsg}` : `https://wa.me/?text=${encodedMsg}`;
};
