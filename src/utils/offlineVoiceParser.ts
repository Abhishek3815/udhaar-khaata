import { Customer, Product, VoiceParseResult } from '../types';
import { areNamesEquivalent, findEquivalentCustomer, findEquivalentProduct } from './bilingualMatcher';

export const DEVANAGARI_DIGITS_MAP: Record<string, string> = {
  '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
  '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
};

// Convert Devanagari numerals (५००) to standard digits (500)
export function normalizeDevanagariDigits(str: string): string {
  return str.replace(/[०-९]/g, d => DEVANAGARI_DIGITS_MAP[d] || d);
}

// Convert spoken Hindi number words to digits for accurate parsing
export function normalizeHindiNumberWords(str: string): string {
  let res = str;

  // 1. Common spoken Hindi/Hinglish compounds and phrases
  const compounds: [RegExp, string][] = [
    [/डेढ़\s*हजार|डेढ़\s*हज़ार|dedh\s*hazar|dedh\s*hajar/gi, '1500'],
    [/ढाई\s*हजार|ढाई\s*हज़ार|dhai\s*hazar|dhai\s*hajar/gi, '2500'],
    [/साढ़े\s*तीन\s*हजार|साढ़े\s*तीन\s*हज़ार|sadhe\s*teen\s*hazar/gi, '3500'],
    [/साढ़े\s*चार\s*हजार|साढ़े\s*चार\s*हज़ार|sadhe\s*char\s*hazar/gi, '4500'],
    [/साढ़े\s*पाँच\s*हजार|साढ़े\s*पांच\s*हजार|साढ़े\s*पाँच\s*हज़ार|sadhe\s*panch\s*hazar/gi, '5500'],
    [/डेढ़\s*सौ|dedh\s*sau|dedh\s*so/gi, '150'],
    [/ढाई\s*सौ|dhai\s*sau|dhai\s*so/gi, '250'],
    [/साढ़े\s*तीन\s*सौ|sadhe\s*teen\s*sau/gi, '350'],
    [/साढ़े\s*चार\s*सौ|sadhe\s*char\s*sau/gi, '450'],
    [/साढ़े\s*पाँच\s*सौ|साढ़े\s*पांच\s*सौ|sadhe\s*panch\s*sau/gi, '550'],
    [/साढ़े\s*छह\s*सौ|sadhe\s*chhah\s*sau/gi, '650'],
    [/साढ़े\s*सात\s*सौ|sadhe\s*saat\s*sau/gi, '750'],
    [/साढ़े\s*आठ\s*सौ|sadhe\s*aath\s*sau/gi, '850'],
    [/साढ़े\s*नौ\s*सौ|sadhe\s*nau\s*sau/gi, '950'],
    [/(?:एक|1|ek)\s*(?:हजार|हज़ार|hazar|hajar)/gi, '1000'],
    [/(?:दो|2|do)\s*(?:हजार|हज़ार|hazar|hajar)/gi, '2000'],
    [/(?:तीन|3|teen)\s*(?:हजार|हज़ार|hazar|hajar)/gi, '3000'],
    [/(?:चार|4|char)\s*(?:हजार|हज़ार|hazar|hajar)/gi, '4000'],
    [/(?:पांच|पाँच|5|panch)\s*(?:हजार|हज़ार|hazar|hajar)/gi, '5000'],
    [/(?:छह|छः|6|chhah)\s*(?:हजार|हज़ार|hazar|hajar)/gi, '6000'],
    [/(?:सात|7|saat)\s*(?:हजार|हज़ार|hazar|hajar)/gi, '7000'],
    [/(?:आठ|8|aath)\s*(?:हजार|हज़ार|hazar|hajar)/gi, '8000'],
    [/(?:नौ|9|nau)\s*(?:हजार|हज़ार|hazar|hajar)/gi, '9000'],
    [/(?:दस|10|das)\s*(?:हजार|हज़ार|hazar|hajar)/gi, '10000'],
    [/(?:ग्यारह|11|gyarah)\s*(?:हजार|हज़ार|hazar)/gi, '11000'],
    [/(?:बारह|12|barah)\s*(?:हजार|हज़ार|hazar)/gi, '12000'],
    [/(?:पंद्रह|15|pandrah)\s*(?:हजार|हज़ार|hazar)/gi, '15000'],
    [/(?:बीस|20|bees)\s*(?:हजार|हज़ार|hazar)/gi, '20000'],
    [/(?:पच्चीस|25|pachees)\s*(?:हजार|हज़ार|hazar)/gi, '25000'],
    [/(?:पचास|50|pachaas)\s*(?:हजार|हज़ार|hazar)/gi, '50000'],
    [/(?:एक|1|ek)\s*(?:सौ|sau|so)\s*(?:पचास|50|pachaas)/gi, '150'],
    [/(?:दो|2|do)\s*(?:सौ|sau|so)\s*(?:पचास|50|pachaas)/gi, '250'],
    [/(?:तीन|3|teen)\s*(?:सौ|sau|so)\s*(?:पचास|50|pachaas)/gi, '350'],
    [/(?:चार|4|char)\s*(?:सौ|sau|so)\s*(?:पचास|50|pachaas)/gi, '450'],
    [/(?:पांच|पाँच|5|panch)\s*(?:सौ|sau|so)\s*(?:पचास|50|pachaas)/gi, '550'],
    [/(?:एक|1|ek)\s*(?:सौ|sau|so)/gi, '100'],
    [/(?:दो|2|do)\s*(?:सौ|sau|so)/gi, '200'],
    [/(?:तीन|3|teen)\s*(?:सौ|sau|so)/gi, '300'],
    [/(?:चार|4|char)\s*(?:सौ|sau|so)/gi, '400'],
    [/(?:पांच|पाँच|5|panch)\s*(?:सौ|sau|so)/gi, '500'],
    [/(?:छह|छः|6|chhah)\s*(?:सौ|sau|so)/gi, '600'],
    [/(?:सात|7|saat)\s*(?:सौ|sau|so)/gi, '700'],
    [/(?:आठ|8|aath)\s*(?:सौ|sau|so)/gi, '800'],
    [/(?:नौ|9|nau)\s*(?:सौ|sau|so)/gi, '900'],
    [/(?:बारह|12|barah)\s*(?:सौ|sau|so)/gi, '1200'],
    [/(?:पंद्रह|15|pandrah)\s*(?:सौ|sau|so)/gi, '1500'],
    [/(?:अठारह|18|atharah)\s*(?:सौ|sau|so)/gi, '1800'],
    [/(?:हजार|हज़ार|hazar|hajar)/gi, '1000'],
    [/\b(?:सौ|sau|so)\b/gi, '100'],
    [/\b(?:पचहत्तर|pachattar)\b/gi, '75'],
    [/\b(?:पचास|pachaas)\b/gi, '50'],
    [/\b(?:चालीस|chalis)\b/gi, '40'],
    [/\b(?:पैंतीस|paintis)\b/gi, '35'],
    [/\b(?:तीस|tees)\b/gi, '30'],
    [/\b(?:पच्चीस|pachees)\b/gi, '25'],
    [/\b(?:बीस|bees)\b/gi, '20'],
    [/\b(?:पंद्रह|pandrah)\b/gi, '15'],
    [/\b(?:दस|das)\b/gi, '10'],
    [/\b(?:साठ|saath)\b/gi, '60'],
    [/\b(?:सत्तर|sattar)\b/gi, '70'],
    [/\b(?:अस्सी|assi)\b/gi, '80'],
    [/\b(?:नब्बे|nabbe)\b/gi, '90']
  ];

  for (const [rgx, rep] of compounds) {
    res = res.replace(rgx, rep);
  }

  // 2. Handle speech-to-text numbers like "100 50" -> 150, "200 50" -> 250, "500 20" -> 520
  res = res.replace(/\b(\d{1,2}00)\s+(\d{1,2})\b/g, (_, h, t) => String(parseInt(h, 10) + parseInt(t, 10)));

  return res;
}

