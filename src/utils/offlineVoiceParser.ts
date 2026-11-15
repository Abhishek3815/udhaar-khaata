import { Customer, Product, VoiceParseResult } from '../types';

function isSpokenEnglish(text: string): boolean {
  return !/[\u0900-\u097F]/.test(text) && /[a-zA-Z]/.test(text);
}

function capitalizeWords(str: string): string {
  return str.replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Client-Side Smart Voice Parser for Dukaan Khaata SaaS
 * Works 100% offline and online without waiting for external server or API keys.
 * Intelligently classifies speech into:
 *  1. Customer Ledger Transaction: 'udhaar' vs 'jama' (Hindi & English)
 *  2. Product Inventory: Add new product / Update stock & prices (Hindi & English)
 *  3. Mandi Alert: Price fluctuation broadcast
 */
export function parseSpokenDukaanVoice(
  speechText: string,
  knownCustomers: Customer[] = [],
  knownProducts: Product[] = []
): VoiceParseResult {
  const text = speechText.trim();
  const clean = text.toLowerCase();
  const isEn = isSpokenEnglish(text);

  // 1. MANDI ALERT DETECTION
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

    let prodName = text
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
      notes: text,
      confidence: 0.95,
      confirmationSpeech: confirmSpeech
    };
  }

  // 2. DETECT PRODUCT vs TRANSACTION INTENT
  // Units of measurement (Hindi & English)
  const hasUnit = /(पैकेट|पैकेटों|packet|packets|pkt|pkts|किलो|किलोग्राम|kg|kgs|kilo|kilos|लीटर|लीटरों|ltr|ltrs|liter|liters|litre|litres|पीस|piece|pieces|pcs|pc|बोरी|bori|कार्टन|carton|cartons|पेटी|peti|दर्जन|dozen|dozens|बोतल|bottle|bottles|ग्राम|gm|gms|gram|grams|डब्बा|डिब्बा|पाउच|pouch|pouches)/i.test(clean);

  // Product / Stock keywords (Hindi & English)
  const hasProductKeywords = /(प्रोडक्ट|सामान|माल|स्टॉक|इन्वेंटरी|आइटम|item|items|product|products|stock|inventory|खरीद|बिक्री|purchase|buying|buy|cost|sell|selling|sale|mrp|एमआरपी|थोक भाव|थोक रेट|बिक्री रेट|रेट बदलो|स्टॉक बढ़ाओ|स्टॉक जोड़ो)/i.test(clean);

  // Inventory action verbs (add stock)
  const hasInventoryAction = /(स्टॉक में जोड़ो|स्टॉक जोड़ो|स्टॉक बढ़ाओ|स्टॉक करो|जोड़ दो|जोड़ो|ऐड करो|add\s+to\s+stock|add\s+stock|add\s+product|update\s+stock|add\s+\d+|नया सामान)/i.test(clean);

  // Check if spoken phrase mentions any known product in store
  const matchedProductFromDb = knownProducts.find(p => {
    const pName = p.name.toLowerCase().trim();
    const tokens = pName.split(/[\s\(\)]+/).filter(t => t.length >= 3);
    return tokens.some(t => clean.includes(t)) || clean.includes(pName);
  });

  // Customer relation keywords (gives or takes money)
  const hasCustomerRelation = /(को उधार|को दिया|को दिए|को दे दो|का बाकी|खाते में लिखो|खाते में जोड़ो|ने दिया|ने दिए|ने जमा किया|से मिला|से आए|से ले लिया|ग्राहक|customer|credit\s+to|credit\s+for|give\s+udhar|paid\s+by|received\s+from|from\s+(?!stock|inventory|store|shop)[a-z]+|to\s+(?!stock|inventory|store|shop)[a-z]+)/i.test(clean);

  // Determine if it is a Product Intent:
  // If user mentions unit, stock action, or product keywords, and does NOT have explicit customer relation like "को उधार", "ने जमा", "credit to", "paid by"
  const hasExplicitCustomerTx = /(को उधार|को दिया|को दिए|ने दिया|ने दिए|ने जमा|से मिला|credit\s+to|credit\s+for|give\s+udhar|paid\s+by|received\s+from)/i.test(clean);
  const isProductIntent = !hasExplicitCustomerTx && (
    hasUnit ||
    hasProductKeywords ||
    hasInventoryAction ||
    (matchedProductFromDb && /(स्टॉक|भाव|रेट|पैकेट|किलो|लीटर|पीस|जोड़ो|कीमत|add|stock|buy|sell|price)/i.test(clean))
  );

  // -------------------------------------------------------------------------
  // 3. CASE: PRODUCT / INVENTORY ENTRY
  // -------------------------------------------------------------------------
  if (isProductIntent) {
    // 3.1 Extract Unit
    let unit = 'पैकेट';
    if (/किलो|किलोग्राम|kg|kilo/i.test(clean)) unit = 'किलो';
    else if (/लीटर|लीटरों|ltr|litre|liter/i.test(clean)) unit = 'लीटर';
    else if (/पीस|piece|pieces|pcs|pc/i.test(clean)) unit = 'पीस';
    else if (/बोरी|bori|bag|bags/i.test(clean)) unit = 'बोरी';
    else if (/कार्टन|पेटी|carton|peti/i.test(clean)) unit = 'कार्टन';
    else if (/दर्जन|dozen/i.test(clean)) unit = 'दर्जन';
    else if (/बोतल|bottle/i.test(clean)) unit = 'बोतल';
    else if (/ग्राम|gm|gram/i.test(clean)) unit = 'ग्राम';
    else if (matchedProductFromDb) unit = matchedProductFromDb.unit || 'पैकेट';

    // 3.2 Extract Quantity (look for number before unit or stock action)
    let quantity = 10;
    const qtyMatch = clean.match(/(\d+(\.\d+)?)\s*(?:पैकेट|packet|packets|pkt|pkts|किलो|kg|kgs|kilo|लीटर|ltr|litre|liter|पीस|pcs|piece|pieces|बोरी|bori|कार्टन|carton|पेटी|peti|दर्जन|dozen|बोतल|bottle|ग्राम|gm)/i) ||
                     clean.match(/(?:स्टॉक|स्टॉक में|जोड़ो|जोड़ दो|add|add stock)\s*(\d+(\.\d+)?)/i) ||
                     clean.match(/(\d+(\.\d+)?)\s*(?:स्टॉक|जोड़ो|जोड़ दो|add|in stock)/i);

    if (qtyMatch && qtyMatch[1]) {
      quantity = parseFloat(qtyMatch[1]);
    }

    // 3.3 Extract Prices
    let purchasePrice = 0;
    let sellingPrice = 0;

    // Pattern A: "खरीद 120 बिक्री 140" or "buy 120 sell 140" or "buying 120 selling 140"
    const buyMatch = clean.match(/(?:खरीद|kharid|buy|buying|purchase|cost)\s*(?:रेट|मूल्य|भाव|rate|price|at|₹|rs\.?|रुपये)?\s*(\d+(\.\d+)?)/i);
    const sellMatch = clean.match(/(?:बिक्री|bikri|sell|selling|sale|mrp|एमआरपी|बेचेंगे)\s*(?:रेट|मूल्य|भाव|rate|price|at|₹|rs\.?|रुपये)?\s*(\d+(\.\d+)?)/i);

    if (buyMatch && buyMatch[1]) purchasePrice = parseFloat(buyMatch[1]);
    if (sellMatch && sellMatch[1]) sellingPrice = parseFloat(sellMatch[1]);

    // Pattern B: Two numbers spoken (e.g. "12 खरीद 15 बिक्री" or "100 और 120" or "buy 10 sell 12")
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

    // Fallbacks if prices still missing
    if (matchedProductFromDb) {
      if (purchasePrice === 0) purchasePrice = Number(matchedProductFromDb.purchase_price) || 0;
      if (sellingPrice === 0) sellingPrice = Number(matchedProductFromDb.selling_price) || 0;
    }
    if (purchasePrice === 0 && sellingPrice === 0) {
      purchasePrice = 50;
      sellingPrice = 60;
    } else if (sellingPrice === 0 && purchasePrice > 0) {
      sellingPrice = Math.round(purchasePrice * 1.2);
    } else if (purchasePrice === 0 && sellingPrice > 0) {
      purchasePrice = Math.round(sellingPrice * 0.85);
    }

    // 3.4 Extract Product Name
    let prodName = '';
    if (matchedProductFromDb) {
      prodName = matchedProductFromDb.name;
    } else {
      prodName = text
        .replace(/\b\d+(\.\d+)?\b/g, '')
        .replace(/(?:₹|रुपये|रुपया|rupaye|rupee|rupees|rs\.?)/gi, '')
        .replace(/\b(?:packets|packet|pkts|pkt|kilos|kilo|kg|litres|litre|liters|liter|ltr|pieces|piece|pcs|bori|cartons|carton|peti|dozens|dozen|bottles|bottle|grams|gram|gm|boxes|box|pouches|pouch)\b/gi, '')
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

    // 3.5 Category auto-detection
    let category = matchedProductFromDb?.category || 'सामान्य किराना';
    if (/तेल|रिफाइंड|सरसों|घी|डालडा|oil|ghee/i.test(prodName)) category = 'खाद्य तेल व घी';
    else if (/चीनी|गुड़|शक्कर|मीठा|sugar/i.test(prodName)) category = 'चीनी व गुड़';
    else if (/आटा|चावल|दाल|चना|मैदा|सूजी|बेसन|flour|rice|pulse|wheat/i.test(prodName)) category = 'अनाज व दालें';
    else if (/मसाला|मिर्च|हल्दी|धनिया|जीरा|नमक|spice|salt/i.test(prodName)) category = 'मसाले';
    else if (/साबुन|सर्फ|शैम्पू|पेस्ट|ब्रश|डिटर्जेंट|कोलगेट|soap|shampoo|paste/i.test(prodName)) category = 'प्रसाधन व सफाई';
    else if (/बिस्कुट|मैगी|नूडल्स|नमकीन|चिप्स|चॉकलेट|biscuit|maggi|chips/i.test(prodName)) category = 'स्नैक्स व बिस्कुट';
    else if (/चाय|कॉफी|दूध|कोल्डड्रिंक|पानी|tea|coffee|milk/i.test(prodName)) category = 'पेय पदार्थ';

    const speechMessage = isEn
      ? (matchedProductFromDb
          ? `${prodName} stock ${quantity} ${unit} ready. Say 'yes' or 'confirm' to update.`
          : `${prodName} ${quantity} ${unit}, buy ₹${purchasePrice} and sell ₹${sellingPrice}. Say 'yes' or 'confirm' to save.`)
      : (matchedProductFromDb
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
      confidence: 0.95,
      confirmationSpeech: speechMessage
    };
  }

  // -------------------------------------------------------------------------
  // 4. CASE: CUSTOMER LEDGER TRANSACTION (UDHAAR VS JAMA)
  // -------------------------------------------------------------------------

  // 4.1 Extract Amount
  let amount = 0;
  // Clean day counts like "15 din" or "10 days" so they don't get misidentified as money
  const textWithoutDays = clean.replace(/(\d+)\s*(दिन|din|days|mahina|mahine|महीने|महीना)/gi, ' ');

  const rupeeMatch = textWithoutDays.match(/(?:₹|रुपये|रुपया|rupaye|rupee|rupees|rs\.?)\s*(\d+(\.\d+)?)/i) ||
                     textWithoutDays.match(/(\d+(\.\d+)?)\s*(?:₹|रुपये|रुपया|rupaye|rupee|rupees|rs\.?)/i);

  if (rupeeMatch && rupeeMatch[1]) {
    amount = parseFloat(rupeeMatch[1]);
  } else {
    // Look for standalone numbers
    const numMatch = textWithoutDays.match(/(\d+(\.\d+)?)/);
    if (numMatch && numMatch[1]) {
      amount = parseFloat(numMatch[1]);
    }
  }

  // Hindi spoken words fallback for amounts
  if (amount === 0) {
    if (/डेढ़ सौ|dedh sau/i.test(clean)) amount = 150;
    else if (/ढाई सौ|dhai sau/i.test(clean)) amount = 250;
    else if (/साढ़े तीन सौ/i.test(clean)) amount = 350;
    else if (/साढ़े चार सौ/i.test(clean)) amount = 450;
    else if (/साढ़े पांच सौ|साढ़े पाँच सौ/i.test(clean)) amount = 550;
    else if (/हजार|हज़ार|hazar|thousand/i.test(clean)) amount = 1000;
    else if (/दो हजार|दो हज़ार/i.test(clean)) amount = 2000;
    else if (/सौ|sau|hundred/i.test(clean)) amount = 100;
  }

  // 4.2 Distinguish Udhaar vs Jama (Hindi & English)
  // JAMA: Customer gives payment
  const isExplicitJama = /जमा|जमा किया|जमा कर दो|जमा लिखो|जमा करो|jama|paid|payment|pay|received|receive|got|collected|settled|पेमेंट|भुगतान|वसूल|चुकाया|खाता चुकता/i.test(clean);
  const isCustomerGave = /ने.+?(?:दिए|दिया|जमा किया|पेमेंट किया)|ने\s*(\d+)?\s*(?:₹|रुपये)?\s*(?:दिए|दिया|जमा)|से मिला|से मिले|से आया|से आए|से ले लिया|दे गया|दे गए|कैश मिला|पेमेंट आया|received\s+from|got\s+from|paid\s+by|from\s+[a-zA-Z\u0900-\u097F]+\s*(?:paid|gave)/i.test(clean) ||
                         /^[a-zA-Z\u0900-\u097F\s]+\s+(?:paid|gave|deposited)\s+\d+/i.test(clean);
  const isOnlinePayment = /(phonepe|फोनपे|gpay|गूगल पे|paytm|पेटीएम|ऑनलाइन जमा|online payment|online paid)/i.test(clean);

  // UDHAAR: Shopkeeper gives credit / goods to customer
  const isExplicitUdhaar = /उधार|उधार दिया|उधार दिए|उधार लिखो|उधार में|udhar|udhaar|क्रेडिट|credit|debit|lent|खाते में लिखो|लिख लो|लिख ले|लिख देना|on credit/i.test(clean);
  const isShopkeeperGave = /को.+?(?:दिए|दिया|उधार दिया)|को\s*(\d+)?\s*(?:₹|रुपये)?\s*(?:दिए|दिया|उधार)|का बाकी|का उधार|give\s+.+?\s*(?:to|for)|credit\s+to|credit\s+for|lent\s+to|debit\s+to/i.test(clean);

  let txType: 'udhaar' | 'jama' = 'udhaar';

  if (isExplicitJama || isCustomerGave || isOnlinePayment) {
    // If explicit udhaar is also present, check precedence
    if (isExplicitUdhaar && !isCustomerGave && !isExplicitJama) {
      txType = 'udhaar';
    } else {
      txType = 'jama';
    }
  } else if (isExplicitUdhaar || isShopkeeperGave) {
    txType = 'udhaar';
  } else {
    // Default fallback: if words like "दिया" without "ने", default to udhaar
    txType = 'udhaar';
  }

  // 4.3 Match Customer Name
  let matchedCustomer: Customer | undefined = undefined;

  // Step A: Exact / full name match
  for (const c of knownCustomers) {
    const raw = c.name.toLowerCase().trim();
    if (clean.includes(raw)) {
      matchedCustomer = c;
      break;
    }
  }

  // Step B: First name match (e.g. "अमित" in "अमित कुमार" or "Ramesh" in "Ramesh Kumar")
  if (!matchedCustomer) {
    for (const c of knownCustomers) {
      const raw = c.name.toLowerCase().trim();
      const firstName = raw.split(/[\s\(\)]+/)[0];
      if (firstName && firstName.length >= 2 && clean.includes(firstName)) {
        matchedCustomer = c;
        break;
      }
    }
  }

  // Step C: Token match (length >= 3)
  if (!matchedCustomer) {
    for (const c of knownCustomers) {
      const raw = c.name.toLowerCase().trim();
      const tokens = raw.split(/[\s\(\)]+/).filter(t => t.length >= 3);
      for (const tok of tokens) {
        if (clean.includes(tok)) {
          matchedCustomer = c;
          break;
        }
      }
      if (matchedCustomer) break;
    }
  }

  let customerName = matchedCustomer ? matchedCustomer.name : '';

  if (!customerName) {
    // Pattern 1 (English preposition): "to <name>", "for <name>", "from <name>", "by <name>"
    const engPrepMatch = clean.match(/(?:to|for|from|by)\s+([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)/i);
    if (engPrepMatch && engPrepMatch[1]) {
      const cand = engPrepMatch[1].trim();
      if (!/^(cash|online|phonepe|gpay|paytm|udhar|jama|credit|store|shop|me|us|account)$/i.test(cand)) {
        customerName = isEn ? capitalizeWords(cand) : cand;
      }
    }

    // Pattern 2 (English subject): "<name> paid ...", "<name> gave ..."
    if (!customerName) {
      const engSubjMatch = clean.match(/^([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)\s+(?:paid|gave|received|took|has paid)/i);
      if (engSubjMatch && engSubjMatch[1]) {
        const cand = engSubjMatch[1].trim();
        if (!/^(give|add|please|record|we|i|customer)$/i.test(cand)) {
          customerName = isEn ? capitalizeWords(cand) : cand;
        }
      }
    }

    // Pattern 3 (Hindi prepositions): "<name> को", "<name> ने", "<name> से"
    if (!customerName) {
      const beforePart = text.split(/(?:\s+को|\s+ने|\s+से|\s+का|\s+की|\s+udhar|\s+udhaar|\s+jama|\s+जमा|\s+उधार|\s+\d+)/i)[0].trim();
      if (beforePart && beforePart.length >= 2 && !/^(bolkar|bol|voice|add|likh|likho|khata|entry|namaste|hello|give|record)$/i.test(beforePart)) {
        customerName = isEn ? capitalizeWords(beforePart) : beforePart;
      }
    }

    // Pattern 4: Fallback strip noise words
    if (!customerName) {
      const wordsLeft = text
        .replace(/\b\d+(\.\d+)?\b/g, '')
        .replace(/(?:₹|रुपये|रुपया|rupaye|rupee|rupees|rs\.?)/gi, '')
        .replace(/(?:उधार|उधार दिया|उधार दिए|बाकी|खाते में लिखो|लिख लो|लिख ले|लिख देना|दे दिया|diye|de do|de dijiye|udhar|udhaar|baki|credit|debit|give|given|add|lent)/gi, '')
        .replace(/(?:जमा|जमा किया|जमा कर दो|जमा लिखो|पैसा आया|भुगतान|पेमेंट|मिला|आ गया|दे गया|ले लिया|jama|paid|mil gaya|received|receive|phonepe|gpay|paytm|cash|नकद|नगद)/gi, '')
        .replace(/(?:को|ने|से|का|की|में|पर|पे|के|to|from|for|by|in|on|at|and|or|the|a|an|is|was|of)/gi, '')
        .replace(/(?:राशन|किराना|सामान|बिल|पर्ची)/gi, '')
        .trim();

      const candidateWords = wordsLeft.split(/\s+/).filter(w => w.length >= 2);
      customerName = candidateWords.length > 0 ? (isEn ? capitalizeWords(candidateWords.join(' ')) : candidateWords.join(' ')) : (isEn ? 'New Customer' : 'नया ग्राहक');
    }
  }

  // 4.4 Note Description
  let noteDesc = txType === 'udhaar' ? (isEn ? 'Credit goods' : 'उधार माल') : (isEn ? 'Payment received' : 'जमा राशि');
  if (/phonepe|फोनपे/i.test(clean)) noteDesc = 'PhonePe ऑनलाइन भुगतान';
  else if (/gpay|गूगल पे/i.test(clean)) noteDesc = 'Google Pay ऑनलाइन भुगतान';
  else if (/paytm|पेटीएम/i.test(clean)) noteDesc = 'Paytm ऑनलाइन भुगतान';
  else if (/कैश|नकद|नगद|cash/i.test(clean)) noteDesc = isEn ? 'Cash payment' : 'नकद कैश भुगतान';
  else if (/राशन|किराना/i.test(clean)) noteDesc = isEn ? 'Grocery items' : 'राशन सामान';
  else if (/तेल|oil/i.test(clean)) noteDesc = isEn ? 'Oil grocery' : 'तेल किराना';
  else if (/चीनी|sugar/i.test(clean)) noteDesc = isEn ? 'Sugar grocery' : 'चीनी किराना';
  else if (/आटा|flour/i.test(clean)) noteDesc = isEn ? 'Flour grocery' : 'आटा किराना';
  else if (/दाल|pulse/i.test(clean)) noteDesc = isEn ? 'Pulse grocery' : 'दाल किराना';

  // 4.5 Credit Period Days
  let creditPeriodDays = 15;
  const daysMatch = clean.match(/(\d+)\s*(दिन|din|days)/i);
  if (daysMatch && daysMatch[1]) {
    creditPeriodDays = parseInt(daysMatch[1], 10);
  } else if (/महीना|महीने|mahina|mahine|1 month/i.test(clean)) {
    creditPeriodDays = 30;
  } else if (/हफ्ता|हफ़्ते|hafta|week/i.test(clean)) {
    creditPeriodDays = 7;
  }

  const finalAmount = amount > 0 ? amount : 100;

  const confirmMsg = isEn
    ? (txType === 'udhaar'
        ? `Adding credit of ₹${finalAmount} for ${customerName}. Say 'yes' or 'confirm' to save.`
        : `Payment of ₹${finalAmount} received from ${customerName}. Say 'yes' or 'confirm' to save.`)
    : (txType === 'udhaar'
        ? `${customerName} के खाते में ₹${finalAmount} उधार लिखा जा रहा है। क्या मैं इसे सेव कर दूँ? बोलें 'हाँ' या 'कन्फर्म'`
        : `${customerName} से ₹${finalAmount} जमा प्राप्त हुआ है। क्या मैं इसे सेव कर दूँ? बोलें 'हाँ' या 'कन्फर्म'`);

  return {
    intent: 'transaction',
    customerName,
    customerId: matchedCustomer ? matchedCustomer.id : undefined,
    customer: matchedCustomer,
    type: txType,
    amount: finalAmount,
    creditPeriodDays: txType === 'udhaar' ? creditPeriodDays : undefined,
    notes: noteDesc,
    confidence: 0.95,
    confirmationSpeech: confirmMsg
  };
}
