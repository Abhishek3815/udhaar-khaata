import { Customer, Product, VoiceParseResult } from '../types';

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
  const compounds: [RegExp, string][] = [
    [/डेढ़\s*हजार|डेढ़\s*हज़ार/gi, '1500'],
    [/ढाई\s*हजार|ढाई\s*हज़ार/gi, '2500'],
    [/साढ़े\s*तीन\s*हजार|साढ़े\s*तीन\s*हज़ार/gi, '3500'],
    [/साढ़े\s*चार\s*हजार|साढ़े\s*चार\s*हज़ार/gi, '4500'],
    [/साढ़े\s*पाँच\s*हजार|साढ़े\s*पांच\s*हजार|साढ़े\s*पाँच\s*हज़ार/gi, '5500'],
    [/डेढ़\s*सौ/gi, '150'],
    [/ढाई\s*सौ/gi, '250'],
    [/साढ़े\s*तीन\s*सौ/gi, '350'],
    [/साढ़े\s*चार\s*सौ/gi, '450'],
    [/साढ़े\s*पाँच\s*सौ|साढ़े\s*पांच\s*सौ/gi, '550'],
    [/(?:एक|1)\s*(?:हजार|हज़ार)/gi, '1000'],
    [/(?:दो|2)\s*(?:हजार|हज़ार)/gi, '2000'],
    [/(?:तीन|3)\s*(?:हजार|हज़ार)/gi, '3000'],
    [/(?:चार|4)\s*(?:हजार|हज़ार)/gi, '4000'],
    [/(?:पांच|पाँच|5)\s*(?:हजार|हज़ार)/gi, '5000'],
    [/(?:दस|10)\s*(?:हजार|हज़ार)/gi, '10000'],
    [/(?:एक|1)\s*सौ/gi, '100'],
    [/(?:दो|2)\s*सौ/gi, '200'],
    [/(?:तीन|3)\s*सौ/gi, '300'],
    [/(?:चार|4)\s*सौ/gi, '400'],
    [/(?:पांच|पाँच|5)\s*सौ/gi, '500'],
    [/(?:छह|छः|6)\s*सौ/gi, '600'],
    [/(?:सात|7)\s*सौ/gi, '700'],
    [/(?:आठ|8)\s*सौ/gi, '800'],
    [/(?:नौ|9)\s*सौ/gi, '900'],
    [/(?:हजार|हज़ार)/gi, '1000'],
    [/सौ/gi, '100'],
    [/\b(?:पचहत्तर)\b/gi, '75'],
    [/\b(?:पचास|pachaas)\b/gi, '50'],
    [/\b(?:चालीस|chalis)\b/gi, '40'],
    [/\b(?:पैंतीस|paintis)\b/gi, '35'],
    [/\b(?:तीस|tees)\b/gi, '30'],
    [/\b(?:पच्चीस|pachees)\b/gi, '25'],
    [/\b(?:बीस|bees)\b/gi, '20'],
    [/\b(?:साठ|saath)\b/gi, '60'],
    [/\b(?:सत्तर|sattar)\b/gi, '70'],
    [/\b(?:अस्सी|assi)\b/gi, '80'],
    [/\b(?:नब्बे|nabbe)\b/gi, '90'],
    [/\b(?:दस|das)\b/gi, '10']
  ];

  let res = str;
  for (const [rgx, rep] of compounds) {
    res = res.replace(rgx, rep);
  }
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
      ? `Mandi alert: ${prodName} new rate ₹${newPrice}. Say 'yes' or 'confirm' to save.`
      : `मंडी अलर्ट: ${prodName} का नया भाव ₹${newPrice} तैयार है। क्या इसे सेव करें? बोलें 'हाँ' या 'कन्फर्म'`;

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
  const hasUdhaarKeywords = /(उधार|udhar|udhaar|क्रेडिट|credit|lent|on credit|बाकी|खाते में लिख|लिख लो|लिख ले|लिख देना|लिख दो|को दे दो|को दिया|को दिए|का बाकी|का उधार|give.+?(?:credit|udhar)|lent to|debit)/i.test(clean);
  const hasJamaKeywords = /(जमा|jama|paid|payment|pay|received|receive|got|collected|settled|पेमेंट|भुगतान|वसूल|चुकाया|खाता चुकता|ने दिए|ने दिया|ने जमा|से मिला|से मिले|से आया|से आए|से ले लिया|दे गया|दे गए|कैश मिला|पेमेंट आया|फोनपे|phonepe|gpay|गूगल पे|पेटीएम|paytm)/i.test(clean);

  // Product Inventory indicators
  const hasInventoryExplicitKeywords = /(खरीद|kharid|purchase|cost|बिक्री|bikri|selling|mrp|एमआरपी|थोक भाव|थोक रेट|बिक्री रेट|स्टॉक में जोड़ो|स्टॉक जोड़ो|स्टॉक बढ़ाओ|स्टॉक करो|add to stock|add stock|update stock|नया प्रोडक्ट|नया सामान)/i.test(clean);
  const hasStockActionOnly = /(स्टॉक|stock)/i.test(clean) && !hasUdhaarKeywords && !hasJamaKeywords;

  // IMPORTANT: If Udhaar or Jama is spoken, it is DEFINITELY a TRANSACTION!
  // (Even if user says "10 kg aata 250 udhar" - "10 kg aata" is the item note, NOT a product creation)
  const isTransactionIntent = hasUdhaarKeywords || hasJamaKeywords || (!hasInventoryExplicitKeywords && !hasStockActionOnly && !/(खरीद|बिक्री|purchase|sell)/i.test(clean));

  // -------------------------------------------------------------------------
  // 3. CASE: CUSTOMER LEDGER TRANSACTION (UDHAAR vs JAMA)
  // -------------------------------------------------------------------------
  if (isTransactionIntent && !hasInventoryExplicitKeywords) {
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

    // Remove days and period mentions first
    const textWithoutDays = clean.replace(/(\d+)\s*(दिन|din|days|mahina|mahine|महीने|महीना|हफ्ता|hafta|week)/gi, ' ');

    // Rule A: Number explicitly tied to currency markers (₹500, 500 रुपये, 500 rs)
    const currMatch = textWithoutDays.match(/(?:₹|रुपये|रुपया|rupaye|rupee|rupees|rs\.?)\s*(\d+(\.\d+)?)/i) ||
                      textWithoutDays.match(/(\d+(\.\d+)?)\s*(?:₹|रुपये|रुपया|rupaye|rupee|rupees|rs\.?)/i);

    if (currMatch && currMatch[1]) {
      amount = parseFloat(currMatch[1]);
    } else {
      // Rule B: Number directly preceding transaction action words: e.g. "500 उधार", "250 जमा", "500 लिख लो"
      const txMatch = textWithoutDays.match(/(\d+(\.\d+)?)\s*(?:उधार|udhar|udhaar|जमा|jama|पेमेंट|paid|क्रेडिट|credit|लिखो|लिख लो|लिख दे|बाकी)/i);
      if (txMatch && txMatch[1]) {
        amount = parseFloat(txMatch[1]);
      } else {
        // Rule C: Strip item quantities (5 kg, 2 packet, 10 piece) and pick the remaining money amount
        const cleanWithoutQty = textWithoutDays
          .replace(/(\d+(\.\d+)?)\s*(?:पैकेट|packet|packets|pkt|pkts|किलो|किलोग्राम|kg|kilo|kilos|लीटर|ltr|litre|liter|पीस|piece|pieces|pcs|बोरी|bori|कार्टन|carton|पेटी|दर्जन|dozen|बोतल|bottle|ग्राम|gm)/gi, ' ');

        const allNumbers = cleanWithoutQty.match(/\d+(\.\d+)?/g);
        if (allNumbers && allNumbers.length > 0) {
          // In Hindi speech, shopkeeper says: "Ramesh 5 kilo aata 250" -> 250 is the price (last number)
          amount = parseFloat(allNumbers[allNumbers.length - 1]);
        }
      }
    }

    if (amount <= 0) amount = 100;

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

    // 3.4 Match or Extract Customer Name
    let matchedCustomer: Customer | undefined = undefined;

    // Priority A: Exact full name match in known customers
    for (const c of knownCustomers) {
      const cLower = c.name.toLowerCase().trim();
      if (clean.includes(cLower)) {
        matchedCustomer = c;
        break;
      }
    }

    // Priority B: Match First Name (e.g. "Ramesh" for "Ramesh Kumar" or "रमेश" for "रमेश जी")
    if (!matchedCustomer) {
      for (const c of knownCustomers) {
        const cLower = c.name.toLowerCase().trim();
        const firstName = cLower.split(/[\s\(\)]+/)[0];
        if (firstName && firstName.length >= 2) {
          const reg = new RegExp(`\\b${firstName}\\b`, 'i');
          if (reg.test(clean) || clean.includes(firstName)) {
            matchedCustomer = c;
            break;
          }
        }
      }
    }

    // Priority C: Match by Phone number if spoken
    if (!matchedCustomer) {
      const phoneMatch = clean.match(/\b\d{10}\b/);
      if (phoneMatch) {
        matchedCustomer = knownCustomers.find(c => c.phone && c.phone.includes(phoneMatch[0]));
      }
    }

    let customerName = matchedCustomer ? matchedCustomer.name : '';

    // If new customer, extract candidate name from speech
    if (!customerName) {
      // Pattern 1: English preposition: "to <name>", "for <name>", "from <name>", "by <name>"
      const engPrep = clean.match(/(?:to|for|from|by)\s+([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)/i);
      if (engPrep && engPrep[1]) {
        const cand = engPrep[1].trim();
        if (!/^(cash|online|phonepe|gpay|paytm|udhar|jama|credit|store|shop|me|us|account)$/i.test(cand)) {
          customerName = isEn ? capitalizeWords(cand) : cand;
        }
      }

      // Pattern 2: Hindi markers: "<name> को", "<name> ने", "<name> से", "<name> का"
      if (!customerName) {
        const hindiMarker = normalizedText.match(/^([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)\s*(?:को|ने|से|का|की)\b/i);
        if (hindiMarker && hindiMarker[1]) {
          const cand = hindiMarker[1].trim();
          if (!/^(bolkar|bol|voice|add|likh|likho|khata|entry|namaste|hello|aaj|kal)$/i.test(cand)) {
            customerName = isEn ? capitalizeWords(cand) : cand;
          }
        }
      }

      // Pattern 3: Words before amount or action word
      if (!customerName) {
        const beforeAction = normalizedText.split(/(?:\s+को|\s+ने|\s+से|\s+udhar|\s+udhaar|\s+jama|\s+जमा|\s+उधार|\s+\d+)/i)[0].trim();
        if (beforeAction && beforeAction.length >= 2 && !/^(bolkar|voice|add|likh|likho|entry|namaste|hello)$/i.test(beforeAction)) {
          customerName = isEn ? capitalizeWords(beforeAction) : beforeAction;
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
          ? `Adding credit of ₹${amount} for ${customerName}. Say 'yes' or 'confirm' to save.`
          : `Payment of ₹${amount} received from ${customerName}. Say 'yes' or 'confirm' to save.`)
      : (txType === 'udhaar'
          ? `${customerName} के खाते में ₹${amount} उधार लिखा जा रहा है। क्या मैं इसे सेव कर दूँ? बोलें 'हाँ' या 'कन्फर्म'`
          : `${customerName} से ₹${amount} जमा प्राप्त हुआ है। क्या मैं इसे सेव कर दूँ? बोलें 'हाँ' या 'कन्फर्म'`);

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

  // Check known product match from database
  const matchedProd = knownProducts.find(p => {
    const pName = p.name.toLowerCase().trim();
    return clean.includes(pName) || pName.split(/[\s\(\)]+/).some(t => t.length >= 3 && clean.includes(t));
  });

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
    ? (matchedProd
        ? `${prodName} stock ${quantity} ${unit} ready. Say 'yes' or 'confirm' to update.`
        : `${prodName} ${quantity} ${unit}, buy ₹${purchasePrice} and sell ₹${sellingPrice}. Say 'yes' or 'confirm' to save.`)
    : (matchedProd
        ? `${prodName} का नया स्टॉक ${quantity} ${unit} तैयार है। क्या इसे जोड़ दूँ? बोलें 'हाँ' या 'कन्फर्म'`
        : `${prodName} (${quantity} ${unit}) खरीद ₹${purchasePrice} व बिक्री ₹${sellingPrice} तैयार है। क्या इसे सेव कर दूँ? बोलें 'हाँ' या 'कन्फर्म'`);

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