function isSpokenEnglish(text: string): boolean {
  return !/[\u0900-\u097F]/.test(text) && /[a-zA-Z]/.test(text);
}

function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Client-Side Smart Voice Parser for Dukaan Khaata
 * Accurately parses:
 *  1. Customer Ledger: Udhaar (उधार) vs Jama (जमा)
 *  2. Product Inventory: Add Product / Stock / Rates (Kharid & Bikri)
 *  3. Mandi Alert: Market price broadcasts
 */
export function parseSpokenDukaanVoice(
  speechText: string,
  knownCustomers: Customer[] = [],
  knownProducts: Product[] = []
): VoiceParseResult {
  const originalTrimmed = speechText.trim();
  // 1. Normalize Devanagari numerals (५०० -> 500) and Hindi number words (पांच सौ -> 500)
  const normalizedText = normalizeHindiNumberWords(normalizeDevanagariDigits(originalTrimmed));
  const clean = normalizedText.toLowerCase();
  const isEn = isSpokenEnglish(originalTrimmed);

  // -------------------------------------------------------------------------
  // 1. MANDI ALERT DETECTION
  // -------------------------------------------------------------------------
  const isMandiAlert = /मंडी|mandi|भाव बढ़|भाव घट|रेट बढ़|रेट घट|दाम बढ़|दाम घट|तेज हो गया|मंदा हो गया|market price|mandi alert/.test(clean);
  if (isMandiAlert) {
    const numbers = clean.match(/\d+(\.\d+)?/g)?.map(n => parseFloat(n)) || [];
    let newPrice = numbers[0] || 50;
    let oldPrice = 0;
    let wholesalePrice = 0;

    if (numbers.length >= 2) {
      if (/से|se|pehle|पहले|from/.test(clean)) {
        oldPrice = numbers[0];
        newPrice = numbers[1];
      } else {
        wholesalePrice = numbers[0];
        newPrice = numbers[1];
      }
    }

    const unit = clean.includes('किलो') || clean.includes('kg') ? 'किलो' :
                 clean.includes('लीटर') || clean.includes('litre') || clean.includes('liter') ? 'लीटर' :
                 clean.includes('बोरी') || clean.includes('bori') || clean.includes('bag') ? 'बोरी' :
                 clean.includes('टीन') || clean.includes('tin') ? 'टीन' : 'किलो';

    let prodName = originalTrimmed
      .replace(/\d+(\.\d+)?/g, '')
      .replace(/मंडी|mandi|में|का|की|भाव|रेट|दाम|बढ़|घट|तेज|मंदा|हो|गया|गई|है|रुपये|rupaye|प्रति|नया|स्टाफ|को|बताओ|अलर्ट|update|price|rate|market|alert|is|now/gi, '')
      .trim();
    if (!prodName) prodName = isEn ? 'Store Item' : 'किराना सामान';

    const confirmSpeech = isEn
      ? `Mandi alert: ${prodName} new rate ₹${newPrice}.`
      : `मंडी अलर्ट: ${prodName} का नया भाव ₹${newPrice} तैयार है।`;

    return {
      intent: 'mandi_alert',
      productName: prodName,
      oldPrice,
      newPrice,
      wholesalePrice,
      unit,
      notes: originalTrimmed,
      confidence: 0.98,
      confirmationSpeech: confirmSpeech
    };
  }

  // -------------------------------------------------------------------------
  // 2. INTENT CLASSIFICATION: TRANSACTION vs PRODUCT
  // -------------------------------------------------------------------------
  // Transaction action indicators: UDHAAR & JAMA keywords
  const hasUdhaarKeywords = /(उधार|udhar|udhaar|क्रेडिट|credit|lent|on credit|बाकी|खाते में लिख|लिख लो|लिख ले|लिख देना|लिख दो|को दे दो|को दिया|को दिए|का बाकी|का उधार|give.+?(?:credit|udhar)|lent to|debit|दे दिया|सामान दिया|ले गया)/i.test(clean);
  const hasJamaKeywords = /(जमा|jama|paid|payment|pay|received|receive|got|collected|settled|पेमेंट|भुगतान|वसूल|चुकाया|खाता चुकता|ने दिए|ने दिया|ने जमा|से मिला|से मिले|से आया|से आए|से ले लिया|दे गया|दे गए|कैश मिला|पेमेंट आया|फोनपे|phonepe|gpay|गूगल पे|पेटीएम|paytm|ऑनलाइन मिला)/i.test(clean);

  // Product Inventory indicators
  const hasInventoryExplicitKeywords = /(खरीद|kharid|purchase|cost|बिक्री|bikri|selling|mrp|एमआरपी|थोक भाव|थोक रेट|बिक्री रेट|स्टॉक में जोड़ो|स्टॉक जोड़ो|स्टॉक बढ़ाओ|स्टॉक करो|add to stock|add stock|update stock|नया प्रोडक्ट|नया सामान)/i.test(clean);
  const hasStockActionOnly = /(स्टॉक|stock)/i.test(clean) && !hasUdhaarKeywords && !hasJamaKeywords;

  // Check if speech matches any known product name
  const matchedExistingProd = findEquivalentProduct(clean, knownProducts) || knownProducts.find(p => {
    const pName = p.name.toLowerCase().trim();
    return clean.includes(pName) || pName.split(/[\s\(\)]+/).some(t => t.length >= 3 && clean.includes(t));
  });

  // Check if speech matches any known customer name
  const matchedExistingCust = findEquivalentCustomer(clean, knownCustomers) || knownCustomers.find(c => {
    const cName = c.name.toLowerCase().trim();
    return clean.includes(cName) || areNamesEquivalent(c.name, clean);
  });

  // Intent decision:
  // If user mentions customer OR Udhaar/Jama OR there's no explicit product keyword, treat as TRANSACTION
  let isTransactionIntent = false;
  if (hasUdhaarKeywords || hasJamaKeywords) {
    isTransactionIntent = true;
  } else if (matchedExistingCust && !hasInventoryExplicitKeywords) {
    isTransactionIntent = true;
  } else if (hasInventoryExplicitKeywords || hasStockActionOnly) {
    isTransactionIntent = false;
  } else if (matchedExistingProd && !hasUdhaarKeywords && !hasJamaKeywords) {
    isTransactionIntent = false;
  } else {
    // Default to transaction for shopkeeper daily usage
    isTransactionIntent = true;
  }

  // -------------------------------------------------------------------------
  // 3. CASE: CUSTOMER LEDGER TRANSACTION (UDHAAR vs JAMA)
  // -------------------------------------------------------------------------
  if (isTransactionIntent) {
    // 3.1 Extract Credit Period Days (e.g. "15 din ke liye", "1 mahina")
    let creditPeriodDays = 15;
    const daysMatch = clean.match(/(\d+)\s*(दिन|din|days)/i);
    if (daysMatch && daysMatch[1]) {
      creditPeriodDays = parseInt(daysMatch[1], 10);
    } else if (/महीना|महीने|mahina|mahine|1 month/i.test(clean)) {
      creditPeriodDays = 30;
    } else if (/हफ्ता|हफ़्ते|hafta|week/i.test(clean)) {
      creditPeriodDays = 7;
    }

    // 3.2 Extract Amount (Accurately ignores quantity units like '10 kg', '2 packet', '15 din')
    let amount = 0;
    const textWithoutDays = clean.replace(/(\d+)\s*(दिन|din|days|mahina|mahine|महीने|महीना|हफ्ता|hafta|week)/gi, ' ');

    // Rule A: Number explicitly tied to currency markers (₹500, 500 रुपये, 500 rs)
    const currMatch = textWithoutDays.match(/(?:₹|रुपये|रुपया|rupaye|rupee|rupees|rs\.?)\s*(\d+(\.\d+)?)/i) ||
                      textWithoutDays.match(/(\d+(\.\d+)?)\s*(?:₹|रुपये|रुपया|rupaye|rupee|rupees|rs\.?)/i);

    if (currMatch && currMatch[1]) {
      amount = parseFloat(currMatch[1]);
    } else {
      // Rule B: Number directly preceding or following transaction action words: e.g. "500 उधार", "250 जमा", "500 लिख लो"
      const txMatch = textWithoutDays.match(/(\d+(\.\d+)?)\s*(?:उधार|udhar|udhaar|जमा|jama|पेमेंट|paid|क्रेडिट|credit|लिखो|लिख लो|लिख दे|बाकी)/i) ||
                      textWithoutDays.match(/(?:उधार|udhar|udhaar|जमा|jama|पेमेंट|paid|क्रेडिट|credit)\s*(\d+(\.\d+)?)/i);
      if (txMatch && (txMatch[1] || txMatch[2])) {
        amount = parseFloat(txMatch[1] || txMatch[2]);
      } else {
        // Rule C: Strip item quantities (5 kg, 2 packet, 10 piece) and pick the remaining money amount
        const cleanWithoutQty = textWithoutDays
          .replace(/(\d+(\.\d+)?)\s*(?:पैकेट|packet|packets|pkt|pkts|किलो|किलोग्राम|kg|kilo|kilos|लीटर|ltr|litre|liter|पीस|piece|pieces|pcs|बोरी|bori|कार्टन|carton|पेटी|दर्जन|dozen|बोतल|bottle|ग्राम|gm)/gi, ' ');

        const allNumbers = cleanWithoutQty.match(/\d+(\.\d+)?/g);
        if (allNumbers && allNumbers.length > 0) {
          // In Hindi speech: "Ramesh 500" -> 500, "Ramesh 5 kilo aata 250" -> 250
          amount = parseFloat(allNumbers[allNumbers.length - 1]);
        }
      }
    }

    // 3.3 Determine Udhaar vs Jama
    let txType: 'udhaar' | 'jama' = 'udhaar';
    const isCustomerGave = /ने.+?(?:दिए|दिया|जमा किया|पेमेंट किया)|ने\s*(\d+)?\s*(?:₹|रुपये)?\s*(?:दिए|दिया|जमा)|से मिला|से मिले|से आया|से आए|से ले लिया|दे गया|दे गए|कैश मिला|पेमेंट आया|received\s+from|got\s+from|paid\s+by/i.test(clean);
    const isOnline = /(phonepe|फोनपे|gpay|गूगल पे|paytm|पेटीएम|online payment|online paid)/i.test(clean);

    if (hasJamaKeywords || isCustomerGave || isOnline) {
      if (hasUdhaarKeywords && !isCustomerGave && !hasJamaKeywords) {
        txType = 'udhaar';
      } else {
        txType = 'jama';
      }
    } else {
      txType = 'udhaar';
    }

    // 3.4 Match or Extract Customer Name (with Bilingual English-Hindi matching)
    let matchedCustomer: Customer | undefined = matchedExistingCust;

    // Check by Phone number if spoken
    if (!matchedCustomer) {
      const phoneMatch = clean.match(/\b\d{10}\b/);
      if (phoneMatch) {
        matchedCustomer = knownCustomers.find(c => c.phone && c.phone.includes(phoneMatch[0]));
      }
    }

    let customerName = matchedCustomer ? matchedCustomer.name : '';

    // If customerName not yet determined, extract candidate name from speech
    if (!customerName) {
      // Clean non-name tokens to extract name cleanly
      let candText = normalizedText;

      // Remove amounts
      if (amount > 0) {
        candText = candText.replace(new RegExp(`\\b${amount}\\b`, 'g'), '');
      }
      candText = candText.replace(/\b\d+(\.\d+)?\b/g, '');

      // Remove currency markers
      candText = candText.replace(/(?:₹|रुपये|रुपया|rupaye|rupee|rupees|rs\.?)/gi, '');

      // Remove credit period words
      candText = candText.replace(/(\d+)?\s*(?:दिन|din|days|mahina|mahine|महीने|महीना|हफ्ता|hafta|week|ke\s*liye|के\s*लिए)/gi, '');

      // Remove action keywords
      candText = candText.replace(/\b(?:udhar|udhaar|jama|paid|payment|credit|debit|likh|likho|likh\s*lo|likh\s*do|likh\s*dena|entry|khata|cash|phonepe|gpay|paytm|online)\b/gi, '');
      candText = candText.replace(/(?:उधार|जमा|पेमेंट|क्रेडिट|डेबिट|लिखो|लिख\s*लो|लिख\s*देना|लिख\s*दो|दर्ज\s*करो|दर्ज|खाते\s*में|खाता|कैश|नकद|नगद|फोनपे|गूगल\s*पे|पेटीएम|ऑनलाइन)/gi, '');
      candText = candText.replace(/(?:ने\s*दिए|ने\s*दिया|को\s*दिया|को\s*दिए|से\s*मिला|से\s*मिले|से\s*आया|से\s*आए|दे\s*गया|ले\s*गया|मिला|आया|दिए|दिया|बाकी|चुकता|वसूल)/gi, '');

      // Remove grammar particles
      candText = candText.replace(/\b(?:to|for|from|by|bhai|ji|saab|account)\b/gi, '');
      candText = candText.replace(/(?:को|ने|से|का|की|के|में|भाई|जी|बाबू|साहब|साहबजी)/gi, '');

      // Remove item quantities (e.g. 5 किलो आटा -> retain or separate)
      candText = candText.replace(/(?:पैकेटों|पैकेट|किलोग्राम|किलो|लीटरों|लीटर|पीस|बोरी|कार्टन|पेटी|दर्जन|बोतल|ग्राम|kg|ltr|packet|bori|pcs)/gi, '');

      // Strip excess whitespace and punctuation
      const nameCandidate = candText.replace(/[.,/#!$%^&*;:{}=\-_`~()?"'₹]/g, ' ').replace(/\s+/g, ' ').trim();

      if (nameCandidate && nameCandidate.length >= 2) {
        // If multiple words remain, take the first 1-2 words as name
        const tokens = nameCandidate.split(' ').filter(t => t.length >= 2 && !/^(bolkar|bol|voice|add|namaste|hello|aaj|kal|aur|bhi)$/i.test(t));
        if (tokens.length > 0) {
          const candidateStr = tokens.slice(0, 2).join(' ');
          // Check if candidate matches any known customer
          const found = findEquivalentCustomer(candidateStr, knownCustomers);
          if (found) {
            matchedCustomer = found;
            customerName = found.name;
          } else {
            customerName = isEn ? capitalizeWords(candidateStr) : candidateStr;
          }
        }
      }

      // Fallback
      if (!customerName) {
        customerName = isEn ? 'Customer' : 'नया ग्राहक';
      }
    }

    // 3.5 Item / Payment Notes
    let noteDesc = txType === 'udhaar' ? (isEn ? 'Credit goods' : 'उधार माल') : (isEn ? 'Payment received' : 'जमा राशि');
    if (/phonepe|फोनपे/i.test(clean)) noteDesc = 'PhonePe ऑनलाइन भुगतान';
    else if (/gpay|गूगल पे/i.test(clean)) noteDesc = 'Google Pay ऑनलाइन भुगतान';
    else if (/paytm|पेटीएम/i.test(clean)) noteDesc = 'Paytm ऑनलाइन भुगतान';
    else if (/कैश|नकद|नगद|cash/i.test(clean)) noteDesc = isEn ? 'Cash payment' : 'नकद कैश भुगतान';
    else {
      // If shopkeeper spoke items like "5 किलो आटा" or "2 पैकेट बिस्कुट", capture it as note!
      const itemMatch = normalizedText.match(/(\d+\s*(?:किलो|लीटर|पैकेट|बोरी|पीस|पैकेटों|kg|ltr|packet|bori|pcs)?\s*[a-zA-Z\u0900-\u097F]+)/i);
      if (itemMatch && itemMatch[1] && !itemMatch[1].includes('रुपये') && !itemMatch[1].includes('दिन')) {
        const candItem = itemMatch[1].trim();
        if (candItem.length > 2 && candItem !== customerName) {
          noteDesc = candItem;
        }
      }
    }

    const confirmSpeech = isEn
      ? (txType === 'udhaar'
          ? `Adding credit of ₹${amount} for ${customerName}.`
          : `Payment of ₹${amount} received from ${customerName}.`)
      : (txType === 'udhaar'
          ? `${customerName} के खाते में ₹${amount} उधार दर्ज!`
          : `${customerName} से ₹${amount} जमा प्राप्त!`);

    return {
      intent: 'transaction',
      customerName,
      customerId: matchedCustomer ? matchedCustomer.id : undefined,
      customer: matchedCustomer,
      type: txType,
      amount,
      creditPeriodDays: txType === 'udhaar' ? creditPeriodDays : undefined,
      notes: noteDesc,
      confidence: 0.98,
      confirmationSpeech: confirmSpeech
    };
  }

  // -------------------------------------------------------------------------
  // 4. CASE: PRODUCT / INVENTORY ENTRY (Kharid & Bikri)
  // -------------------------------------------------------------------------
  // 4.1 Unit of measurement
  let unit = 'पैकेट';
  if (/किलो|किलोग्राम|kg|kilo/i.test(clean)) unit = 'किलो';
  else if (/लीटर|लीटरों|ltr|litre|liter/i.test(clean)) unit = 'लीटर';
  else if (/पीस|piece|pieces|pcs|pc/i.test(clean)) unit = 'पीस';
  else if (/बोरी|bori|bag|bags/i.test(clean)) unit = 'बोरी';
  else if (/कार्टन|पेटी|carton|peti/i.test(clean)) unit = 'कार्टन';
  else if (/दर्जन|dozen/i.test(clean)) unit = 'दर्जन';
  else if (/बोतल|bottle/i.test(clean)) unit = 'बोतल';
  else if (/ग्राम|gm|gram/i.test(clean)) unit = 'ग्राम';

  // 4.2 Quantity (Stock to add)
  let quantity = 10;
  const qtyMatch = clean.match(/(\d+(\.\d+)?)\s*(?:पैकेट|packet|packets|pkt|pkts|किलो|kg|kgs|kilo|लीटर|ltr|litre|liter|पीस|pcs|piece|pieces|बोरी|bori|कार्टन|carton|पेटी|peti|दर्जन|dozen|बोतल|bottle|ग्राम|gm)/i) ||
                   clean.match(/(?:स्टॉक|स्टॉक में|जोड़ो|जोड़ दो|add|add stock)\s*(\d+(\.\d+)?)/i) ||
                   clean.match(/(\d+(\.\d+)?)\s*(?:स्टॉक|जोड़ो|जोड़ दो|add|in stock)/i);
  if (qtyMatch && qtyMatch[1]) {
    quantity = parseFloat(qtyMatch[1]);
  }

  // 4.3 Purchase Price & Selling Price
  let purchasePrice = 0;
  let sellingPrice = 0;

  const buyMatch = clean.match(/(?:खरीद|kharid|buy|buying|purchase|cost)\s*(?:रेट|मूल्य|भाव|rate|price|at|₹|rs\.?|रुपये)?\s*(\d+(\.\d+)?)/i);
  const sellMatch = clean.match(/(?:बिक्री|bikri|sell|selling|sale|mrp|एमआरपी|बेचेंगे)\s*(?:रेट|मूल्य|भाव|rate|price|at|₹|rs\.?|रुपये)?\s*(\d+(\.\d+)?)/i);

  if (buyMatch && buyMatch[1]) purchasePrice = parseFloat(buyMatch[1]);
  if (sellMatch && sellMatch[1]) sellingPrice = parseFloat(sellMatch[1]);

  if (purchasePrice === 0 && sellingPrice === 0) {
    const allNumbers = (clean.match(/\d+(\.\d+)?/g) || []).map(n => parseFloat(n));
    const priceCandidates = allNumbers.filter(n => n !== quantity);

    if (priceCandidates.length >= 2) {
      purchasePrice = priceCandidates[0];
      sellingPrice = priceCandidates[1];
    } else if (priceCandidates.length === 1) {
      const singlePrice = priceCandidates[0];
      if (/खरीद|kharid|buy|cost/i.test(clean)) {
        purchasePrice = singlePrice;
        sellingPrice = Math.round(singlePrice * 1.15);
      } else {
        sellingPrice = singlePrice;
        purchasePrice = Math.round(singlePrice * 0.85);
      }
    }
  }

  // Check known product match from database (with Bilingual English-Hindi matching)
  let matchedProd = matchedExistingProd;

  if (matchedProd) {
    if (purchasePrice === 0) purchasePrice = Number(matchedProd.purchase_price) || 0;
    if (sellingPrice === 0) sellingPrice = Number(matchedProd.selling_price) || 0;
    if (unit === 'पैकेट' && matchedProd.unit) unit = matchedProd.unit;
  }

  if (purchasePrice === 0 && sellingPrice === 0) {
    purchasePrice = 50;
    sellingPrice = 60;
  } else if (sellingPrice === 0 && purchasePrice > 0) {
    sellingPrice = Math.round(purchasePrice * 1.2);
  } else if (purchasePrice === 0 && sellingPrice > 0) {
    purchasePrice = Math.round(sellingPrice * 0.85);
  }

  // 4.4 Extract Product Name
  let prodName = '';
  if (matchedProd) {
    prodName = matchedProd.name;
  } else {
    prodName = originalTrimmed
      .replace(/\b\d+(\.\d+)?\b/g, '')
      .replace(/(?:₹|रुपये|रुपया|rupaye|rupee|rupees|rs\.?)/gi, '')
      .replace(/\b(?:packets|packet|pkts|pkt|kilos|kilo|kg|litres|litre|liters|liter|ltr|pieces|piece|pcs|bori|cartons|carton|peti|dozens|dozen|bottles|bottle|grams|gram|gm)\b/gi, '')
      .replace(/(?:पैकेटों|पैकेट|किलोग्राम|किलो|लीटरों|लीटर|पीस|बोरी|कार्टन|पेटी|दर्जन|बोतल|ग्राम|डब्बा|डिब्बा|पाउच)/gi, '')
      .replace(/\b(?:buying|buy|purchase|cost|selling|sale|sell|mrp|price|rate|at)\b/gi, '')
      .replace(/(?:खरीद|kharid|बिक्री|bikri|एमआरपी|बेचेंगे|रेट|भाव|कीमत)/gi, '')
      .replace(/\b(?:add\s+to\s+stock|add\s+stock|add|update|stock|item|product|new)\b/gi, '')
      .replace(/(?:स्टॉक\s*में\s*जोड़ो|स्टॉक\s*जोड़ो|स्टॉक|जोड़ो|जोड़\s*दो|ऐड\s*करो|करो|कर\s*देना|डालो|डाल\s*दो|नया|सामान|प्रोडक्ट|आइटम)/gi, '')
      .replace(/\b(?:of|in|to|the|and|for)\b/gi, '')
      .replace(/(?:में|का|की|के|और|है|था|को|पर)/gi, '')
      .trim();

    if (!prodName || prodName.length < 2) {
      prodName = isEn ? 'New Product' : 'नया सामान';
    } else if (isEn) {
      prodName = capitalizeWords(prodName);
    }
  }

  // 4.5 Auto Category
  let category = matchedProd?.category || 'किराना';
  if (/तेल|रिफाइंड|सरसों|घी|डालडा|oil|ghee/i.test(prodName)) category = 'खाद्य तेल व घी';
  else if (/चीनी|गुड़|शक्कर|मीठा|sugar/i.test(prodName)) category = 'चीनी व गुड़';
  else if (/आटा|चावल|दाल|चना|मैदा|सूजी|बेसन|flour|rice|pulse|wheat/i.test(prodName)) category = 'अनाज व दालें';
  else if (/मसाला|मिर्च|हल्दी|धनिया|जीरा|नमक|spice|salt/i.test(prodName)) category = 'मसाले';
  else if (/साबुन|सर्फ|शैम्पू|पेस्ट|ब्रश|डिटर्जेंट|कोलगेट|soap|shampoo|paste/i.test(prodName)) category = 'प्रसाधन व सफाई';
  else if (/बिस्कुट|मैगी|नूडल्स|नमकीन|चिप्स|चॉकलेट|biscuit|maggi|chips/i.test(prodName)) category = 'स्नैक्स व बिस्कुट';
  else if (/चाय|कॉफी|दूध|कोल्डड्रिंक|पानी|tea|coffee|milk/i.test(prodName)) category = 'पेय पदार्थ';

  const confirmProductSpeech = isEn
    ? `${prodName} (${quantity} ${unit}) saved.`
    : `${prodName} (${quantity} ${unit}) का स्टॉक सेव!`;

  return {
    intent: 'product',
    name: prodName,
    productName: prodName,
    category,
    unit,
    purchasePrice,
    sellingPrice,
    quantity,
    confidence: 0.98,
    confirmationSpeech: confirmProductSpeech
  };
}
