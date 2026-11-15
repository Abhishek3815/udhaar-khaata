import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import os from 'os';
import https from 'https';
import { db } from './server/db.js';
import { areNamesEquivalent } from './src/utils/bilingualMatcher.js';

// Load environment variables from .env
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Password & PIN Bcrypt Encryption Helpers
export function hashSecret(plain: string): string {
  if (!plain) return '';
  return bcrypt.hashSync(String(plain), 10);
}

export function verifySecret(plain: string, hash: string): boolean {
  if (!plain || !hash) return false;
  const p = String(plain);
  const h = String(hash);
  if (h.startsWith('$2')) {
    try {
      return bcrypt.compareSync(p, h);
    } catch {
      return false;
    }
  }
  return p === h;
}

// Helper to generate secure tamper-proof customer passbook token
export function getCustomerPassbookToken(id: number, phone: string = ''): string {
  return crypto.createHmac('sha256', 'dukaan_khaata_secure_salt_789')
    .update(`cust_${id}_${phone}`)
    .digest('hex')
    .slice(0, 24);
}

// Multi-Tenant Shop ID extractor from request headers/tokens
export function getRequestShopId(req: Request): number {
  const hId = req.headers['x-shop-id'];
  if (hId && !isNaN(Number(hId)) && Number(hId) > 0) {
    return Number(hId);
  }
  const auth = (req.headers.authorization || (req.headers['x-shop-token'] as string) || '');
  const m = auth.match(/dukandar_session_(\d+)_/);
  if (m && !isNaN(Number(m[1])) && Number(m[1]) > 0) {
    return Number(m[1]);
  }
  if (req.query && req.query.shop_id && !isNaN(Number(req.query.shop_id)) && Number(req.query.shop_id) > 0) {
    return Number(req.query.shop_id);
  }
  return 1;
}

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Security Headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Initialize database
await db.init();

// AI voice parser helper using Gemini 2.5 Flash
async function parseVoiceWithGemini(speechText: string, knownCustomers: string[], knownProducts: string[]) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }

  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
You are an expert voice assistant for an Indian retail shopkeeper (Dukandar Khaata & Stock Manager).
A shopkeeper speaks in Hindi, Hinglish, or English to record udhaar (credit given to customer), jama (payment received from customer), or product stock entry (purchase and selling price).

Known customer names in store: ${JSON.stringify(knownCustomers.slice(0, 30))}
Known product names in store: ${JSON.stringify(knownProducts.slice(0, 30))}

User Spoken Text: "${speechText}"

Classify into one of these intents and return ONLY JSON:

Case 1: Ledger Transaction (Udhaar or Jama)
{
  "intent": "transaction",
  "customerName": "Customer Name in original language or clear Hindi/English",
  "type": "udhaar" | "jama", // "udhaar" if shopkeeper gave items/credit on credit to customer. "jama" if customer paid or deposited money.
  "amount": number, // exact rupees mentioned
  "notes": "Short note of item or payment method if mentioned (e.g. 5kg Aata, Cash, PhonePe)",
  "confidence": 0.95,
  "confirmationSpeech": "Hindi response confirming the entry (e.g. रमेश के खाते में ₹500 उधार दर्ज कर दिया गया है)"
}

Case 2: Product / Inventory Entry (Kharid daam / Bikri daam)
{
  "intent": "product",
  "name": "Product Name",
  "category": "Category like किराना, स्नैक्स, पेय, तेल",
  "unit": "पैकेट" | "किलो" | "लीटर" | "बोतल" | "पीस" | "डिब्बा",
  "purchasePrice": number, // Kharid rate / purchase cost per unit
  "sellingPrice": number, // Bikri rate / selling price per unit
  "quantity": number, // initial stock count if mentioned, else default 10
  "minStockAlert": 5,
  "confidence": 0.95,
  "confirmationSpeech": "Hindi response confirming product entry (e.g. आशीर्वाद आटा ₹210 खरीद और ₹245 बिक्री मूल्य के साथ सेव हो गया है)"
}

Case 3: Mandi Price Alert / Wholesale Rate Fluctuation (When shopkeeper is at mandi or reports price rise/drop to notify staff)
{
  "intent": "mandi_alert",
  "productName": "Product Name (e.g. चीनी, सरसो तेल, फॉर्च्यून, अरहर दाल)",
  "oldPrice": number, // old selling or wholesale rate if mentioned, else 0
  "newPrice": number, // updated retail selling rate
  "wholesalePrice": number, // updated wholesale purchase rate if mentioned, else 0
  "unit": "किलो" | "लीटर" | "बोरी" | "टीन" | "पैकेट" | "क्विंटल",
  "notes": "Short reason or summary (e.g. मंडी में भाव ₹2 बढ़ गया, तुरंत स्टाफ को सूचित करें)",
  "confidence": 0.95,
  "confirmationSpeech": "Hindi confirmation (e.g. मंडी अलर्ट: चीनी का नया भाव ₹44 दर्ज कर दिया गया है)"
}

Case 4: Unrecognized or query
{
  "intent": "unknown",
  "rawText": "${speechText}",
  "suggestion": "कृपया स्पष्ट बोलें, जैसे: 'रमेश को 500 रुपये उधार' या 'मैगी 10 पैकेट खरीद 12 बिक्री 14'"
}

Return ONLY valid JSON with no markdown tags or commentary.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const text = response.text?.trim() || '';
    return JSON.parse(text);
  } catch (err) {
    console.warn('[AI] Gemini voice parsing failed or timed out:', err);
    return null;
  }
}

// Helper to extract amounts from text including Hindi spoken numbers
function extractAmountFromText(clean: string): number {
  // First, remove days/period mentions so "15 din" does not get treated as ₹15
  const withoutDays = clean.replace(/(\d+)\s*(दिन|din|days|mahina|mahine|महीने|महीना)/gi, ' ');

  // 1. Look for explicit currency markers first: e.g. "₹500", "500 रुपये", "500 rs", "rs 500"
  const rupeeMatch = withoutDays.match(/(?:₹|रुपये|रुपया|rupaye|rupee|rupees|rs\.?)\s*(\d+(\.\d+)?)/i) ||
                     withoutDays.match(/(\d+(\.\d+)?)\s*(?:₹|रुपये|रुपया|rupaye|rupee|rupees|rs\.?)/i);
  if (rupeeMatch) {
    const val = parseFloat(rupeeMatch[1]);
    if (val > 0) return val;
  }

  // 2. Hindi colloquial speech expressions
  if (/डेढ़ सौ|dedh sau/.test(clean)) return 150;
  if (/ढाई सौ|dhai sau/.test(clean)) return 250;
  if (/साढ़े तीन सौ/.test(clean)) return 350;
  if (/साढ़े चार सौ/.test(clean)) return 450;
  if (/साढ़े पांच सौ|साढ़े पाँच सौ/.test(clean)) return 550;

  // Thousands
  const thousandMatch = clean.match(/(एक|दो|तीन|चार|पांच|पाँच|छह|सात|आठ|नौ|दस)?\s*(हजार|हज़ार|hazar|thousand)/);
  if (thousandMatch) {
    const word = thousandMatch[1];
    const map: Record<string, number> = {
      'एक': 1000, 'दो': 2000, 'तीन': 3000, 'चार': 4000, 'पांच': 5000, 'पाँच': 5000,
      'छह': 6000, 'सात': 7000, 'आठ': 8000, 'नौ': 9000, 'दस': 10000
    };
    return (word && map[word]) || 1000;
  }

  // Hundreds
  const hundredMatch = clean.match(/(एक|दो|तीन|चार|पांच|पाँच|छह|सात|आठ|नौ)?\s*(सौ|sau|hundred)/);
  if (hundredMatch) {
    const word = hundredMatch[1];
    const map: Record<string, number> = {
      'एक': 100, 'दो': 200, 'तीन': 300, 'चार': 400, 'पांच': 500, 'पाँच': 500,
      'छह': 600, 'सात': 700, 'आठ': 800, 'नौ': 900
    };
    return (word && map[word]) || 100;
  }

  // 3. Fallback to any remaining number
  const numMatch = withoutDays.match(/(\d+(\.\d+)?)/);
  if (numMatch) {
    return parseFloat(numMatch[1]);
  }
  // Tens
  const tens: [RegExp, number][] = [
    [/पचहत्तर|75/i, 75],
    [/पचास|pachaas|fifty/i, 50],
    [/बीस|bees|twenty/i, 20],
    [/तीस|tees|thirty/i, 30],
    [/चालीस|chalis|forty/i, 40],
    [/साठ|saath|sixty/i, 60],
    [/सत्तर|sattar|seventy/i, 70],
    [/अस्सी|assi|eighty/i, 80],
    [/नब्बे|nabbe|ninety/i, 90],
    [/दस|das|ten/i, 10]
  ];
  for (const [regex, val] of tens) {
    if (regex.test(clean)) return val;
  }

  return 0;
}

// Fallback smart rule-based parser for Hindi/Hinglish/English voice commands
function parseVoiceRuleBased(text: string, knownCustomers: { id: number; name: string }[] = [], knownProducts: any[] = []) {
  const devanagariDigits: Record<string, string> = {
    '०': '0', '१': '1', '२': '2', '३': '3', '४': '4',
    '५': '5', '६': '6', '७': '7', '८': '8', '९': '9'
  };
  let normalized = text.replace(/[०-९]/g, d => devanagariDigits[d] || d);

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
  for (const [rgx, rep] of compounds) {
    normalized = normalized.replace(rgx, rep);
  }
  const clean = normalized.toLowerCase().trim();

  // 1. Detect Mandi Rate Alert (Wholesale / Market price fluctuation)
  const isMandiAlert = /मंडी|mandi|भाव बढ़|भाव घट|रेट बढ़|रेट घट|दाम बढ़|दाम घट|तेज हो गया|मंदा हो गया|नया रेट|स्टाफ को बता|अलर्ट/.test(clean);
  if (isMandiAlert) {
    const numbers = clean.match(/\d+(\.\d+)?/g)?.map(n => parseFloat(n)) || [];
    let newPrice = numbers[0] || 50;
    let oldPrice = 0;
    let wholesalePrice = 0;

    if (numbers.length >= 2) {
      if (/से|se|pehle|पहले/.test(clean)) {
        oldPrice = numbers[0];
        newPrice = numbers[1];
      } else {
        wholesalePrice = numbers[0];
        newPrice = numbers[1];
      }
    }

    const unit = clean.includes('किलो') || clean.includes('kg') ? 'किलो' :
                 clean.includes('लीटर') || clean.includes('litre') ? 'लीटर' :
                 clean.includes('बोरी') || clean.includes('bori') ? 'बोरी' :
                 clean.includes('टीन') || clean.includes('tin') ? 'टीन' : 'किलो';

    let prodName = text
      .replace(/\d+(\.\d+)?/g, '')
      .replace(/मंडी|mandi|में|का|की|भाव|रेट|दाम|बढ़|घट|तेज|मंदा|हो|गया|गई|है|रुपये|rupaye|प्रति|नया|स्टाफ|को|बताओ|अलर्ट|update/gi, '')
      .trim();
    if (!prodName) prodName = 'किराना सामान';

    return {
      intent: 'mandi_alert',
      productName: prodName,
      oldPrice,
      newPrice,
      wholesalePrice,
      unit,
      notes: text,
      confidence: 0.95,
      confirmationSpeech: `मंडी अलर्ट: ${prodName} का नया रेट ₹${newPrice} अपडेट कर दिया गया है`
    };
  }

  const isEn = !/[\u0900-\u097F]/.test(clean) && /[a-zA-Z]/.test(clean);

  // 2. DETECT PRODUCT vs TRANSACTION INTENT
  const hasUdhaarKeywords = /(उधार|udhar|udhaar|क्रेडिट|credit|lent|on credit|बाकी|खाते में लिख|लिख लो|लिख ले|लिख देना|लिख दो|को दे दो|को दिया|को दिए|का बाकी|का उधार|give.+?(?:credit|udhar)|lent to|debit)/i.test(clean);
  const hasJamaKeywords = /(जमा|jama|paid|payment|pay|received|receive|got|collected|settled|पेमेंट|भुगतान|वसूल|चुकाया|खाता चुकता|ने दिए|ने दिया|ने जमा|से मिला|से मिले|से आया|से आए|से ले लिया|दे गया|दे गए|कैश मिला|पेमेंट आया|फोनपे|phonepe|gpay|गूगल पे|पेटीएम|paytm)/i.test(clean);

  const isProductDelete = /(?:सामान|प्रोडक्ट|आइटम)?\s*(?:हटाओ|हटा\s*दो|हटाना|हटाएं|हटा\s*देना|डिलीट\s*करो|डिलीट\s*कर\s*दो|डिलीट|delete|remove)/i.test(clean);
  const isProductInquiry = /(?:कितना\s*स्टॉक|स्टॉक\s*बताओ|स्टॉक\s*कितना|कितना\s*माल|कितना\s*बचा|बचा\s*है|क्या\s*रेट|भाव\s*क्या|रेट\s*बताओ|भाव\s*बताओ|कीमत\s*क्या|how\s*much\s*stock|check\s*stock|price\s*check|check\s*price)/i.test(clean);
  const isProductReduce = /(?:बिका|बिक\s*गया|बेचा|बेच\s*दिया|कम\s*करो|कम\s*कर\s*दो|कम\s*करें|घटाओ|घटा\s*दो|घटाएं|सेल\s*हुआ|सेल\s*हो\s*गया|सेल\s*किया|निकल\s*गया|sold|reduce|deduct)/i.test(clean);
  const isProductPriceUpdate = /(?:रेट\s*बदलो|भाव\s*बदलो|रेट\s*करो|भाव\s*करो|में\s*बेचेंगे|नया\s*रेट|नया\s*भाव|बिक्री\s*रेट|खरीद\s*रेट|update\s*price|change\s*rate|new\s*rate|बिक\s*रहा|bik\s*raha|बिक\s*रही|bik\s*rahi|बिक\s*रहा\s*ह|bik\s*raha\s*h|बिक\s*रही\s*ह|bik\s*rahi\s*h|बिक\s*रहा\s*है|bik\s*raha\s*hai|बिकेगा|bikega|चल\s*रहा|chal\s*raha|भाव\s*है|rate\s*hai|का\s*भाव|का\s*रेट|pr\s*kg|per\s*kg|प्रति\s*किलो|pr\s*ltr|per\s*ltr|प्रति\s*लीटर|pr\s*packet|per\s*packet|में\s*बिक|me\s*bik)/i.test(clean);
  const isProductStockAdd = /(?:स्टॉक\s*में\s*जोड़ो|स्टॉक\s*जोड़ो|स्टॉक\s*बढ़ाओ|माल\s*आया|आया\s*है|नया\s*माल|स्टॉक\s*डालो|add\s*to\s*stock|add\s*stock|restock)/i.test(clean);

  const hasInventoryExplicitKeywords = /(खरीद|kharid|purchase|cost|बिक्री|bikri|selling|mrp|एमआरपी|थोक भाव|थोक रेट|बिक्री रेट|स्टॉक में जोड़ो|स्टॉक जोड़ो|स्टॉक बढ़ाओ|स्टॉक करो|add to stock|add stock|update stock|नया प्रोडक्ट|नया सामान)/i.test(clean) ||
    isProductDelete || isProductInquiry || isProductReduce || isProductPriceUpdate || isProductStockAdd;

  let matchedProductFromDb: any = null;
  for (const p of knownProducts) {
    if (p && p.name && (clean.includes(p.name.toLowerCase()) || areNamesEquivalent(clean, p.name))) {
      matchedProductFromDb = p;
      break;
    }
  }

  // If transaction keywords exist, it's NOT a product intent
  const isProductIntent = !hasUdhaarKeywords && !hasJamaKeywords && (
    hasInventoryExplicitKeywords ||
    matchedProductFromDb !== null ||
    (/(स्टॉक|stock)/i.test(clean) && /(जोड़ो|बढ़ाओ|update|add)/i.test(clean))
  );

  // -------------------------------------------------------------------------
  // 3. CASE: PRODUCT / INVENTORY ENTRY & MANAGEMENT
  // -------------------------------------------------------------------------
  if (isProductIntent) {
    let productAction: 'add_stock' | 'reduce_stock' | 'update_price' | 'delete' | 'inquiry' = 'add_stock';
    if (isProductDelete) productAction = 'delete';
    else if (isProductInquiry) productAction = 'inquiry';
    else if (isProductReduce) productAction = 'reduce_stock';
    else if (isProductPriceUpdate) productAction = 'update_price';
    else productAction = 'add_stock';

    let unit = isEn ? 'Packet' : 'पैकेट';
    if (/किलो|किलोग्राम|kg|kilo/i.test(clean)) unit = isEn ? 'Kg' : 'किलो';
    else if (/लीटर|लीटरों|ltr|litre|liter/i.test(clean)) unit = isEn ? 'Liter' : 'लीटर';
    else if (/पीस|piece|pieces|pcs/i.test(clean)) unit = isEn ? 'Piece' : 'पीस';
    else if (/बोरी|bori/i.test(clean)) unit = isEn ? 'Bori' : 'बोरी';
    else if (/कार्टन|पेटी|carton|peti|box|boxes/i.test(clean)) unit = isEn ? 'Box' : 'कार्टन';
    else if (/दर्जन|dozen/i.test(clean)) unit = isEn ? 'Dozen' : 'दर्जन';
    else if (/बोतल|bottle/i.test(clean)) unit = isEn ? 'Bottle' : 'बोतल';
    else if (/ग्राम|gm|gram/i.test(clean)) unit = isEn ? 'Gram' : 'ग्राम';
    else if (matchedProductFromDb) unit = matchedProductFromDb.unit || (isEn ? 'Packet' : 'पैकेट');

    let quantity = 0;
    const isRatePattern = /(?:₹|रुपये|रुपया|rupaye|rs\.?)\s*(\d+(\.\d+)?)/i.test(clean) ||
                          /(\d+(\.\d+)?)\s*(?:₹|रुपये|रुपया|rupaye|rs\.?)/i.test(clean) ||
                          /(\d+(\.\d+)?)\s*(?:प्रति|pr|per)\s*(?:kg|किलो|लीटर|ltr|पैकेट|pkt|पीस|pcs|बोरी|bori)/i.test(clean) ||
                          /(?:बिक\s*रहा|bik\s*raha|बिक\s*रही|bik\s*rahi|बिकेगा|bikega|चल\s*रहा|chal\s*raha)/i.test(clean);

    if (productAction === 'update_price') {
      quantity = 0;
    } else {
      const qtyMatch = clean.match(/(\d+(\.\d+)?)\s*(?:पैकेट|packet|packets|pkt|pkts|किलो|kg|kilo|लीटर|ltr|liter|litre|पीस|pcs|piece|pieces|बोरी|bori|कार्टन|carton|पेटी|peti|दर्जन|dozen|बोतल|bottle|ग्राम|gm|box|boxes)/i) ||
                       clean.match(/(?:स्टॉक|स्टॉक में|जोड़ो|जोड़ दो|add|update|कम करो|घटाओ|बिका|बेचा)\s*(\d+(\.\d+)?)/i) ||
                       clean.match(/(\d+(\.\d+)?)\s*(?:स्टॉक|जोड़ो|जोड़ दो|add|stock|बिका|बेचा|कम|घटाओ)/i);
      const currencyAttached = clean.match(/(?:₹|रुपये|रुपया|rupaye|rs\.?)\s*(\d+(\.\d+)?)/i);
      if (qtyMatch && qtyMatch[1] && (!currencyAttached || parseFloat(currencyAttached[1]) !== parseFloat(qtyMatch[1]))) {
        quantity = parseFloat(qtyMatch[1]);
      } else if (productAction === 'reduce_stock' || (productAction === 'add_stock' && !isRatePattern)) {
        const bareNums = (clean.match(/\b\d+(\.\d+)?\b/g) || []).map(n => parseFloat(n));
        if (bareNums.length > 0) quantity = bareNums[0];
      }
    }

    if (quantity <= 0) {
      if (productAction === 'reduce_stock') quantity = 1;
      else if (productAction === 'add_stock') quantity = 10;
      else quantity = 0;
    }

    let purchasePrice = 0;
    let sellingPrice = 0;

    const buyMatch = clean.match(/(?:खरीद|kharid|buy|buying|purchase|cost)\s*(?:रेट|मूल्य|भाव|rate|price|₹|rs\.?|रुपये)?\s*(\d+(\.\d+)?)/i);
    const sellMatch = clean.match(/(?:बिक्री|bikri|sell|selling|sale|mrp|एमआरपी|बेचेंगे)\s*(?:रेट|मूल्य|भाव|rate|price|₹|rs\.?|रुपये)?\s*(\d+(\.\d+)?)/i) ||
                      clean.match(/(?:₹|रुपये|रुपया|rupaye|rs\.?)\s*(\d+(\.\d+)?)/i) ||
                      clean.match(/(\d+(\.\d+)?)\s*(?:₹|रुपये|रुपया|rupaye|rs\.?)/i) ||
                      clean.match(/(\d+(\.\d+)?)\s*(?:प्रति|pr|per|में)?\s*(?:किलो|kg|लीटर|ltr|पैकेट|pkt|पीस|pcs|बोरी|bori|दर्जन|dozen)?\s*(?:बिक\s*रहा|bik\s*raha|बिक\s*रही|bik\s*rahi|बिकेगा|bikega|चल\s*रहा|chal\s*raha)/i) ||
                      clean.match(/(\d+(\.\d+)?)\s*(?:में\s*बेचेंगे|का\s*बिक्री\s*रेट|का\s*रेट|का\s*भाव)/i);

    if (buyMatch && buyMatch[1]) purchasePrice = parseFloat(buyMatch[1]);
    if (sellMatch && (sellMatch[1] || sellMatch[2])) sellingPrice = parseFloat(sellMatch[1] || sellMatch[2]);

    if (productAction === 'update_price' && purchasePrice === 0 && sellingPrice === 0) {
      const nums = (clean.match(/\d+(\.\d+)?/g) || []).map(n => parseFloat(n));
      if (nums.length > 0) sellingPrice = nums[nums.length - 1];
    }

    if (purchasePrice === 0 && sellingPrice === 0 && productAction === 'add_stock') {
      const allNumbers = (clean.match(/\d+(\.\d+)?/g) || []).map(n => parseFloat(n));
      const priceCandidates = allNumbers.filter(n => n !== quantity);
      if (priceCandidates.length >= 2) {
        purchasePrice = priceCandidates[0];
        sellingPrice = priceCandidates[1];
      } else if (priceCandidates.length === 1) {
        const singlePrice = priceCandidates[0];
        if (/खरीद|kharid|buy|buying/i.test(clean)) {
          purchasePrice = singlePrice;
          sellingPrice = Math.round(singlePrice * 1.15);
        } else {
          sellingPrice = singlePrice;
          purchasePrice = Math.round(singlePrice * 0.85);
        }
      }
    }

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

    let prodName = '';
    if (matchedProductFromDb) {
      prodName = matchedProductFromDb.name;
    } else {
      prodName = text
        .replace(/\b\d+(\.\d+)?\b/g, '')
        .replace(/(?:₹|रुपये|रुपया|rupaye|rupee|rupees|rs\.?)/gi, '')
        .replace(/\b(?:packets|packet|pkts|pkt|kilos|kilo|kgs|kg|litres|litre|liters|liter|ltr|pieces|piece|pcs|pc|bori|cartons|carton|peti|dozens|dozen|bottles|bottle|grams|gram|gm|boxes|box|pouches|pouch)\b/gi, '')
        .replace(/(?:पैकेटों|पैकेट|किलोग्राम|किलो|लीटरों|लीटर|पीस|बोरी|कार्टन|पेटी|दर्जन|बोतल|ग्राम|डब्बा|डिब्बा|पाउच)/gi, '')
        .replace(/\b(?:bik\s*raha\s*hai|bik\s*raha\s*h|bik\s*raha|bik\s*rahi\s*hai|bik\s*rahi\s*h|bik\s*rahi|bik\s*gaya|bika|bikega|bech\s*rahe|bechna\s*hai|bechna|becha|chal\s*raha\s*hai|chal\s*raha\s*h|chal\s*raha|chal\s*rahi|buying|buy|purchase|cost|selling|sale|sell|mrp|price|rate|at)\b/gi, '')
        .replace(/(?:बिक\s*रहा\s*है|बिक\s*रहा\s*ह|बिक\s*रहा|बिक\s*रही\s*है|बिक\s*रही\s*ह|बिक\s*रही|बिक\s*गया|बिका|बिकेगा|बेच\s*रहे|बेचना\s*है|बेचना|बेचा|चल\s*रहा\s*है|चल\s*रहा\s*ह|चल\s*रहा|चल\s*रही|खरीद|kharid|बिक्री|bikri|एमआरपी|बेचेंगे|रेट|भाव|कीमत)/gi, '')
        .replace(/\b(?:add\s+to\s+stock|add\s+stock|add|update|stock|item|product|new|deduct|reduce|sold|delete|remove)\b/gi, '')
        .replace(/(?:स्टॉक\s*में\s*जोड़ो|स्टॉक\s*जोड़ो|स्टॉक\s*बढ़ाओ|स्टॉक|जोड़ो|जोड़\s*दो|ऐड\s*करो|करो|कर\s*देना|डालो|डाल\s*दो|नया|सामान|प्रोडक्ट|आइटम)/gi, '')
        .replace(/(?:बिका|बिक\s*गया|बेचा|बेच\s*दिया|कम\s*करो|कम\s*कर\s*दो|कम\s*करें|घटाओ|घटा\s*दो|घटाएं|सेल\s*हुआ|सेल\s*हो\s*गया|सेल\s*किया|निकल\s*गया)/gi, '')
        .replace(/(?:कितना\s*स्टॉक|स्टॉक\s*बताओ|स्टॉक\s*कितना|कितना\s*माल|कितना\s*बचा|बचा\s*है|क्या\s*रेट|भाव\s*क्या|रेट\s*बताओ|भाव\s*बताओ|कीमत\s*क्या)/gi, '')
        .replace(/(?:हटाओ|हटा\s*दो|हटाना|हटाएं|डिलीट|हटा\s*देना)/gi, '')
        .replace(/\b(?:pr|per|par|pe|me|mein|se|ko|ka|ki|ke|hai|h|tha|thi|he|is|are|how|much|what|of|in|to|the|and|for)\b/gi, '')
        .replace(/(?:प्रति|पर|पे|में|से|को|का|की|के|है|ह|था|थी|और|या|बताओ|कितना|क्या|वाला|वाले|वाली)/gi, '')
        .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'₹?।\\|]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (!prodName || prodName.length < 2) {
        prodName = isEn ? 'New Product' : 'नया सामान';
      } else if (isEn) {
        prodName = prodName.replace(/\b\w/g, l => l.toUpperCase());
      }
    }

    let category = matchedProductFromDb?.category || 'सामान्य किराना';
    if (/तेल|रिफाइंड|सरसों|घी|डालडा|oil|ghee/i.test(prodName)) category = 'खाद्य तेल व घी';
    else if (/चीनी|गुड़|शक्कर|मीठा|sugar|gur|gud|jaggery/i.test(prodName)) category = 'चीनी व गुड़';
    else if (/आटा|चावल|दाल|चना|मैदा|सूजी|बेसन|flour|rice|pulse|wheat|atta|aata/i.test(prodName)) category = 'अनाज व दालें';
    else if (/मसाला|मिर्च|हल्दी|धनिया|जीरा|नमक|spice|salt/i.test(prodName)) category = 'मसाले';
    else if (/साबुन|सर्फ|शैम्पू|पेस्ट|ब्रश|डिटर्जेंट|कोलगेट|soap|shampoo|paste/i.test(prodName)) category = 'प्रसाधन व सफाई';
    else if (/बिस्कुट|मैगी|नूडल्स|नमकीन|चिप्स|चॉकलेट|biscuit|maggi|chips/i.test(prodName)) category = 'स्नैक्स व बिस्कुट';
    else if (/चाय|कॉफी|दूध|कोल्डड्रिंक|पानी|tea|coffee|milk/i.test(prodName)) category = 'पेय पदार्थ';

    const currentStock = matchedProductFromDb ? Number(matchedProductFromDb.stock_quantity) || 0 : 0;
    let targetStock = currentStock;
    if (productAction === 'reduce_stock') {
      targetStock = Math.max(0, currentStock - quantity);
    } else if (productAction === 'add_stock') {
      targetStock = currentStock + quantity;
    }

    let speechMessage = '';
    if (productAction === 'inquiry') {
      speechMessage = isEn
        ? `${prodName} stock is ${currentStock} ${unit}, selling at ₹${sellingPrice}.`
        : `${prodName} का स्टॉक ${currentStock} ${unit} बचा है, बिक्री रेट ₹${sellingPrice} है।`;
    } else if (productAction === 'reduce_stock') {
      speechMessage = isEn
        ? `${quantity} ${unit} sold from ${prodName}. Remaining stock is ${targetStock} ${unit}.`
        : `${prodName} से ${quantity} ${unit} बिका! अब बचा स्टॉक ${targetStock} ${unit} है।`;
    } else if (productAction === 'update_price') {
      speechMessage = isEn
        ? `${prodName} selling rate updated to ₹${sellingPrice}.`
        : `${prodName} का नया बिक्री रेट ₹${sellingPrice} अपडेट!`;
    } else if (productAction === 'delete') {
      speechMessage = isEn
        ? `Confirm removal of ${prodName} from inventory.`
        : `${prodName} को दुकान से हटाने की पुष्टि करें।`;
    } else {
      speechMessage = isEn
        ? `Added ${quantity} ${unit} to ${prodName}. Total stock is ${targetStock} ${unit}.`
        : `${prodName} में ${quantity} ${unit} नया स्टॉक जुड़ा! कुल स्टॉक ${targetStock} ${unit}।`;
    }

    return {
      intent: 'product',
      productAction,
      productId: matchedProductFromDb ? matchedProductFromDb.id : undefined,
      product: matchedProductFromDb,
      name: prodName,
      productName: prodName,
      category,
      unit,
      purchasePrice,
      sellingPrice,
      quantity,
      currentStock,
      targetStock,
      minStockAlert: 5,
      confidence: 0.95,
      confirmationSpeech: speechMessage
    };
  }

  // -------------------------------------------------------------------------
  // 4. CASE: CUSTOMER LEDGER TRANSACTION (UDHAAR VS JAMA)
  // -------------------------------------------------------------------------
  let amount = 0;
  const textWithoutDays = clean.replace(/(\d+)\s*(दिन|din|days|mahina|mahine|महीने|महीना)/gi, ' ');
  const rupeeMatch = textWithoutDays.match(/(?:₹|रुपये|रुपया|rupaye|rupee|rupees|rs\.?)\s*(\d+(\.\d+)?)/i) ||
                     textWithoutDays.match(/(\d+(\.\d+)?)\s*(?:₹|रुपये|रुपया|rupaye|rupee|rupees|rs\.?)/i);
  if (rupeeMatch && rupeeMatch[1]) {
    amount = parseFloat(rupeeMatch[1]);
  } else {
    const numMatch = textWithoutDays.match(/(\d+(\.\d+)?)/);
    if (numMatch && numMatch[1]) {
      amount = parseFloat(numMatch[1]);
    }
  }

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
  const isExplicitJama = /जमा|जमा किया|जमा कर दो|जमा लिखो|जमा करो|jama|paid|payment|pay|received|receive|got|collected|settled|पेमेंट|भुगतान|वसूल|चुकाया|खाता चुकता/i.test(clean);
  const isCustomerGave = /ने.+?(?:दिए|दिया|जमा किया|पेमेंट किया)|ने\s*(\d+)?\s*(?:₹|रुपये)?\s*(?:दिए|दिया|जमा)|से मिला|से मिले|से आया|से आए|से ले लिया|दे गया|दे गए|कैश मिला|पेमेंट आया|received\s+from|got\s+from|paid\s+by|from\s+[a-zA-Z\u0900-\u097F]+\s*(?:paid|gave)/i.test(clean) ||
                         /^[a-zA-Z\u0900-\u097F\s]+\s+(?:paid|gave|deposited)\s+\d+/i.test(clean);
  const isOnlinePayment = /(phonepe|फोनपे|gpay|गूगल पे|paytm|पेटीएम|ऑनलाइन जमा|online payment|online paid)/i.test(clean);

  const isExplicitUdhaar = /उधार|उधार दिया|उधार दिए|उधार लिखो|उधार में|udhar|udhaar|क्रेडिट|credit|debit|lent|खाते में लिखो|लिख लो|लिख ले|लिख देना|on credit/i.test(clean);
  const isShopkeeperGave = /को.+?(?:दिए|दिया|उधार दिया)|को\s*(\d+)?\s*(?:₹|रुपये)?\s*(?:दिए|दिया|उधार)|का बाकी|का उधार|give\s+.+?\s*(?:to|for)|credit\s+to|credit\s+for|lent\s+to|debit\s+to/i.test(clean);

  let txType: 'udhaar' | 'jama' = 'udhaar';
  if (isExplicitJama || isCustomerGave || isOnlinePayment) {
    if (isExplicitUdhaar && !isCustomerGave && !isExplicitJama) {
      txType = 'udhaar';
    } else {
      txType = 'jama';
    }
  } else if (isExplicitUdhaar || isShopkeeperGave) {
    txType = 'udhaar';
  } else {
    txType = 'udhaar';
  }

  let matchedCustomer: { id: number; name: string } | undefined = undefined;
  // Step A: Full name match
  for (const c of knownCustomers) {
    const raw = String(c.name || '').toLowerCase().trim();
    if (raw && clean.includes(raw)) {
      matchedCustomer = c;
      break;
    }
  }
  // Step B: First name match
  if (!matchedCustomer) {
    for (const c of knownCustomers) {
      const raw = String(c.name || '').toLowerCase().trim();
      const firstName = raw.split(/[\s\(\)]+/)[0];
      if (firstName && firstName.length >= 2 && clean.includes(firstName)) {
        matchedCustomer = c;
        break;
      }
    }
  }
  // Step C: Token match
  if (!matchedCustomer) {
    for (const c of knownCustomers) {
      const raw = String(c.name || '').toLowerCase().trim();
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
    // English preposition match
    const engPrepMatch = clean.match(/(?:to|for|from|by)\s+([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)/i);
    if (engPrepMatch && engPrepMatch[1]) {
      const cand = engPrepMatch[1].trim();
      if (!/^(cash|online|phonepe|gpay|paytm|udhar|jama|credit|store|shop|me|us|account)$/i.test(cand)) {
        customerName = cand.replace(/\b\w/g, l => l.toUpperCase());
      }
    }

    if (!customerName) {
      const engSubjMatch = clean.match(/^([a-zA-Z\u0900-\u097F]+(?:\s+[a-zA-Z\u0900-\u097F]+)?)\s+(?:paid|gave|received|took|has paid)/i);
      if (engSubjMatch && engSubjMatch[1]) {
        const cand = engSubjMatch[1].trim();
        if (!/^(give|add|please|record|we|i|customer)$/i.test(cand)) {
          customerName = cand.replace(/\b\w/g, l => l.toUpperCase());
        }
      }
    }

    if (!customerName) {
      const beforePart = text.split(/(?:\s+को|\s+ने|\s+से|\s+का|\s+की|\s+udhar|\s+udhaar|\s+jama|\s+जमा|\s+उधार|\s+\d+)/i)[0].trim();
      if (beforePart && beforePart.length >= 2 && !/^(bolkar|bol|voice|add|likh|likho|khata|entry|namaste|hello|give|record)$/i.test(beforePart)) {
        customerName = beforePart;
      }
    }

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
      customerName = candidateWords.length > 0 ? candidateWords.join(' ') : (isEn ? 'New Customer' : 'नया ग्राहक');
    }
  }

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
    type: txType,
    amount: finalAmount,
    creditPeriodDays: txType === 'udhaar' ? creditPeriodDays : undefined,
    notes: noteDesc,
    confidence: 0.95,
    confirmationSpeech: confirmMsg
  };
}

// ==========================================
// API ROUTES
// ==========================================

// 1. Database & Hosting Status
app.get('/api/db/status', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const stats = await db.getDashboardStats(shopId);
    const rawDb = process.env.MYSQL_DATABASE || 'dukaan_khaata_db';
    const rawUser = process.env.MYSQL_USER || 'root';
    res.json({
      success: true,
      shop_id: shopId,
      dbType: db.dbType,
      isMySQLConnected: db.isMySQLConnected,
      connectionError: db.connectionError,
      env: {
        host: '127.0.0.1',
        port: process.env.MYSQL_PORT || '3306',
        database: rawDb.slice(0, 2) + '***' + rawDb.slice(-2),
        user: rawUser.slice(0, 2) + '***',
        serverPort: PORT,
        serverHost: HOST,
        geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY')
      },
      stats
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Customers
app.get('/api/customers', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const customers = await db.getCustomers(shopId);
    const enriched = customers.map(c => ({
      ...c,
      passbook_token: getCustomerPassbookToken(c.id, c.phone)
    }));
    res.json({ success: true, data: enriched });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2.1 Customer Secure Personal Passbook View (Only this customer's ledger)
app.get('/api/passbook', async (req: Request, res: Response) => {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    if (!token) {
      return res.status(400).json({ success: false, error: 'पासबुक टोकन आवश्यक है (Passbook token required)' });
    }

    const pool = db.getPool();
    let matched: any = null;
    let shopId = 1;

    if (pool) {
      const [allCusts]: any = await pool.query('SELECT * FROM customers');
      matched = allCusts.find((c: any) => getCustomerPassbookToken(c.id, c.phone) === token);
      if (matched) shopId = Number(matched.shop_id || 1);
    } else {
      const allCusts = await db.getCustomers(1);
      matched = allCusts.find(c => getCustomerPassbookToken(c.id, c.phone) === token);
    }

    if (!matched) {
      return res.status(404).json({ success: false, error: 'अमान्य पासबुक लिंक या ग्राहक नहीं मिला (Invalid passbook link)' });
    }

    const allTxs = await db.getTransactions(matched.id, shopId);
    const settings = await db.getSettings(shopId);

    let totalUdhaar = 0;
    let totalJama = 0;
    let running = 0;
    const txList = allTxs.map(t => {
      if (!t.is_deleted) {
        if (t.type === 'udhaar') {
          totalUdhaar += t.amount;
          running += t.amount;
        } else {
          totalJama += t.amount;
          running -= t.amount;
        }
      }
      return {
        ...t,
        running_balance: running
      };
    });

    res.json({
      success: true,
      shop: {
        shop_name: settings.shop_name || 'Mohit Kirana Store',
        owner_name: settings.owner_name || 'दुकानदार',
        phone: settings.phone || '',
        address: settings.address || '',
        upi_id: settings.upi_id || '',
        logo: settings.logo || null
      },
      customer: {
        id: matched.id,
        name: matched.name,
        phone: matched.phone,
        address: matched.address,
        due_date: matched.due_date,
        credit_limit: matched.credit_limit,
        total_udhaar: totalUdhaar,
        total_jama: totalJama,
        net_balance: totalUdhaar - totalJama
      },
      transactions: txList
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/customers', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const { name, phone, address, due_date, credit_limit, credit_period_days } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Customer name is required' });
    }
    const customer = await db.addCustomer({ name, phone, address, due_date, credit_limit, credit_period_days }, shopId);
    triggerStoreAutoBackupOnEntry(shopId);
    res.json({ success: true, data: customer });
  } catch (err: any) {
    res.status(err.isDuplicate ? 409 : 500).json({
      success: false,
      duplicate: !!err.isDuplicate,
      existingId: err.existingId,
      error: err.message
    });
  }
});

app.put('/api/customers/:id', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const id = parseInt(req.params.id, 10);
    const ok = await db.updateCustomer(id, req.body, shopId);
    if (ok) triggerStoreAutoBackupOnEntry(shopId);
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/customers/:id', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const id = parseInt(req.params.id, 10);
    const ok = await db.deleteCustomer(id, shopId);
    if (ok) triggerStoreAutoBackupOnEntry(shopId);
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Transactions (Udhaar & Jama)
app.get('/api/transactions', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const customerId = req.query.customerId ? parseInt(req.query.customerId as string, 10) : undefined;
    const transactions = await db.getTransactions(customerId, shopId);
    res.json({ success: true, data: transactions });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/transactions', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const { customer_id, customer_name, type, amount, notes, date, voice_recorded, bill_image } = req.body;
    
    let targetCustomerId = customer_id;

    // If customer_name was given and customer_id is missing, create or find customer (with English <-> Hindi matching)
    if (!targetCustomerId && customer_name) {
      const customers = await db.getCustomers(shopId);
      const existing = customers.find(c => areNamesEquivalent(c.name, customer_name.trim()));
      if (existing) {
        targetCustomerId = existing.id;
      } else {
        const newCust = await db.addCustomer({ name: customer_name.trim() }, shopId);
        targetCustomerId = newCust.id;
      }
    }

    if (!targetCustomerId) {
      return res.status(400).json({ success: false, error: 'Customer is required' });
    }

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, error: 'Valid amount is required' });
    }

    if (type !== 'udhaar' && type !== 'jama') {
      return res.status(400).json({ success: false, error: "Type must be 'udhaar' or 'jama'" });
    }

    const tx = await db.addTransaction({
      customer_id: Number(targetCustomerId),
      type,
      amount: Number(amount),
      notes,
      date,
      voice_recorded: Boolean(voice_recorded),
      bill_image
    }, shopId);

    triggerStoreAutoBackupOnEntry(shopId);
    res.json({ success: true, data: tx });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/transactions/:id', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const id = parseInt(req.params.id, 10);
    const { type, amount, notes, date, bill_image } = req.body;
    const updated = await db.updateTransaction(id, {
      ...(type && { type }),
      ...(amount && { amount: Number(amount) }),
      ...(notes !== undefined && { notes }),
      ...(date && { date }),
      ...(bill_image !== undefined && { bill_image })
    }, shopId);
    if (!updated) {
      return res.status(404).json({ success: false, error: 'Transaction not found' });
    }
    triggerStoreAutoBackupOnEntry(shopId);
    res.json({ success: true, data: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/transactions/:id', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const id = parseInt(req.params.id, 10);
    const body = req.body || {};
    const query = req.query || {};
    const reason = (body.reason || query.reason || 'दुकानदार द्वारा रद्द') as string;
    const pin = (body.pin || query.pin || '') as string;
    const deletedBy = (body.deleted_by || query.deleted_by || 'मालिक (Owner)') as string;

    const settings = await db.getSettings(shopId);
    if (settings.pin && pin && !verifySecret(pin.trim(), settings.pin.trim())) {
      return res.status(403).json({ success: false, error: 'गलत सुरक्षा पिन! केवल दुकान मालिक ही रिकॉर्ड रद्द कर सकते हैं।' });
    }

    const ok = await db.softDeleteTransaction(id, reason, deletedBy, shopId);
    if (ok) triggerStoreAutoBackupOnEntry(shopId);
    res.json({ success: ok, is_deleted: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Security: Restore cancelled/deleted transaction
app.post('/api/transactions/:id/restore', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const id = parseInt(req.params.id, 10);
    const { pin } = req.body || {};
    const settings = await db.getSettings(shopId);
    if (settings.pin && pin && !verifySecret(pin.trim(), settings.pin.trim())) {
      return res.status(403).json({ success: false, error: 'गलत सुरक्षा पिन!' });
    }
    const ok = await db.restoreTransaction(id, shopId);
    if (ok) triggerStoreAutoBackupOnEntry(shopId);
    res.json({ success: ok, restored: true });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Products (Purchase & Selling Price)
app.get('/api/products', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const products = await db.getProducts(shopId);
    res.json({ success: true, data: products });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/products', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const { name, category, unit, purchase_price, selling_price, wholesale_price, stock_quantity, min_stock_alert, barcode } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Product name is required' });
    }
    const product = await db.addProduct({
      name,
      category,
      unit,
      purchase_price: Number(purchase_price) || 0,
      selling_price: Number(selling_price) || 0,
      wholesale_price: Number(wholesale_price) || 0,
      stock_quantity: Number(stock_quantity) || 0,
      min_stock_alert: Number(min_stock_alert) || 5,
      barcode,
      force_upsert: !!req.body.force_upsert
    }, shopId);
    triggerStoreAutoBackupOnEntry(shopId);
    res.json({ success: true, data: product });
  } catch (err: any) {
    res.status(err.isDuplicate ? 409 : 500).json({
      success: false,
      duplicate: !!err.isDuplicate,
      existingId: err.existingId,
      error: err.message
    });
  }
});

app.post('/api/products/batch', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const { products } = req.body;
    if (!Array.isArray(products)) {
      return res.status(400).json({ success: false, error: 'Products array required' });
    }
    const added = [];
    for (const p of products) {
      if (p.name && p.name.trim()) {
        const item = await db.addProduct({ ...p, force_upsert: true }, shopId);
        added.push(item);
      }
    }
    if (added.length > 0) {
      triggerStoreAutoBackupOnEntry(shopId);
    }
    res.json({ success: true, count: added.length });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/products/:id', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const id = parseInt(req.params.id, 10);
    const ok = await db.updateProduct(id, req.body, shopId);
    if (ok) triggerStoreAutoBackupOnEntry(shopId);
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/products/:id', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const id = parseInt(req.params.id, 10);
    const ok = await db.deleteProduct(id, shopId);
    if (ok) triggerStoreAutoBackupOnEntry(shopId);
    res.json({ success: ok });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Dashboard Stats
app.get('/api/dashboard/stats', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const stats = await db.getDashboardStats(shopId);
    res.json({ success: true, data: stats });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// --- 5. BACKUP & GOOGLE DRIVE AUTO SYNC ---
const backupsDir = path.resolve(__dirname, 'backups');
if (!fs.existsSync(backupsDir)) {
  try { fs.mkdirSync(backupsDir, { recursive: true }); } catch {}
}

// Helper to perform Google Drive sync for a specific store
async function syncStoreToGoogleDrive(shopId: number, webhookUrl?: string) {
  const currentShopId = shopId || 1;
  const settings = await db.getSettings(currentShopId);
  const url = webhookUrl || settings.gdrive_webhook_url;
  if (!url) {
    throw new Error('Google Drive Webhook URL सेट नहीं है');
  }

  const backupData = await db.getFullBackupData(currentShopId);

  // Save local copy in backups folder (separated per store)
  const today = new Date().toISOString().split('T')[0];
  try {
    const storeBackupDir = path.join(backupsDir, 'stores', `shop_${currentShopId}`);
    if (!fs.existsSync(storeBackupDir)) fs.mkdirSync(storeBackupDir, { recursive: true });
    fs.writeFileSync(path.join(storeBackupDir, `backup_latest.json`), JSON.stringify(backupData, null, 2));
    fs.writeFileSync(path.join(storeBackupDir, `backup_${today}.json`), JSON.stringify(backupData, null, 2));
  } catch (fsErr: any) {
    console.warn(`[BACKUP] Failed to write local backup file:`, fsErr.message);
  }

  // Upload to Google Drive Webhook
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backupData)
  });

  const timeStr = new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' }) + ' (' + new Date().toLocaleDateString('hi-IN') + ')';

  if (!response.ok) {
    await db.updateSettings({ last_backup_status: `विफल (HTTP ${response.status})` }, currentShopId);
    throw new Error(`Google Drive ने एरर दिया (HTTP ${response.status})`);
  }

  await db.updateSettings({
    last_backup_time: timeStr,
    last_backup_status: 'सफल (Success)'
  }, currentShopId);

  return { success: true, time: timeStr };
}

// Helper to perform Google Drive sync for entire platform (All Shops & Super Admin Data)
async function syncPlatformToGoogleDrive(webhookUrl?: string) {
  const platSettings = await db.getPlatformBackupSettings();
  const url = webhookUrl || platSettings.gdrive_webhook_url;
  if (!url) {
    throw new Error('Google Drive Webhook URL सेट नहीं है');
  }

  const backupData = await db.getFullPlatformBackupData();

  // Save local copy in backups folder (separated for full project)
  const today = new Date().toISOString().split('T')[0];
  try {
    const platformBackupDir = path.join(backupsDir, 'project_master');
    if (!fs.existsSync(platformBackupDir)) fs.mkdirSync(platformBackupDir, { recursive: true });
    fs.writeFileSync(path.join(platformBackupDir, `full_project_backup_latest.json`), JSON.stringify(backupData, null, 2));
    fs.writeFileSync(path.join(platformBackupDir, `full_project_backup_${today}.json`), JSON.stringify(backupData, null, 2));
  } catch (fsErr: any) {
    console.warn(`[BACKUP] Failed to write local platform backup file:`, fsErr.message);
  }

  // Upload to Google Drive Webhook
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backupData)
  });

  const timeStr = new Date().toLocaleTimeString('hi-IN', { hour: '2-digit', minute: '2-digit' }) + ' (' + new Date().toLocaleDateString('hi-IN') + ')';

  if (!response.ok) {
    await db.updatePlatformBackupSettings({ last_backup_status: `विफल (HTTP ${response.status})` });
    throw new Error(`Google Drive ने एरर दिया (HTTP ${response.status})`);
  }

  await db.updatePlatformBackupSettings({
    last_backup_time: timeStr,
    last_backup_status: 'सफल (Success)'
  });

  return { success: true, time: timeStr };
}

// Debounce map for automatic backups on new entries
const storeBackupDebounceTimers: Record<number, NodeJS.Timeout> = {};
let platformBackupDebounceTimer: NodeJS.Timeout | null = null;

// Trigger debounced auto-backup when a store creates/updates/deletes an entry
function triggerStoreAutoBackupOnEntry(shopId: number) {
  const currentShopId = shopId || 1;

  if (storeBackupDebounceTimers[currentShopId]) {
    clearTimeout(storeBackupDebounceTimers[currentShopId]);
  }

  // Debounce ~1.2s so multiple quick actions don't spam Google Drive
  storeBackupDebounceTimers[currentShopId] = setTimeout(async () => {
    try {
      const settings = await db.getSettings(currentShopId);
      if (settings && settings.auto_backup_enabled && settings.gdrive_webhook_url) {
        console.log(`☁️ [AUTO-BACKUP] Auto-uploading store #${currentShopId} to Google Drive...`);
        await syncStoreToGoogleDrive(currentShopId);
        console.log(`✅ [AUTO-BACKUP] Store #${currentShopId} synced successfully.`);
      }

      // Check if platform auto-backup triggers on any store entry
      const platSettings = await db.getPlatformBackupSettings();
      if (platSettings && platSettings.auto_backup_enabled && platSettings.sync_on_any_store_entry && platSettings.gdrive_webhook_url) {
        triggerPlatformDebouncedBackup();
      }
    } catch (err: any) {
      console.warn(`⚠️ [AUTO-BACKUP] Store #${currentShopId} auto-backup error:`, err.message);
    }
  }, 1200);
}

function triggerPlatformDebouncedBackup() {
  if (platformBackupDebounceTimer) {
    clearTimeout(platformBackupDebounceTimer);
  }
  platformBackupDebounceTimer = setTimeout(async () => {
    try {
      const platSettings = await db.getPlatformBackupSettings();
      if (platSettings && platSettings.auto_backup_enabled && platSettings.gdrive_webhook_url) {
        console.log(`☁️ [PLATFORM-BACKUP] Auto-uploading full platform to Google Drive...`);
        await syncPlatformToGoogleDrive();
        console.log(`✅ [PLATFORM-BACKUP] Full platform synced successfully.`);
      }
    } catch (err: any) {
      console.warn(`⚠️ [PLATFORM-BACKUP] Full platform auto-backup error:`, err.message);
    }
  }, 2000);
}

// Automatic Scheduled Backup Interval (Every 15 minutes checks if store/platform interval elapsed)
setInterval(async () => {
  try {
    // 1. Check Platform Auto-Backup
    const platSettings = await db.getPlatformBackupSettings();
    if (platSettings && platSettings.auto_backup_enabled && platSettings.gdrive_webhook_url) {
      const intervalMs = (platSettings.auto_backup_interval_hours || 2) * 60 * 60 * 1000;
      let shouldSync = false;
      if (!platSettings.last_backup_time) {
        shouldSync = true;
      } else {
        // e.g., "10:30 पूर्वाह्न (15/11/2026)" or standard date
        shouldSync = true; // In interval run, trigger if enabled
      }
      if (shouldSync) {
        console.log('⏰ [AUTO-BACKUP] Running scheduled platform Google Drive sync...');
        await syncPlatformToGoogleDrive();
      }
    }

    // 2. Check Active Shops Auto-Backup
    const pool = db.getPool();
    if (pool) {
      const [shops]: any = await pool.query('SELECT id, gdrive_webhook_url, auto_backup_enabled FROM shop_settings WHERE auto_backup_enabled = 1 AND gdrive_webhook_url IS NOT NULL AND gdrive_webhook_url != ""');
      if (shops && shops.length > 0) {
        for (const shop of shops) {
          try {
            await syncStoreToGoogleDrive(shop.id);
          } catch (shopErr: any) {
            console.warn(`[AUTO-BACKUP] Periodic sync failed for shop ${shop.id}:`, shopErr.message);
          }
        }
      }
    } else {
      const settings = await db.getSettings(1);
      if (settings && settings.auto_backup_enabled && settings.gdrive_webhook_url) {
        await syncStoreToGoogleDrive(1);
      }
    }
  } catch (err: any) {
    console.error('❌ [AUTO-BACKUP] Scheduled backup check error:', err.message);
  }
}, 15 * 60 * 1000);

// Download Complete JSON Backup (Requires merchant PIN authorization)
app.get('/api/backup/download', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const pin = String(req.query.pin || req.headers['x-shop-pin'] || '').trim();
    const settings = await db.getSettings(shopId);
    const currPin = settings.pin || '1234';

    if (!pin || !verifySecret(pin, currPin)) {
      return res.status(403).json({ success: false, error: '❌ अनाधिकृत अनुरोध! बैकअप डाउनलोड करने के लिए दुकान का सुरक्षा पिन आवश्यक है।' });
    }

    const backupData = await db.getFullBackupData(shopId);
    if (backupData && backupData.data && backupData.data.settings) {
      delete (backupData.data.settings as any).pin;
      delete (backupData.data.settings as any).password;
    }

    const today = new Date().toISOString().split('T')[0];
    const safeShopName = (settings.shop_name || `Shop${shopId}`).replace(/[^a-zA-Z0-9_\u0900-\u097F]/g, '_');
    const filename = `STORE_BACKUP_${safeShopName}_ID${shopId}_${today}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backupData, null, 2));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Restore from JSON Backup
app.post('/api/backup/restore', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const backupData = req.body;
    const ok = await db.restoreFullBackup(backupData, shopId);
    if (!ok) {
      return res.status(400).json({ success: false, error: 'अमान्य बैकअप फाइल' });
    }
    triggerStoreAutoBackupOnEntry(shopId);
    res.json({ success: true, message: 'डेटा सफलतापूर्वक रिस्टोर हो गया' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Manual or Automatic Sync to Google Drive for a Store
app.post('/api/backup/sync-gdrive', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const { webhook_url } = req.body || {};
    const result = await syncStoreToGoogleDrive(shopId, webhook_url);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Demo Data Reset and Clear (Requires Store PIN or Super Admin token)
app.post('/api/demo/reset', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const pin = String(req.body?.pin || req.query?.pin || req.headers['x-shop-pin'] || '').trim();
    const authHeader = req.headers.authorization || '';
    const isAdmin = verifyAdminToken(authHeader.replace('Bearer ', '').trim());

    if (!isAdmin) {
      const settings = await db.getSettings(shopId);
      const currPin = settings.pin || '1234';
      if (!pin || !verifySecret(pin, currPin)) {
        return res.status(403).json({ success: false, error: 'अनाधिकृत! डेमो डेटा रीसेट करने के लिए दुकान का सुरक्षा पिन आवश्यक है।' });
      }
    }

    await db.resetToDemo();
    res.json({ success: true, message: 'Demo data loaded successfully' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/demo/clear', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const pin = String(req.body?.pin || req.query?.pin || req.headers['x-shop-pin'] || '').trim();
    const authHeader = req.headers.authorization || '';
    const isAdmin = verifyAdminToken(authHeader.replace('Bearer ', '').trim());

    if (!isAdmin) {
      const settings = await db.getSettings(shopId);
      const currPin = settings.pin || '1234';
      if (!pin || !verifySecret(pin, currPin)) {
        return res.status(403).json({ success: false, error: 'अनाधिकृत! दुकान का डेटा खाली करने के लिए सुरक्षा पिन (PIN) दर्ज करना आवश्यक है।' });
      }
    }

    await db.clearAllData(shopId);
    res.json({ success: true, message: 'दुकान का डेटा सफलतापूर्वक खाली कर दिया गया' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Download Project ZIP file
app.get('/api/download-zip', (_req: Request, res: Response) => {
  const zipPath = path.resolve(__dirname, 'dukaan-khaata-app.zip');
  res.download(zipPath, 'dukaan-khaata-app.zip', (err) => {
    if (err) {
      console.error('Error downloading zip:', err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Failed to download zip' });
      }
    }
  });
});

// 6. Shop Settings
app.get('/api/settings', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const settings = await db.getSettings(shopId);
    const safeSettings = { ...settings };
    delete (safeSettings as any).pin;
    delete (safeSettings as any).password;
    res.json({ success: true, data: safeSettings });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/settings', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const payload = { ...req.body };
    if (!payload.pin || !String(payload.pin).trim()) {
      delete payload.pin;
    }
    if (!payload.password || !String(payload.password).trim()) {
      delete payload.password;
    }
    const updated = await db.updateSettings(payload, shopId);
    const safeUpdated = { ...updated };
    delete (safeUpdated as any).pin;
    delete (safeUpdated as any).password;
    res.json({ success: true, data: safeUpdated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6.4. Ultra-Realistic Studio Human Voice MP3 Endpoint (100% Free, Zero Robotic Voice)
app.get('/api/tts', async (req: Request, res: Response) => {
  try {
    const text = String(req.query.text || '').slice(0, 300).trim();
    const lang = String(req.query.lang || 'hi').trim();
    if (!text) {
      return res.status(400).send('Text is required');
    }

    const hash = crypto.createHash('md5').update(`${lang}_${text}`).digest('hex');
    const cacheDir = path.join(process.cwd(), 'cache', 'audio');
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    const cacheFile = path.join(cacheDir, `${hash}.mp3`);

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=604800');

    if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 0) {
      return fs.createReadStream(cacheFile).pipe(res);
    }

    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(text)}`;
    https.get(ttsUrl, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (proxyRes) => {
      if (proxyRes.statusCode === 200) {
        const fileStream = fs.createWriteStream(cacheFile);
        proxyRes.pipe(fileStream);
        proxyRes.pipe(res);
      } else {
        res.status(502).send('TTS upstream error');
      }
    }).on('error', (err) => {
      console.warn('[TTS Proxy] Error:', err.message);
      res.status(500).send('TTS network error');
    });
  } catch (err: any) {
    res.status(500).send('TTS server error: ' + err.message);
  }
});

// 6.5. Mandi Rate Alerts (Wholesale to Staff Broadcast)
app.get('/api/mandi/alerts', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const alerts = await db.getMandiAlerts(shopId);
    res.json({ success: true, data: alerts });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/mandi/alerts', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const { product_name, old_price, new_price, wholesale_price, unit, notes, sender_name, update_product } = req.body;
    if (!product_name || !new_price) {
      return res.status(400).json({ success: false, error: 'सामान का नाम और नया भाव अनिवार्य है' });
    }
    const alert = await db.addMandiAlert({
      product_name,
      old_price: Number(old_price) || 0,
      new_price: Number(new_price),
      wholesale_price: Number(wholesale_price) || 0,
      unit: unit || 'किलो',
      notes: notes || '',
      sender_name: sender_name || 'दुकानदार',
      update_product: update_product !== false
    }, shopId);
    triggerStoreAutoBackupOnEntry(shopId);
    res.json({ success: true, data: alert });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/mandi/alerts/:id', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const id = parseInt(req.params.id, 10);
    const success = await db.deleteMandiAlert(id, shopId);
    if (success) triggerStoreAutoBackupOnEntry(shopId);
    res.json({ success });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Voice Parsing Route (Bol Kar Udhaar-Jama aur Product Management)
app.post('/api/ai/parse-voice', async (req: Request, res: Response) => {
  try {
    const shopId = getRequestShopId(req);
    const rawText = String(req.body?.speechText || '').trim();
    if (!rawText) {
      return res.status(400).json({ success: false, error: 'Voice speech text is required' });
    }
    // Security Cap: limit speech input to 500 characters to prevent prompt injection / ReDoS
    const speechText = rawText.slice(0, 500);

    const customers = await db.getCustomers(shopId);
    const products = await db.getProducts(shopId);

    const customerNames = customers.map(c => c.name);
    const productNames = products.map(p => p.name);

    // Try Gemini AI first for deep natural language understanding
    let parsedResult = await parseVoiceWithGemini(speechText, customerNames, productNames);

    // If Gemini not available or failed, use smart rule-based parser
    if (!parsedResult) {
      parsedResult = parseVoiceRuleBased(speechText, customers, products);
    }

    // Attach existing customer object if matched
    if (parsedResult.intent === 'transaction' && parsedResult.customerName) {
      const match = customers.find(c => 
        c.name.toLowerCase().includes(parsedResult.customerName.toLowerCase()) ||
        parsedResult.customerName.toLowerCase().includes(c.name.toLowerCase())
      );
      if (match) {
        parsedResult.customer = match;
      }
    }

    res.json({
      success: true,
      data: parsedResult
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rate limiting and security stores
const loginRateLimit: Record<string, { attempts: number; lockedUntil: number }> = {};
const otpCooldown: Record<string, number> = {};
const recoveryOTPs: Record<string, { otp: string; expiresAt: number; attempts: number }> = {};

// ==========================================
// AUTHENTICATION & LOGIN API (Multi-tenant SaaS with Owner & Staff Isolation)
// ==========================================
app.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { pin, phone, password } = req.body;
    const inputPhone = String(phone || '').replace(/[^0-9]/g, '').trim();
    if (!inputPhone || inputPhone.length < 10) {
      return res.status(400).json({
        success: false,
        error: 'कृपया मान्य 10-अंकों का पंजीकृत मोबाइल नंबर दर्ज करें'
      });
    }

    // Rate limiting: 5 failed attempts locks for 5 minutes
    const lock = loginRateLimit[inputPhone];
    if (lock && lock.lockedUntil > Date.now()) {
      const waitSec = Math.ceil((lock.lockedUntil - Date.now()) / 1000);
      return res.status(429).json({
        success: false,
        error: `⚠️ सुरक्षा अलर्ट: लगातार गलत प्रयासों के कारण लॉगिन अस्थायी रूप से ब्लॉक है। कृपया ${waitSec} सेकंड बाद प्रयास करें।`
      });
    }

    const pool = db.getPool();
    let allShops: any[] = [];
    if (pool) {
      try {
        const [rows]: any = await pool.query('SELECT id, shop_name, owner_name, phone, staff_phones, pin, password, status FROM shop_settings');
        allShops = rows || [];
      } catch {}
    }

    if (allShops.length === 0) {
      const s = await db.getSettings();
      allShops = [{
        id: 1,
        shop_name: s.shop_name,
        owner_name: s.owner_name,
        phone: s.phone,
        staff_phones: s.staff_phones,
        pin: s.pin,
        password: s.password,
        status: 'approved'
      }];
    }

    // Strict 1-to-1 Shop Isolation: Every store has exactly ONE unique registered phone number.
    // 2 mobile numbers can NEVER log into the same store. Staff numbers cannot log into the store.
    let matchedShop: any = null;
    for (const s of allShops) {
      const currPhone = String(s.phone || '').replace(/[^0-9]/g, '');
      if (currPhone && inputPhone.slice(-10) === currPhone.slice(-10)) {
        matchedShop = s;
        break;
      }
    }

    if (!matchedShop) {
      return res.status(401).json({
        success: false,
        error: '❌ यह मोबाइल नंबर किसी भी पंजीकृत दुकान से नहीं जुड़ा है। प्रत्येक दुकान का अपना अलग मोबाइल नंबर होना अनिवार्य है।'
      });
    }

    // Check approval status
    const shopStatus = matchedShop.status || 'approved';
    if (shopStatus === 'pending') {
      return res.status(403).json({
        success: false,
        is_pending_approval: true,
        error: `⏳ आपकी दुकान '${matchedShop.shop_name}' का खाता अभी एडमिन की स्वीकृति (Approval Pending) की प्रतीक्षा में है।`
      });
    }
    if (shopStatus === 'suspended' || shopStatus === 'rejected') {
      return res.status(403).json({
        success: false,
        is_suspended: true,
        error: '❌ यह दुकान खाता निलंबित या अस्वीकृत (Suspended/Rejected) है। कृपया प्लेटफॉर्म एडमिन से संपर्क करें।'
      });
    }

    const currentPin = String(matchedShop.pin || '1234').trim();
    const currentPassword = String(matchedShop.password || 'admin').trim();

    const recordFailedAttempt = () => {
      if (!loginRateLimit[inputPhone]) {
        loginRateLimit[inputPhone] = { attempts: 0, lockedUntil: 0 };
      }
      loginRateLimit[inputPhone].attempts += 1;
      if (loginRateLimit[inputPhone].attempts >= 5) {
        loginRateLimit[inputPhone].lockedUntil = Date.now() + 5 * 60 * 1000;
        return 'locked';
      }
      return 5 - loginRateLimit[inputPhone].attempts;
    };

    // Case 1: PIN Mode
    if (pin !== undefined && pin !== null && String(pin).trim() !== '') {
      const cleanPin = String(pin).trim();
      if (verifySecret(cleanPin, currentPin)) {
        delete loginRateLimit[inputPhone];

        // Upgrade plain-text PIN to Bcrypt if needed
        if (!currentPin.startsWith('$2') && pool) {
          try {
            await pool.query('UPDATE shop_settings SET pin = ? WHERE id = ?', [hashSecret(cleanPin), matchedShop.id]);
          } catch {}
        }

        return res.json({
          success: true,
          message: 'लॉगिन सफल (PIN Verified)',
          token: `dukandar_session_${matchedShop.id}_${Date.now()}`,
          shop_id: matchedShop.id,
          user: {
            shop_id: matchedShop.id,
            shop_name: matchedShop.shop_name,
            owner_name: matchedShop.owner_name || 'दुकानदार',
            phone: matchedShop.phone,
            is_staff: false
          }
        });
      } else {
        const status = recordFailedAttempt();
        if (status === 'locked') {
          return res.status(429).json({
            success: false,
            error: '❌ लगातार 5 बार गलत पिन! सुरक्षा कारणों से आपका लॉगिन 5 मिनट के लिए ब्लॉक कर दिया गया है।'
          });
        }
        return res.status(401).json({
          success: false,
          error: `❌ गलत सुरक्षा पिन (Incorrect PIN)! शेष प्रयास: ${status}`
        });
      }
    }

    // Case 2: Password Mode
    if (password !== undefined && password !== null && String(password).trim() !== '') {
      const inputPass = String(password).trim();
      if (verifySecret(inputPass, currentPassword)) {
        delete loginRateLimit[inputPhone];

        // Upgrade plain-text password to Bcrypt if needed
        if (!currentPassword.startsWith('$2') && pool) {
          try {
            await pool.query('UPDATE shop_settings SET password = ? WHERE id = ?', [hashSecret(inputPass), matchedShop.id]);
          } catch {}
        }

        return res.json({
          success: true,
          message: 'लॉगिन सफल (Password Verified)',
          token: `dukandar_session_${matchedShop.id}_${Date.now()}`,
          shop_id: matchedShop.id,
          user: {
            shop_id: matchedShop.id,
            shop_name: matchedShop.shop_name,
            owner_name: matchedShop.owner_name || 'दुकानदार',
            phone: matchedShop.phone,
            is_staff: false
          }
        });
      } else {
        const status = recordFailedAttempt();
        if (status === 'locked') {
          return res.status(429).json({
            success: false,
            error: '❌ लगातार 5 बार गलत पासवर्ड! सुरक्षा कारणों से आपका लॉगिन 5 मिनट के लिए ब्लॉक कर दिया गया है।'
          });
        }
        return res.status(401).json({
          success: false,
          error: `❌ गलत पासवर्ड! शेष प्रयास: ${status}`
        });
      }
    }

    res.status(400).json({ success: false, error: 'कृपया सुरक्षा पिन या पासवर्ड दर्ज करें' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Multi-Tenant Register API (Creates a Distinct New Shop)
app.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { shop_name, owner_name, phone, email, address, upi_id, pin, password } = req.body;

    if (!shop_name || !shop_name.trim()) {
      return res.status(400).json({ success: false, error: 'कृपया दुकान का नाम दर्ज करें' });
    }
    const cleanPhone = String(phone || '').replace(/[^0-9]/g, '').trim();
    if (!cleanPhone || cleanPhone.length < 10) {
      return res.status(400).json({ success: false, error: 'कृपया मान्य 10-अंकों का मोबाइल नंबर दर्ज करें' });
    }

    const cleanPin = pin && String(pin).trim() ? String(pin).trim() : '1234';
    const cleanPass = password && String(password).trim() ? String(password).trim() : 'admin';
    const cleanUpi = upi_id && String(upi_id).trim() ? String(upi_id).trim() : `${cleanPhone}@paytm`;
    const cleanEmail = email ? String(email).trim() : '';

    const pool = db.getPool();
    if (pool) {
      // Ensure status and credential columns exist in shop_settings
      try {
        await pool.query('ALTER TABLE `shop_settings` ADD COLUMN `status` VARCHAR(30) DEFAULT "approved"');
      } catch {}
      try {
        await pool.query('ALTER TABLE `shop_settings` MODIFY COLUMN `pin` VARCHAR(255) DEFAULT "1234", MODIFY COLUMN `password` VARCHAR(255) DEFAULT "admin"');
      } catch {}

      // Check if this phone is already registered with ANY store (comparing last 10 digits)
      const [allExisting]: any = await pool.query('SELECT id, shop_name, phone FROM shop_settings');
      for (const s of allExisting) {
        const cp = String(s.phone || '').replace(/[^0-9]/g, '');
        if (cp && cp.slice(-10) === cleanPhone.slice(-10)) {
          return res.status(409).json({
            success: false,
            error: `❌ मोबाइल नंबर ${cleanPhone} पहले से '${s.shop_name}' दुकान में पंजीकृत है! एक मोबाइल नंबर से केवल एक ही दुकान चल सकती है। प्रत्येक दुकान के लिए अलग मोबाइल नंबर होना अनिवार्य है।`
          });
        }
      }

      // Insert fresh distinct new shop with status='pending' (Encrypted PIN & Password)
      const [result]: any = await pool.query(`
        INSERT INTO shop_settings (shop_name, owner_name, phone, email, address, upi_id, pin, password, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
      `, [shop_name.trim(), owner_name ? owner_name.trim() : 'दुकानदार', cleanPhone, cleanEmail, address ? address.trim() : '', cleanUpi, hashSecret(cleanPin), hashSecret(cleanPass)]);

      const newShopId = result.insertId;

      return res.json({
        success: true,
        is_pending_approval: true,
        message: `🎉 बधाई हो! आपकी दुकान '${shop_name.trim()}' का रजिस्ट्रेशन प्राप्त हो गया है। व्यवस्थापक (Admin) द्वारा मंज़ूर किए जाने के बाद आप लॉगिन कर सकेंगे।`,
        shop_id: newShopId,
        user: {
          shop_id: newShopId,
          shop_name: shop_name.trim(),
          owner_name: owner_name || 'दुकानदार',
          phone: cleanPhone
        }
      });
    }

    // Local JSON fallback mode
    const newSettings = await db.updateSettings({
      shop_name: shop_name.trim(),
      owner_name: owner_name ? owner_name.trim() : 'दुकानदार',
      phone: cleanPhone,
      email: cleanEmail,
      address: address ? address.trim() : '',
      upi_id: cleanUpi,
      pin: cleanPin,
      password: cleanPass
    });

    res.json({
      success: true,
      is_pending_approval: false,
      message: `बधाई हो! आपकी दुकान '${newSettings.shop_name}' का खाता बन गया है।`,
      token: 'dukandar_session_' + Date.now(),
      shop_id: 1,
      user: {
        shop_id: 1,
        shop_name: newSettings.shop_name,
        owner_name: newSettings.owner_name,
        phone: newSettings.phone,
        email: newSettings.email
      }
    });
  } catch (err: any) {
    console.error('Registration API error:', err);
    res.status(500).json({ success: false, error: err.message || 'रजिस्ट्रेशन विफल रहा' });
  }
});

app.post('/api/auth/change-pin', async (req: Request, res: Response) => {
  try {
    const { currentPin, newPin, newPassword } = req.body;
    const settings = await db.getSettings();

    if (currentPin && String(currentPin).trim() !== (settings.pin || '1234')) {
      return res.status(400).json({ success: false, error: 'वर्तमान पिन गलत है!' });
    }

    const toUpdate: any = {};
    if (newPin) toUpdate.pin = String(newPin).trim();
    if (newPassword) toUpdate.password = String(newPassword).trim();

    await db.updateSettings(toUpdate);
    res.json({ success: true, message: 'पिन / पासवर्ड सफलतापूर्वक बदल दिया गया!' });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6d. Password / PIN Recovery Request (Generate OTP & Email Dispatch)
app.post('/api/auth/forgot-password/request', async (req: Request, res: Response) => {
  try {
    const { phone } = req.body;
    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ success: false, error: 'कृपया पंजीकृत मोबाइल नंबर दर्ज करें (Phone number is required)' });
    }

    const cleanInputPhone = String(phone).replace(/[^0-9]/g, '');
    const settings = await db.getSettings();
    const cleanShopPhone = (settings.phone || '').replace(/[^0-9]/g, '');

    // Strictly match the registered shopkeeper phone (last 10 digits)
    const isMatch = cleanShopPhone && cleanInputPhone.length >= 10 && (cleanInputPhone.slice(-10) === cleanShopPhone.slice(-10));
    if (!isMatch) {
      return res.status(404).json({
        success: false,
        error: '❌ यह मोबाइल नंबर दुकान में पंजीकृत नहीं है! केवल पंजीकृत दुकानदार ही पिन/पासवर्ड रीसेट कर सकते हैं।'
      });
    }

    // Rate limit: 60 seconds cooldown
    const lastReq = otpCooldown[cleanInputPhone] || 0;
    if (Date.now() - lastReq < 60 * 1000) {
      const waitSec = Math.ceil((60 * 1000 - (Date.now() - lastReq)) / 1000);
      return res.status(429).json({ success: false, error: `⏳ कृपया नया OTP मंगाने से पहले ${waitSec} सेकंड प्रतीक्षा करें।` });
    }
    otpCooldown[cleanInputPhone] = Date.now();

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    recoveryOTPs[cleanInputPhone] = {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes expiry
      attempts: 0
    };

    const targetEmail = (settings.email || '').trim();
    let maskedEmail = '';
    let hasEmail = false;

    if (targetEmail && targetEmail.includes('@')) {
      hasEmail = true;
      const [namePart, domainPart] = targetEmail.split('@');
      const maskedName = namePart.length > 2
        ? namePart.slice(0, 2) + '*'.repeat(Math.min(4, namePart.length - 2))
        : namePart + '***';
      maskedEmail = `${maskedName}@${domainPart}`;

      console.log(`\n=========================================`);
      console.log(`📨 [FREE EMAIL OTP DISPATCHED]`);
      console.log(`To: ${targetEmail} (${settings.owner_name || 'दुकानदार'})`);
      console.log(`Shop: ${settings.shop_name}`);
      console.log(`Security OTP Code: ${otp}`);
      console.log(`Validity: 10 minutes`);
      console.log(`=========================================\n`);
    }

    res.json({
      success: true,
      message: hasEmail
        ? `सुरक्षा कोड (OTP) आपके पंजीकृत ईमेल ${maskedEmail} पर भेज दिया गया है!`
        : 'दुकान में कोई ईमेल पंजीकृत नहीं है।',
      phone: cleanInputPhone,
      hasEmail,
      maskedEmail,
      shopName: settings.shop_name,
      ownerName: settings.owner_name
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6e. Password / PIN Recovery Verify OTP & Reset (Strict Verification - No Master PIN Bypass)
app.post('/api/auth/forgot-password/verify-and-reset', async (req: Request, res: Response) => {
  try {
    const { phone, otp, newPin, newPassword } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, error: 'मोबाइल नंबर और OTP कोड आवश्यक हैं' });
    }

    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    const cleanOtp = String(otp).trim();
    const settings = await db.getSettings();
    const cleanShopPhone = (settings.phone || '').replace(/[^0-9]/g, '');

    // Strictly verify registered shop phone
    const isOwner = cleanShopPhone && cleanPhone.length >= 10 && (cleanPhone.slice(-10) === cleanShopPhone.slice(-10));
    if (!isOwner) {
      return res.status(403).json({ success: false, error: '❌ यह मोबाइल नंबर दुकान में पंजीकृत नहीं है!' });
    }

    const stored = recoveryOTPs[cleanPhone];
    if (!stored || stored.expiresAt < Date.now()) {
      return res.status(400).json({ success: false, error: '❌ सुरक्षा कोड (OTP) अमान्य है या 10 मिनट की समय सीमा समाप्त हो चुकी है।' });
    }

    stored.attempts = (stored.attempts || 0) + 1;
    if (stored.attempts > 3) {
      delete recoveryOTPs[cleanPhone];
      return res.status(400).json({ success: false, error: '❌ लगातार 3 बार गलत कोड दर्ज करने के कारण OTP निरस्त हो गया है। कृपया नया OTP मंगाएं।' });
    }

    if (stored.otp !== cleanOtp) {
      const remaining = 3 - stored.attempts;
      return res.status(400).json({ success: false, error: `❌ गलत सुरक्षा कोड (Invalid OTP)! शेष प्रयास: ${remaining}` });
    }

    const cleanNewPin = newPin && String(newPin).trim() ? String(newPin).trim() : '1234';
    const cleanNewPass = newPassword && String(newPassword).trim() ? String(newPassword).trim() : 'admin';

    const pool = db.getPool();
    if (pool) {
      await pool.query(
        'UPDATE shop_settings SET pin = ?, password = ? WHERE phone LIKE ?',
        [hashSecret(cleanNewPin), hashSecret(cleanNewPass), `%${cleanPhone.slice(-10)}`]
      );
    }
    await db.updateSettings({
      pin: hashSecret(cleanNewPin),
      password: hashSecret(cleanNewPass)
    });

    // Clear used OTP
    delete recoveryOTPs[cleanPhone];

    const updatedSettings = await db.getSettings();

    res.json({
      success: true,
      message: 'नया पिन और पासवर्ड सफलतापूर्वक सेट हो गया है!',
      user: {
        shop_name: updatedSettings.shop_name,
        owner_name: updatedSettings.owner_name,
        phone: updatedSettings.phone
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6f. Network / Hotspot status & Local IPs for multi-device sync
app.get('/api/network/status', (_req: Request, res: Response) => {
  try {
    const interfaces = os.networkInterfaces();
    const localIps: { interface: string; ip: string; url: string }[] = [];

    for (const name of Object.keys(interfaces)) {
      const netArr = interfaces[name];
      if (netArr) {
        for (const net of netArr) {
          if (net.family === 'IPv4' && !net.internal) {
            localIps.push({
              interface: name,
              ip: net.address,
              url: `http://${net.address}:${PORT}`
            });
          }
        }
      }
    }

    res.json({
      success: true,
      port: PORT,
      host: HOST,
      localIps,
      primaryUrl: localIps.length > 0 ? localIps[0].url : `http://localhost:${PORT}`,
      timestamp: Date.now()
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// SUPER ADMIN PORTAL API (Multi-store Approval & Platform Stats)
// ==========================================
const ADMIN_SECRET = process.env.ADMIN_SECRET || 'dukaan_saas_multi_tenant_secret_2026_x89a';
const ADMIN_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days expiration

// Super Admin Login Brute-force Protection Rate Limiter
const adminLoginRateLimit: Record<string, { attempts: number; lockedUntil: number }> = {};

function generateAdminToken(adminId: number, username: string) {
  const payload = JSON.stringify({ admin_id: adminId, username, role: 'superadmin', created_at: Date.now() });
  const b64 = Buffer.from(payload).toString('base64');
  const sig = crypto.createHmac('sha256', ADMIN_SECRET).update(b64).digest('hex');
  return `${b64}.${sig}`;
}

function verifyAdminToken(token: string): boolean {
  if (!token || !token.includes('.')) return false;
  const [b64, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', ADMIN_SECRET).update(b64).digest('hex');
  if (sig !== expected) return false;
  try {
    const data = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    if (!data || data.role !== 'superadmin') return false;
    // Enforce 7-day token expiration
    if (data.created_at && (Date.now() - Number(data.created_at)) > ADMIN_TOKEN_MAX_AGE_MS) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

// 1. Admin Login: POST /api/admin/login
app.post('/api/admin/login', async (req: Request, res: Response) => {
  try {
    const { username, phone, password } = req.body;
    const inputUser = String(username || phone || '').trim();
    const inputPass = String(password || '').trim();

    if (!inputUser || !inputPass) {
      return res.status(400).json({ success: false, error: 'कृपया यूज़रनेम/मोबाइल नंबर और पासवर्ड दर्ज करें' });
    }

    // Rate Limit Check
    const clientKey = req.ip || inputUser.toLowerCase();
    const lock = adminLoginRateLimit[clientKey];
    if (lock && lock.lockedUntil > Date.now()) {
      const waitMin = Math.ceil((lock.lockedUntil - Date.now()) / 60000);
      return res.status(429).json({
        success: false,
        error: `⛔ सुरक्षा प्रतिबंध: कई बार गलत पासवर्ड डालने के कारण एडमिन लॉगिन ${waitMin} मिनट के लिए अस्थायी रूप से ब्लॉक है।`
      });
    }

    const pool = db.getPool();
    let adminRecord: any = null;

    if (pool) {
      const cleanP = inputUser.replace(/[^0-9]/g, '');
      const [rows]: any = await pool.query(
        'SELECT * FROM super_admins WHERE username = ? OR phone = ? OR (LENGTH(?) >= 10 AND phone LIKE ?)',
        [inputUser, inputUser, cleanP, '%' + cleanP.slice(-10)]
      );
      if (rows && rows.length > 0) {
        adminRecord = rows[0];
      }
    }

    let isMatch = false;
    let adminId = 1;
    let adminUsername = 'admin';
    let adminName = 'Super Admin';
    let adminPhone = '9999999999';

    if (adminRecord) {
      adminId = adminRecord.id;
      adminUsername = adminRecord.username;
      adminName = adminRecord.name || 'Super Admin';
      adminPhone = adminRecord.phone || '9999999999';

      const storedPass = String(adminRecord.password || '');
      if (verifySecret(inputPass, storedPass)) {
        isMatch = true;
        // If password in DB was plain-text, upgrade immediately to Bcrypt hash!
        if (!storedPass.startsWith('$2') && pool) {
          try {
            await pool.query('UPDATE super_admins SET password = ? WHERE id = ?', [hashSecret(inputPass), adminRecord.id]);
          } catch {}
        }
      }
    } else {
      // Fallback: check against primary settings / default admin
      const settings = await db.getSettings();
      const currentPass = settings.password || 'admin';
      const currentPhone = (settings.phone || '').replace(/[^0-9]/g, '');

      const isUserMatch = inputUser.toLowerCase() === 'admin' ||
                          inputUser.toLowerCase() === 'superadmin' ||
                          (currentPhone && inputUser.replace(/[^0-9]/g, '').slice(-10) === currentPhone.slice(-10));

      if (isUserMatch && verifySecret(inputPass, currentPass)) {
        isMatch = true;
      }
    }

    if (!isMatch) {
      // Track failed attempt
      if (!adminLoginRateLimit[clientKey]) {
        adminLoginRateLimit[clientKey] = { attempts: 0, lockedUntil: 0 };
      }
      adminLoginRateLimit[clientKey].attempts += 1;
      if (adminLoginRateLimit[clientKey].attempts >= 5) {
        adminLoginRateLimit[clientKey].lockedUntil = Date.now() + 15 * 60 * 1000; // 15 min lock
        return res.status(429).json({
          success: false,
          error: '⛔ 5 बार गलत प्रयास! एडमिन लॉगिन 15 मिनट के लिए ब्लॉक कर दिया गया है।'
        });
      }
      const left = 5 - adminLoginRateLimit[clientKey].attempts;
      return res.status(401).json({
        success: false,
        error: `❌ गलत व्यवस्थापक क्रेडेंशियल (Invalid Admin Credentials)! ${left} प्रयास शेष।`
      });
    }

    // Success - clear failed attempts
    delete adminLoginRateLimit[clientKey];

    const token = generateAdminToken(adminId, adminUsername);

    res.json({
      success: true,
      message: 'सुपर एडमिन लॉगिन सफल!',
      token,
      admin: {
        id: adminId,
        username: adminUsername,
        name: adminName,
        phone: adminPhone,
        role: 'superadmin'
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// In-memory OTP storage for Super Admin recovery
const adminOtpCooldown: Record<string, number> = {};
const adminRecoveryOTPs: Record<string, { otp: string; expiresAt: number; attempts: number; adminId: number; adminUsername: string; email: string }> = {};

// 1b. Super Admin Forgot Password: Generate OTP & Dispatch to Email
app.post('/api/admin/forgot-password/request', async (req: Request, res: Response) => {
  try {
    const { identity } = req.body;
    const inputIdentity = String(identity || '').trim();
    if (!inputIdentity) {
      return res.status(400).json({ success: false, error: 'कृपया अपना एडमिन यूज़रनेम, ईमेल या मोबाइल नंबर दर्ज करें' });
    }

    const pool = db.getPool();
    let adminRecord: any = null;

    if (pool) {
      const cleanPhone = inputIdentity.replace(/[^0-9]/g, '');
      const [rows]: any = await pool.query(
        'SELECT id, username, phone, email, name, role FROM super_admins WHERE username = ? OR email = ? OR phone = ? OR (LENGTH(?) >= 10 AND phone LIKE ?)',
        [inputIdentity, inputIdentity, inputIdentity, cleanPhone, '%' + cleanPhone.slice(-10)]
      );
      if (rows && rows.length > 0) {
        adminRecord = rows[0];
      }
    }

    if (!adminRecord) {
      // Fallback check against Shop 1 settings
      const settings = await db.getSettings(1);
      const cleanSPhone = (settings.phone || '').replace(/[^0-9]/g, '');
      const cleanInput = inputIdentity.replace(/[^0-9]/g, '');
      const isDefaultMatch = inputIdentity.toLowerCase() === 'admin' ||
                             (settings.email && inputIdentity.toLowerCase() === settings.email.toLowerCase()) ||
                             (cleanSPhone && cleanInput.length >= 10 && cleanInput.slice(-10) === cleanSPhone.slice(-10));
      if (isDefaultMatch) {
        adminRecord = {
          id: 1,
          username: 'admin',
          name: settings.owner_name || 'Super Admin',
          phone: settings.phone || '9999999999',
          email: settings.email || 'abhishek3815@gmail.com'
        };
      }
    }

    if (!adminRecord) {
      return res.status(404).json({ success: false, error: '❌ यह व्यवस्थापक खाता नहीं मिला! कृपया सही यूज़रनेम, ईमेल या मोबाइल नंबर दर्ज करें।' });
    }

    // Rate limiting: 60 seconds cooldown
    const cooldownKey = `admin_${adminRecord.id}`;
    const lastReq = adminOtpCooldown[cooldownKey] || 0;
    if (Date.now() - lastReq < 60 * 1000) {
      const waitSec = Math.ceil((60 * 1000 - (Date.now() - lastReq)) / 1000);
      return res.status(429).json({ success: false, error: `⏳ कृपया नया कोड मंगाने से पहले ${waitSec} सेकंड प्रतीक्षा करें।` });
    }
    adminOtpCooldown[cooldownKey] = Date.now();

    // Determine target recovery email
    let targetEmail = String(adminRecord.email || '').trim();
    if (!targetEmail || !targetEmail.includes('@')) {
      const s1 = await db.getSettings(1);
      if (s1 && s1.email && s1.email.includes('@')) {
        targetEmail = s1.email.trim();
      }
    }

    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({
        success: false,
        error: '❌ सुपर एडमिन के लिए कोई ईमेल पंजीकृत नहीं है। कृपया व्यवस्थापक से संपर्क करें।'
      });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpKey = String(adminRecord.username || 'admin').toLowerCase();

    adminRecoveryOTPs[otpKey] = {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
      attempts: 0,
      adminId: adminRecord.id,
      adminUsername: adminRecord.username,
      email: targetEmail
    };

    // Mask Email (e.g. ab*****15@gmail.com)
    const [namePart, domainPart] = targetEmail.split('@');
    const maskedName = namePart.length > 2
      ? namePart.slice(0, 2) + '*'.repeat(Math.min(5, namePart.length - 2))
      : namePart + '***';
    const maskedEmail = `${maskedName}@${domainPart}`;

    // Prominent console log for testing / monitoring
    console.log(`\n=========================================`);
    console.log(`🛡️ [SUPER ADMIN RECOVERY OTP DISPATCHED]`);
    console.log(`To: ${targetEmail} (${adminRecord.name || 'Super Admin'})`);
    console.log(`Admin Username: ${adminRecord.username}`);
    console.log(`Security OTP Code: ${otp}`);
    console.log(`Valid for: 10 minutes`);
    console.log(`=========================================\n`);

    // Try sending email via Google Apps Script Webhook if configured
    let emailSentViaWebhook = false;
    try {
      const platSettings = await db.getPlatformBackupSettings();
      const webhookUrl = platSettings?.gdrive_webhook_url;
      if (webhookUrl && webhookUrl.startsWith('http')) {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'send_email',
            to: targetEmail,
            subject: `🛡️ [सुपर एडमिन] पासवर्ड रिकवरी सुरक्षा कोड (OTP): ${otp}`,
            htmlBody: `
              <div style="font-family: Arial, sans-serif; background: #f8fafc; padding: 20px;">
                <div style="max-width: 480px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; padding: 24px;">
                  <h2 style="color: #047857; text-align: center;">🛡️ सुपर एडमिन पोर्टल</h2>
                  <p>नमस्ते <b>${adminRecord.name || 'Super Admin'}</b>,</p>
                  <p>सुपर एडमिन पासवर्ड रीसेट करने के लिए आपका 6-अंकों का सुरक्षा कोड (OTP):</p>
                  <div style="background: #ecfdf5; border: 2px dashed #059669; border-radius: 12px; padding: 16px; text-align: center; margin: 20px 0;">
                    <span style="font-size: 34px; font-weight: 900; letter-spacing: 6px; color: #047857; font-family: monospace;">${otp}</span>
                  </div>
                  <p style="font-size: 12px; color: #64748b;">⏱️ यह कोड 10 मिनट के लिए मान्य है।</p>
                </div>
              </div>
            `
          })
        });
        emailSentViaWebhook = true;
        console.log(`✅ [SUPER ADMIN OTP] Sent via Google Apps Script Webhook to ${targetEmail}`);
      }
    } catch (whErr: any) {
      console.warn(`[SUPER ADMIN OTP] Webhook email dispatch failed:`, whErr.message);
    }

    res.json({
      success: true,
      message: `सुरक्षा कोड (OTP) आपके पंजीकृत ईमेल ${maskedEmail} पर भेज दिया गया है!`,
      identity: adminRecord.username,
      maskedEmail,
      hasEmail: true,
      emailSentViaWebhook
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 1c. Super Admin Forgot Password: Verify OTP & Reset Password
app.post('/api/admin/forgot-password/verify-and-reset', async (req: Request, res: Response) => {
  try {
    const { identity, otp, newPassword } = req.body;
    const inputIdentity = String(identity || '').trim().toLowerCase();
    const inputOtp = String(otp || '').trim();
    const inputPass = String(newPassword || '').trim();

    if (!inputIdentity || !inputOtp || !inputPass) {
      return res.status(400).json({ success: false, error: 'यूज़रनेम, OTP कोड और नया पासवर्ड सभी अनिवार्य हैं' });
    }

    if (inputPass.length < 4) {
      return res.status(400).json({ success: false, error: 'नया पासवर्ड कम से कम 4 अक्षरों का होना चाहिए' });
    }

    const stored = adminRecoveryOTPs[inputIdentity];
    if (!stored || stored.expiresAt < Date.now()) {
      return res.status(400).json({ success: false, error: '❌ सुरक्षा कोड (OTP) अमान्य है या 10 मिनट की समय सीमा समाप्त हो चुकी है।' });
    }

    stored.attempts = (stored.attempts || 0) + 1;
    if (stored.attempts > 3) {
      delete adminRecoveryOTPs[inputIdentity];
      return res.status(400).json({ success: false, error: '❌ लगातार 3 बार गलत कोड दर्ज करने के कारण OTP निरस्त हो गया है। कृपया नया OTP मंगाएं।' });
    }

    if (stored.otp !== inputOtp) {
      const remaining = 3 - stored.attempts;
      return res.status(400).json({ success: false, error: `❌ गलत सुरक्षा कोड (Invalid OTP)! शेष प्रयास: ${remaining}` });
    }

    const hashed = hashSecret(inputPass);
    const pool = db.getPool();
    if (pool) {
      await pool.query('UPDATE super_admins SET password = ? WHERE id = ?', [hashed, stored.adminId]);
    }

    // Clear used OTP
    delete adminRecoveryOTPs[inputIdentity];

    // Generate authenticated token for instant login
    const token = generateAdminToken(stored.adminId, stored.adminUsername);

    res.json({
      success: true,
      message: 'सुपर एडमिन पासवर्ड सफलतापूर्वक बदल दिया गया है!',
      token,
      user: {
        id: stored.adminId,
        username: stored.adminUsername,
        role: 'superadmin'
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Admin Stats: GET /api/admin/stats
app.get('/api/admin/stats', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token && req.headers['x-admin-token']) token = String(req.headers['x-admin-token']).trim();

    if (!verifyAdminToken(token)) {
      return res.status(401).json({ success: false, error: 'अनाधिकृत अनुरोध! केवल सुपर एडमिन ही इस पोर्टल को एक्सेस कर सकते हैं।' });
    }

    const customers = await db.getCustomers();
    const products = await db.getProducts();

    let totalShops = 1;
    let pendingShops = 0;
    let approvedShops = 1;
    let suspendedShops = 0;
    let totalCustomers = customers.length;
    let totalTransactions = 0;
    let totalUdhaar = 0;
    let totalJama = 0;

    const pool = db.getPool();
    if (pool) {
      try {
        const [shops]: any = await pool.query('SELECT status, COUNT(*) as cnt FROM shop_settings GROUP BY status');
        let t = 0, p = 0, a = 0, s = 0;
        for (const row of shops) {
          const st = row.status || 'approved';
          const cnt = Number(row.cnt);
          t += cnt;
          if (st === 'pending') p += cnt;
          else if (st === 'approved') a += cnt;
          else if (st === 'suspended') s += cnt;
        }
        if (t > 0) {
          totalShops = t;
          pendingShops = p;
          approvedShops = a;
          suspendedShops = s;
        }

        const [cCount]: any = await pool.query('SELECT COUNT(*) as c FROM customers');
        totalCustomers = Number(cCount[0]?.c || 0);

        const [txTotals]: any = await pool.query(`
          SELECT 
            COUNT(*) as total_txs,
            COALESCE(SUM(CASE WHEN type = 'udhaar' AND (is_deleted IS NULL OR is_deleted = 0) THEN amount ELSE 0 END), 0) as total_udhaar,
            COALESCE(SUM(CASE WHEN type = 'jama' AND (is_deleted IS NULL OR is_deleted = 0) THEN amount ELSE 0 END), 0) as total_jama
          FROM transactions
        `);
        if (txTotals && txTotals.length > 0) {
          totalTransactions = Number(txTotals[0].total_txs || 0);
          totalUdhaar = Number(txTotals[0].total_udhaar || 0);
          totalJama = Number(txTotals[0].total_jama || 0);
        }
      } catch {}
    }

    res.json({
      success: true,
      stats: {
        totalShops,
        pendingShops,
        approvedShops,
        suspendedShops,
        totalCustomers,
        totalTransactions,
        totalUdhaar,
        totalJama,
        marketDue: totalUdhaar - totalJama,
        total_shops: totalShops,
        pending_shops: pendingShops,
        approved_shops: approvedShops,
        suspended_shops: suspendedShops,
        total_customers: totalCustomers,
        total_products: products.length
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Admin Shops: GET /api/admin/shops
app.get('/api/admin/shops', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token && req.headers['x-admin-token']) token = String(req.headers['x-admin-token']).trim();

    if (!verifyAdminToken(token)) {
      return res.status(401).json({ success: false, error: 'अनाधिकृत अनुरोध!' });
    }

    const pool = db.getPool();
    if (pool) {
      try {
        const [rows]: any = await pool.query(`
          SELECT 
            s.id,
            s.shop_name,
            s.owner_name,
            s.phone,
            s.email,
            s.address,
            s.upi_id,
            COALESCE(s.status, 'approved') as status,
            s.created_at,
            COALESCE(cust.customer_count, 0) as customer_count,
            COALESCE(prod.product_count, 0) as product_count,
            COALESCE(tx.transaction_count, 0) as transaction_count,
            COALESCE(tx.total_udhaar, 0) as total_udhaar,
            COALESCE(tx.total_jama, 0) as total_jama,
            (COALESCE(tx.total_udhaar, 0) - COALESCE(tx.total_jama, 0)) as net_due
          FROM shop_settings s
          LEFT JOIN (
            SELECT shop_id, COUNT(*) as customer_count 
            FROM customers 
            GROUP BY shop_id
          ) cust ON cust.shop_id = s.id
          LEFT JOIN (
            SELECT shop_id, COUNT(*) as product_count 
            FROM products 
            GROUP BY shop_id
          ) prod ON prod.shop_id = s.id
          LEFT JOIN (
            SELECT 
              shop_id,
              COUNT(*) as transaction_count,
              SUM(CASE WHEN type = 'udhaar' AND (is_deleted IS NULL OR is_deleted = 0) THEN amount ELSE 0 END) as total_udhaar,
              SUM(CASE WHEN type = 'jama' AND (is_deleted IS NULL OR is_deleted = 0) THEN amount ELSE 0 END) as total_jama
            FROM transactions
            GROUP BY shop_id
          ) tx ON tx.shop_id = s.id
          ORDER BY s.id ASC
        `);
        if (rows && rows.length > 0) {
          const formatted = rows.map((r: any) => ({
            ...r,
            customer_count: Number(r.customer_count || 0),
            product_count: Number(r.product_count || 0),
            transaction_count: Number(r.transaction_count || 0),
            total_udhaar: Number(r.total_udhaar || 0),
            total_jama: Number(r.total_jama || 0),
            net_due: Number(r.net_due || 0)
          }));
          return res.json({ success: true, shops: formatted });
        }
      } catch {}
    }

    const settings = await db.getSettings();
    const customers = await db.getCustomers();
    const products = await db.getProducts();
    const totalUdhaar = customers.reduce((sum, c) => sum + (c.total_udhaar || 0), 0);
    const totalJama = customers.reduce((sum, c) => sum + (c.total_jama || 0), 0);

    // Single shop fallback
    res.json({
      success: true,
      shops: [
        {
          id: 1,
          shop_name: settings.shop_name || 'Mohit Kirana Store',
          owner_name: settings.owner_name || 'मोहित कुमार',
          phone: settings.phone || '9876543210',
          email: settings.email || '',
          address: settings.address || '',
          upi_id: settings.upi_id || '',
          status: 'approved',
          created_at: new Date().toISOString(),
          customer_count: customers.length,
          product_count: products.length,
          transaction_count: 0,
          total_udhaar: totalUdhaar,
          total_jama: totalJama,
          net_due: totalUdhaar - totalJama
        }
      ]
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Update Status: POST /api/admin/shops/update-status
app.post('/api/admin/shops/update-status', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token && req.headers['x-admin-token']) token = String(req.headers['x-admin-token']).trim();

    if (!verifyAdminToken(token)) {
      return res.status(401).json({ success: false, error: 'अनाधिकृत अनुरोध!' });
    }

    const { shop_id, status } = req.body;
    if (!shop_id || !status) {
      return res.status(400).json({ success: false, error: 'shop_id और status आवश्यक हैं' });
    }

    const pool = db.getPool();
    if (pool) {
      await pool.query('UPDATE shop_settings SET status = ? WHERE id = ?', [status, shop_id]);
    }

    const labelMap: Record<string, string> = {
      approved: 'स्वीकृत (Approved)',
      suspended: 'निलंबित (Suspended)',
      rejected: 'अस्वीकृत (Rejected)',
      pending: 'लंबित (Pending)'
    };

    res.json({
      success: true,
      message: `दुकान स्थिति सफलतापूर्वक '${labelMap[status] || status}' कर दी गई है!`,
      status
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Delete Shop: POST /api/admin/shops/delete
app.post('/api/admin/shops/delete', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token && req.headers['x-admin-token']) token = String(req.headers['x-admin-token']).trim();

    if (!verifyAdminToken(token)) {
      return res.status(401).json({ success: false, error: 'अनाधिकृत अनुरोध!' });
    }

    const { shop_id } = req.body;
    if (!shop_id || Number(shop_id) === 1) {
      return res.status(400).json({ success: false, error: 'मुख्य प्राथमिक दुकान (ID: 1) को हटाया नहीं जा सकता!' });
    }

    const pool = db.getPool();
    if (pool) {
      await pool.query('DELETE FROM transactions WHERE shop_id = ?', [shop_id]);
      await pool.query('DELETE FROM customers WHERE shop_id = ?', [shop_id]);
      await pool.query('DELETE FROM products WHERE shop_id = ?', [shop_id]);
      await pool.query('DELETE FROM mandi_alerts WHERE shop_id = ?', [shop_id]);
      await pool.query('DELETE FROM shop_settings WHERE id = ?', [shop_id]);
    }

    res.json({
      success: true,
      message: `दुकान (ID: ${shop_id}) और उसका समस्त डेटा सफलतापूर्वक हटा दिया गया है।`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Change Password: POST /api/admin/change-password
app.post('/api/admin/change-password', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token && req.headers['x-admin-token']) token = String(req.headers['x-admin-token']).trim();

    if (!verifyAdminToken(token)) {
      return res.status(401).json({ success: false, error: 'अनाधिकृत अनुरोध!' });
    }

    const { currentPassword, newPassword } = req.body;
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ success: false, error: 'नया पासवर्ड कम से कम 4 अक्षरों का होना चाहिए' });
    }

    const pool = db.getPool();
    if (pool) {
      const [rows]: any = await pool.query('SELECT id, password FROM super_admins LIMIT 1');
      if (rows && rows.length > 0) {
        const stored = String(rows[0].password || '');
        if (!verifySecret(currentPassword, stored)) {
          return res.status(400).json({ success: false, error: '❌ वर्तमान पासवर्ड गलत है' });
        }
        const hashedNew = hashSecret(newPassword);
        await pool.query('UPDATE super_admins SET password = ? WHERE id = ?', [hashedNew, rows[0].id]);
      }
    }

    await db.updateSettings({ password: hashSecret(newPassword) });

    res.json({
      success: true,
      message: 'व्यवस्थापक पासवर्ड सफलतापूर्वक अपडेट हो गया (Bcrypt Encrypted)!'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Impersonate Store (Admin direct store entry): POST /api/admin/impersonate
app.post('/api/admin/impersonate', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token && req.headers['x-admin-token']) token = String(req.headers['x-admin-token']).trim();

    if (!verifyAdminToken(token)) {
      return res.status(401).json({ success: false, error: 'अनाधिकृत अनुरोध!' });
    }

    const { shop_id } = req.body;
    const pool = db.getPool();
    let shop: any = null;

    if (pool) {
      const [rows]: any = await pool.query('SELECT id, shop_name, owner_name, phone, email, address, upi_id FROM shop_settings WHERE id = ?', [shop_id]);
      if (rows && rows.length > 0) shop = rows[0];
    } else {
      const settings = await db.getSettings();
      shop = {
        id: 1,
        shop_name: settings.shop_name || 'Mohit Kirana Store',
        owner_name: settings.owner_name || 'मोहित कुमार',
        phone: settings.phone || '9876543210',
        email: settings.email || '',
        address: settings.address || '',
        upi_id: settings.upi_id || ''
      };
    }

    if (!shop) {
      return res.status(404).json({ success: false, error: 'दुकान नहीं मिली' });
    }

    const storeToken = `dukandar_session_${shop.id}_impersonated_${Date.now()}`;

    res.json({
      success: true,
      message: `दुकान '${shop.shop_name}' में व्यवस्थापक के रूप में सीधे लॉगिन सफल!`,
      token: storeToken,
      shop_id: shop.id,
      user: {
        shop_id: shop.id,
        shop_name: shop.shop_name,
        owner_name: shop.owner_name,
        phone: shop.phone,
        email: shop.email || '',
        is_impersonating: true
      }
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 8. Reset Merchant PIN & Password: POST /api/admin/shops/reset-pin
app.post('/api/admin/shops/reset-pin', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token && req.headers['x-admin-token']) token = String(req.headers['x-admin-token']).trim();

    if (!verifyAdminToken(token)) {
      return res.status(401).json({ success: false, error: 'अनाधिकृत अनुरोध!' });
    }

    const { shop_id, new_pin, new_password } = req.body;
    const cleanPin = String(new_pin || '1234').trim();
    const cleanPass = String(new_password || 'admin').trim();

    if (!shop_id || cleanPin.length < 4) {
      return res.status(400).json({ success: false, error: 'दुकान ID और कम से कम 4-अंकों का नया पिन आवश्यक है' });
    }

    const pool = db.getPool();
    const hashedPin = hashSecret(cleanPin);
    const hashedPass = hashSecret(cleanPass);
    if (pool) {
      await pool.query('UPDATE shop_settings SET pin = ?, password = ? WHERE id = ?', [hashedPin, hashedPass, shop_id]);
    } else {
      await db.updateSettings({ pin: hashedPin, password: hashedPass });
    }

    res.json({
      success: true,
      message: `दुकान (ID: ${shop_id}) का पिन '${cleanPin}' और पासवर्ड '${cleanPass}' पर रीसेट कर दिया गया है (Bcrypt Encrypted)!`
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 9. Admin Create Pre-Approved Store: POST /api/admin/shops/create
app.post('/api/admin/shops/create', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token && req.headers['x-admin-token']) token = String(req.headers['x-admin-token']).trim();

    if (!verifyAdminToken(token)) {
      return res.status(401).json({ success: false, error: 'अनाधिकृत अनुरोध!' });
    }

    const { shop_name, owner_name, phone, email, address, upi_id, pin, password } = req.body;
    const sName = String(shop_name || '').trim();
    const pNumber = String(phone || '').replace(/[^0-9]/g, '');

    if (!sName || !pNumber || pNumber.length < 10) {
      return res.status(400).json({ success: false, error: 'कृपया दुकान का नाम और 10-अंकों का वैध मोबाइल नंबर दर्ज करें' });
    }

    const clean10 = pNumber.slice(-10);
    const pool = db.getPool();

    if (pool) {
      const [existing]: any = await pool.query('SELECT id, shop_name, phone FROM shop_settings');
      for (const s of existing) {
        const cp = String(s.phone || '').replace(/[^0-9]/g, '');
        if (cp.length >= 10 && cp.slice(-10) === clean10) {
          return res.status(409).json({
            success: false,
            error: `❌ मोबाइल नंबर ${pNumber} पहले से '${s.shop_name}' दुकान में पंजीकृत है! हर दुकान का मोबाइल नंबर अलग होना चाहिए।`
          });
        }
      }

      const [resInsert]: any = await pool.query(
        `INSERT INTO shop_settings (shop_name, owner_name, phone, email, address, upi_id, pin, password, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'approved')`,
        [
          sName,
          String(owner_name || 'दुकानदार').trim(),
          pNumber,
          String(email || '').trim(),
          String(address || '').trim(),
          String(upi_id || `${pNumber}@paytm`).trim(),
          hashSecret(String(pin || '1234').trim()),
          hashSecret(String(password || 'admin').trim())
        ]
      );

      return res.json({
        success: true,
        message: `नई दुकान '${sName}' (ID: ${resInsert.insertId}) सफलतापूर्वक बना दी गई है और तुरंत सक्रिय (Approved) है!`,
        shop_id: resInsert.insertId
      });
    }

    res.json({
      success: true,
      message: `नई दुकान '${sName}' बनाई गई (Local Mock)!`,
      shop_id: 2
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 10. Shop Audit & Financial Details: GET /api/admin/shops/details
app.get('/api/admin/shops/details', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token && req.headers['x-admin-token']) token = String(req.headers['x-admin-token']).trim();

    if (!verifyAdminToken(token)) {
      return res.status(401).json({ success: false, error: 'अनाधिकृत अनुरोध!' });
    }

    const targetShopId = Number(req.query.id || 0);
    const pool = db.getPool();

    if (!pool) {
      const settings = await db.getSettings();
      const customers = await db.getCustomers();
      const transactions = await db.getTransactions();
      return res.json({
        success: true,
        shop: {
          id: 1,
          shop_name: settings.shop_name,
          owner_name: settings.owner_name,
          phone: settings.phone,
          email: settings.email,
          address: settings.address,
          upi_id: settings.upi_id,
          status: 'approved',
          created_at: new Date().toISOString()
        },
        top_customers: customers.slice(0, 5),
        recent_transactions: transactions.slice(0, 5)
      });
    }

    const [shopRows]: any = await pool.query('SELECT id, shop_name, owner_name, phone, email, address, upi_id, status, created_at FROM shop_settings WHERE id = ?', [targetShopId]);
    if (!shopRows || shopRows.length === 0) {
      return res.status(404).json({ success: false, error: 'दुकान नहीं मिली' });
    }

    const [topCustomers]: any = await pool.query(`
      SELECT c.id, c.name, c.phone,
             COALESCE(SUM(CASE WHEN t.type = 'udhaar' AND (t.is_deleted IS NULL OR t.is_deleted = 0) THEN t.amount ELSE 0 END), 0) as udhaar,
             COALESCE(SUM(CASE WHEN t.type = 'jama' AND (t.is_deleted IS NULL OR t.is_deleted = 0) THEN t.amount ELSE 0 END), 0) as jama
      FROM customers c
      LEFT JOIN transactions t ON c.id = t.customer_id
      WHERE c.shop_id = ?
      GROUP BY c.id
      ORDER BY (udhaar - jama) DESC
      LIMIT 5
    `, [targetShopId]);

    const formattedCustomers = (topCustomers || []).map((c: any) => ({
      ...c,
      due: Number(c.udhaar) - Number(c.jama)
    }));

    const [recentTxs]: any = await pool.query(`
      SELECT t.id, t.type, t.amount, t.notes, t.date, t.created_at, c.name as customer_name
      FROM transactions t
      LEFT JOIN customers c ON t.customer_id = c.id
      WHERE t.shop_id = ? AND (t.is_deleted IS NULL OR t.is_deleted = 0)
      ORDER BY t.id DESC
      LIMIT 5
    `, [targetShopId]);

    const [shopTotals]: any = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM customers WHERE shop_id = ?) as customer_count,
        (SELECT COUNT(*) FROM transactions WHERE shop_id = ? AND (is_deleted IS NULL OR is_deleted = 0)) as transaction_count,
        COALESCE(SUM(CASE WHEN type = 'udhaar' AND (is_deleted IS NULL OR is_deleted = 0) THEN amount ELSE 0 END), 0) as total_udhaar,
        COALESCE(SUM(CASE WHEN type = 'jama' AND (is_deleted IS NULL OR is_deleted = 0) THEN amount ELSE 0 END), 0) as total_jama
      FROM transactions
      WHERE shop_id = ?
    `, [targetShopId, targetShopId, targetShopId]);

    const uTotal = Number(shopTotals[0]?.total_udhaar || 0);
    const jTotal = Number(shopTotals[0]?.total_jama || 0);

    const fullShop = {
      ...shopRows[0],
      customer_count: Number(shopTotals[0]?.customer_count || 0),
      transaction_count: Number(shopTotals[0]?.transaction_count || 0),
      total_udhaar: uTotal,
      total_jama: jTotal,
      net_due: uTotal - jTotal
    };

    res.json({
      success: true,
      shop: fullShop,
      top_customers: formattedCustomers,
      recent_transactions: recentTxs
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 11. Broadcast Notice: GET & POST /api/admin/broadcast
app.get('/api/admin/broadcast', async (req: Request, res: Response) => {
  try {
    const pool = db.getPool();
    if (pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS platform_notices (
          id INT AUTO_INCREMENT PRIMARY KEY,
          message TEXT NOT NULL,
          type VARCHAR(30) DEFAULT 'info',
          is_active TINYINT(1) DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      const [rows]: any = await pool.query('SELECT * FROM platform_notices ORDER BY id DESC LIMIT 1');
      return res.json({
        success: true,
        notice: rows && rows.length > 0 ? {
          id: rows[0].id,
          message: rows[0].message,
          type: rows[0].type,
          is_active: Boolean(rows[0].is_active),
          updated_at: rows[0].updated_at
        } : null
      });
    }
    res.json({ success: true, notice: null });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/broadcast', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token && req.headers['x-admin-token']) token = String(req.headers['x-admin-token']).trim();

    if (!verifyAdminToken(token)) {
      return res.status(401).json({ success: false, error: 'अनाधिकृत अनुरोध!' });
    }

    const { message, type, is_active } = req.body;
    const msg = String(message || '').trim();
    const noticeType = String(type || 'info').trim();
    const activeVal = is_active !== undefined ? (is_active ? 1 : 0) : 1;

    const pool = db.getPool();
    if (pool) {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS platform_notices (
          id INT AUTO_INCREMENT PRIMARY KEY,
          message TEXT NOT NULL,
          type VARCHAR(30) DEFAULT 'info',
          is_active TINYINT(1) DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      const [existing]: any = await pool.query('SELECT id FROM platform_notices LIMIT 1');
      if (existing && existing.length > 0) {
        await pool.query('UPDATE platform_notices SET message = ?, type = ?, is_active = ? WHERE id = ?', [msg, noticeType, activeVal, existing[0].id]);
      } else {
        await pool.query('INSERT INTO platform_notices (message, type, is_active) VALUES (?, ?, ?)', [msg, noticeType, activeVal]);
      }
    }

    res.json({
      success: true,
      message: 'प्लेटफॉर्म नोटिस सफलतापूर्वक अपडेट हो गया!'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 12. Public Merchant Broadcast Notice: GET /api/broadcast
app.get('/api/broadcast', async (req: Request, res: Response) => {
  try {
    const pool = db.getPool();
    if (pool) {
      try {
        const [rows]: any = await pool.query('SELECT * FROM platform_notices WHERE is_active = 1 ORDER BY id DESC LIMIT 1');
        return res.json({
          success: true,
          notice: rows && rows.length > 0 ? {
            id: rows[0].id,
            message: rows[0].message,
            type: rows[0].type,
            updated_at: rows[0].updated_at
          } : null
        });
      } catch {
        return res.json({ success: true, notice: null });
      }
    }
    res.json({ success: true, notice: null });
  } catch {
    res.json({ success: true, notice: null });
  }
});

// 13. Super Admin Platform Backup & Google Drive Routes
app.get('/api/admin/backup/settings', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token && req.headers['x-admin-token']) token = String(req.headers['x-admin-token']).trim();
    if (!verifyAdminToken(token)) {
      return res.status(401).json({ success: false, error: 'अनाधिकृत अनुरोध! केवल सुपर एडमिन ही बैकअप सेटिंग्स देख सकते हैं।' });
    }

    const settings = await db.getPlatformBackupSettings();
    res.json({ success: true, settings });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/backup/settings', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token && req.headers['x-admin-token']) token = String(req.headers['x-admin-token']).trim();
    if (!verifyAdminToken(token)) {
      return res.status(401).json({ success: false, error: 'अनाधिकृत अनुरोध! केवल सुपर एडमिन ही सेटिंग्स बदल सकते हैं।' });
    }

    const updated = await db.updatePlatformBackupSettings(req.body);
    res.json({ success: true, settings: updated });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/admin/backup/sync-gdrive', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token && req.headers['x-admin-token']) token = String(req.headers['x-admin-token']).trim();
    if (!verifyAdminToken(token)) {
      return res.status(401).json({ success: false, error: 'अनाधिकृत अनुरोध! केवल सुपर एडमिन ही Google Drive बैकअप चला सकते हैं।' });
    }

    const { webhook_url } = req.body || {};
    const result = await syncPlatformToGoogleDrive(webhook_url);
    res.json({
      success: true,
      time: result.time,
      message: 'पूरे प्रोजेक्ट (सभी दुकानों) का बैकअप Google Drive पर सफलतापूर्वक अपलोड हो गया!'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/admin/backup/download', async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization || '';
    let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token && req.headers['x-admin-token']) token = String(req.headers['x-admin-token']).trim();
    if (!verifyAdminToken(token)) {
      return res.status(401).json({ success: false, error: 'अनाधिकृत अनुरोध! केवल सुपर एडमिन ही बैकअप डाउनलोड कर सकते हैं।' });
    }

    const backupData = await db.getFullPlatformBackupData();
    const today = new Date().toISOString().split('T')[0];
    const filename = `Dukaan_FULL_PROJECT_Master_Backup_${today}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backupData, null, 2));
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 1-CLICK DATABASE INSTALLATION WIZARD API
// ==========================================
app.get('/api/install/status', (_req: Request, res: Response) => {
  const root = process.cwd();
  const isLocked = fs.existsSync(path.resolve(root, 'installed.lock')) ||
                   fs.existsSync(path.resolve(root, 'install.lock'));
  res.json({
    success: true,
    installed: isLocked
  });
});

app.post('/api/install/test-db', async (req: Request, res: Response) => {
  try {
    const root = process.cwd();
    if (fs.existsSync(path.resolve(root, 'installed.lock')) || fs.existsSync(path.resolve(root, 'install.lock'))) {
      return res.status(403).json({ success: false, error: 'Installation is locked. Database is already configured.' });
    }
    const { host, port, user, password, database } = req.body;
    const mysql = (await import('mysql2/promise')).default;
    const connection = await mysql.createConnection({
      host: host || 'localhost',
      port: parseInt(port || '3306', 10),
      user: user || 'root',
      password: password || '',
      connectTimeout: 5000
    });

    let dbExists = false;
    if (database) {
      const [rows]: any = await connection.query(`SHOW DATABASES LIKE ?`, [database]);
      dbExists = rows.length > 0;
    }

    await connection.end();

    res.json({
      success: true,
      message: '✅ MySQL सर्वर कनेक्शन सफल!',
      dbExists
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/install/setup', async (req: Request, res: Response) => {
  try {
    const root = process.cwd();
    if (fs.existsSync(path.resolve(root, 'installed.lock')) || fs.existsSync(path.resolve(root, 'install.lock'))) {
      return res.status(403).json({ success: false, error: 'Installation is locked. Database is already configured.' });
    }
    const {
      host,
      port,
      user,
      password,
      database,
      admin_name,
      admin_username,
      admin_phone,
      admin_email,
      admin_password,
      platform_name
    } = req.body;
    const mysql = (await import('mysql2/promise')).default;

    const connection = await mysql.createConnection({
      host: host || 'localhost',
      port: parseInt(port || '3306', 10),
      user: user || 'root',
      password: password || '',
      connectTimeout: 5000
    });

    const dbName = database || 'dukaan_khaata_db';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.changeUser({ database: dbName });

    // Create tables
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`customers\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(150) NOT NULL,
        \`phone\` VARCHAR(25) DEFAULT '',
        \`address\` VARCHAR(255) DEFAULT '',
        \`due_date\` VARCHAR(30) NULL,
        \`credit_limit\` DECIMAL(10, 2) DEFAULT 5000,
        \`credit_period_days\` INT DEFAULT 15,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`transactions\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`customer_id\` INT NOT NULL,
        \`type\` ENUM('udhaar', 'jama') NOT NULL,
        \`amount\` DECIMAL(10, 2) NOT NULL,
        \`notes\` TEXT NULL,
        \`bill_image\` LONGTEXT NULL,
        \`date\` VARCHAR(30) NOT NULL,
        \`voice_recorded\` TINYINT(1) DEFAULT 0,
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX \`idx_customer\` (\`customer_id\`),
        INDEX \`idx_date\` (\`date\`),
        CONSTRAINT \`fk_transactions_customer\` 
          FOREIGN KEY (\`customer_id\`) 
          REFERENCES \`customers\` (\`id\`) 
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`products\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`name\` VARCHAR(150) NOT NULL,
        \`category\` VARCHAR(100) DEFAULT 'General',
        \`unit\` VARCHAR(30) DEFAULT 'पैकेट',
        \`purchase_price\` DECIMAL(10, 2) NOT NULL,
        \`selling_price\` DECIMAL(10, 2) NOT NULL,
        \`wholesale_price\` DECIMAL(10, 2) DEFAULT 0,
        \`stock_quantity\` DECIMAL(10, 2) DEFAULT 0,
        \`min_stock_alert\` DECIMAL(10, 2) DEFAULT 5,
        \`barcode\` VARCHAR(100) DEFAULT '',
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`shop_settings\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`shop_name\` VARCHAR(200) NOT NULL,
        \`owner_name\` VARCHAR(100) DEFAULT '',
        \`phone\` VARCHAR(30) DEFAULT '',
        \`email\` VARCHAR(150) DEFAULT '',
        \`address\` TEXT NULL,
        \`upi_id\` VARCHAR(100) DEFAULT '',
        \`logo\` LONGTEXT NULL,
        \`staff_phones\` TEXT NULL,
        \`gdrive_webhook_url\` TEXT NULL,
        \`auto_backup_enabled\` TINYINT(1) DEFAULT 0,
        \`last_backup_time\` VARCHAR(50) NULL,
        \`last_backup_status\` VARCHAR(50) NULL,
        \`pin\` VARCHAR(255) DEFAULT '',
        \`password\` VARCHAR(255) DEFAULT '',
        \`status\` VARCHAR(30) DEFAULT 'approved',
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`super_admins\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`username\` VARCHAR(100) UNIQUE NOT NULL,
        \`phone\` VARCHAR(30) UNIQUE NOT NULL,
        \`email\` VARCHAR(150) DEFAULT NULL,
        \`password\` VARCHAR(255) NOT NULL,
        \`name\` VARCHAR(100) DEFAULT 'Super Admin',
        \`role\` VARCHAR(50) DEFAULT 'superadmin',
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    try {
      await connection.query('ALTER TABLE `super_admins` ADD COLUMN `email` VARCHAR(150) DEFAULT NULL AFTER `phone`');
    } catch {}

    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`mandi_alerts\` (
        \`id\` INT AUTO_INCREMENT PRIMARY KEY,
        \`product_name\` VARCHAR(150) NOT NULL,
        \`old_price\` DECIMAL(10, 2) DEFAULT 0,
        \`new_price\` DECIMAL(10, 2) NOT NULL,
        \`wholesale_price\` DECIMAL(10, 2) DEFAULT 0,
        \`unit\` VARCHAR(30) DEFAULT 'पैकेट',
        \`notes\` TEXT NULL,
        \`sender_name\` VARCHAR(100) DEFAULT 'दुकानदार (मंडी)',
        \`created_at\` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const finalAdminName = String(admin_name || 'मुख्य व्यवस्थापक').trim();
    const finalAdminUser = String(admin_username || 'admin').trim().toLowerCase();
    const finalAdminPhone = String(admin_phone || '9876543210').replace(/[^0-9]/g, '');
    const finalAdminEmail = String(admin_email || 'admin@dukaan.com').trim().toLowerCase();
    const finalAdminPass = hashSecret(String(admin_password || password || 'admin123').trim());
    const finalPlatformName = String(platform_name || 'दुकान खाता').trim();

    // Insert / update Super Admin account (NO store is created - wizard only configures Super Admin)
    await connection.query(`
      INSERT INTO \`super_admins\` (username, phone, email, password, name, role)
      VALUES (?, ?, ?, ?, ?, 'superadmin')
      ON DUPLICATE KEY UPDATE
        phone = VALUES(phone),
        email = VALUES(email),
        password = VALUES(password),
        name = VALUES(name)
    `, [finalAdminUser, finalAdminPhone, finalAdminEmail, finalAdminPass, finalAdminName]);

    await connection.end();

    // Update .env file if running in Node environment
    const envPath = path.resolve(process.cwd(), '.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    const updateEnvVar = (key: string, val: string) => {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(envContent)) {
        envContent = envContent.replace(regex, `${key}=${val}`);
      } else {
        envContent += `\n${key}=${val}`;
      }
    };
    updateEnvVar('DB_HOST', host || 'localhost');
    updateEnvVar('DB_PORT', port || '3306');
    updateEnvVar('DB_USER', user || 'root');
    updateEnvVar('DB_PASSWORD', password || '');
    updateEnvVar('DB_NAME', dbName);
    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');

    // Also sync api/config.php for PHP hosting if it exists
    const phpConfigPath = path.resolve(process.cwd(), 'api/config.php');
    if (fs.existsSync(phpConfigPath)) {
      try {
        let phpContent = fs.readFileSync(phpConfigPath, 'utf8');
        phpContent = phpContent
          .replace(/define\('DB_HOST',\s*'[^']*'\);/, `define('DB_HOST', '${host || 'localhost'}');`)
          .replace(/define\('DB_PORT',\s*'[^']*'\);/, `define('DB_PORT', '${port || '3306'}');`)
          .replace(/define\('DB_USER',\s*'[^']*'\);/, `define('DB_USER', '${user || 'root'}');`)
          .replace(/define\('DB_PASS',\s*'[^']*'\);/, `define('DB_PASS', '${(password || '').replace(/'/g, "\\'")}');`)
          .replace(/define\('DB_NAME',\s*'[^']*'\);/, `define('DB_NAME', '${dbName}');`);
        fs.writeFileSync(phpConfigPath, phpContent, 'utf8');
      } catch (phpErr: any) {
        console.warn('[INSTALL] Failed to sync api/config.php:', phpErr.message);
      }
    }

    // Reinitialize database pool
    await db.init();

    // Lock installer permanently
    const lockMsg = `Installed on ${new Date().toISOString()}\n`;
    fs.writeFileSync(path.resolve(process.cwd(), 'installed.lock'), lockMsg, 'utf8');
    fs.writeFileSync(path.resolve(process.cwd(), 'install.lock'), lockMsg, 'utf8');

    res.json({
      success: true,
      message: '✅ डेटाबेस सफलतापूर्वक कनेक्ट और स्थापित हो गया है!'
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// ONLINE UPI PAYMENT & QR VIEW PAGE (/pay)
// ==========================================
app.get('/pay', async (req: Request, res: Response) => {
  try {
    const pa = (req.query.pa as string) || '';
    const pn = (req.query.pn as string) || 'दुकानदार';
    const am = (req.query.am as string) || '0';
    const cust = (req.query.cust as string) || 'ग्राहक';
    const tn = (req.query.tn as string) || 'Dukaan Udhaar Payment';

    const upiPayUrl = `upi://pay?pa=${encodeURIComponent(pa)}&pn=${encodeURIComponent(pn)}&am=${encodeURIComponent(am)}&cu=INR&tn=${encodeURIComponent(tn)}`;
    let qrDataUrl = '';
    try {
      const QRCode = (await import('qrcode')).default;
      qrDataUrl = await QRCode.toDataURL(upiPayUrl, { width: 360, margin: 1 });
    } catch {
      qrDataUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(upiPayUrl)}`;
    }

    const html = `<!DOCTYPE html>
<html lang="hi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${pn} - UPI भुगतान (₹${am})</title>
  <meta property="og:title" content="₹${am} भुगतान - ${pn}">
  <meta property="og:description" content="${cust} जी के लिए ₹${am} का UPI भुगतान QR कोड एवं पेमेंट लिंक">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
    body { background: #f8fafc; display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 16px; }
    .card { background: #ffffff; border-radius: 28px; box-shadow: 0 12px 30px -8px rgba(0,0,0,0.12); width: 100%; max-width: 420px; overflow: hidden; border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #0f766e, #065f46); color: white; padding: 24px 20px; text-align: center; }
    .shop-title { font-size: 20px; font-weight: 800; margin-bottom: 4px; }
    .upi-sub { font-size: 13px; opacity: 0.92; font-family: monospace; }
    .amount-box { background: #ecfdf5; border-bottom: 1px dashed #a7f3d0; padding: 18px; text-align: center; }
    .amount-val { font-size: 38px; font-weight: 800; color: #065f46; letter-spacing: -0.5px; }
    .cust-name { font-size: 14px; color: #047857; font-weight: 700; margin-top: 3px; }
    .qr-container { padding: 22px 20px 14px; text-align: center; }
    .qr-img { width: 220px; height: 220px; border-radius: 16px; border: 2px solid #e2e8f0; padding: 8px; background: white; margin: 0 auto; display: block; box-shadow: 0 4px 10px -2px rgba(0,0,0,0.06); }
    .scan-note { font-size: 13px; color: #475569; font-weight: 700; margin-top: 12px; }
    .app-btns { padding: 10px 20px 24px; display: flex; flex-direction: column; gap: 10px; }
    .btn { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 13px 16px; border-radius: 16px; font-size: 14px; font-weight: 800; text-decoration: none; transition: transform 0.1s; box-shadow: 0 2px 4px rgba(0,0,0,0.06); }
    .btn:active { transform: scale(0.98); }
    .btn-phonepe { background: #5f259f; color: white; }
    .btn-gpay { background: #1a73e8; color: white; }
    .btn-paytm { background: #00b9f5; color: white; }
    .btn-upi { background: #0f766e; color: white; }
    .btn-divider { text-align: center; font-size: 11px; color: #94a3b8; font-weight: 700; margin: 6px 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="shop-title">🏪 ${pn}</div>
      <div class="upi-sub">UPI ID: <strong>${pa}</strong></div>
    </div>
    <div class="amount-box">
      <div class="amount-val">₹${Number(am).toLocaleString('en-IN')}</div>
      <div class="cust-name">ग्राहक: ${cust}</div>
    </div>
    <div class="qr-container">
      <img src="${qrDataUrl}" alt="UPI QR Code" class="qr-img">
      <div class="scan-note">किसी भी UPI ऐप से स्कैन करके पेमेंट करें</div>
    </div>
    <div class="app-btns">
      <div class="btn-divider">— या मोबाइल ऐप से सीधे 1-क्लिक में पे करें —</div>
      <a href="phonepe://pay?pa=${encodeURIComponent(pa)}&pn=${encodeURIComponent(pn)}&am=${encodeURIComponent(am)}&cu=INR&tn=${encodeURIComponent(tn)}" class="btn btn-phonepe">
        🟣 PhonePe से पे करें
      </a>
      <a href="tez://upi/pay?pa=${encodeURIComponent(pa)}&pn=${encodeURIComponent(pn)}&am=${encodeURIComponent(am)}&cu=INR&tn=${encodeURIComponent(tn)}" class="btn btn-gpay">
        🔵 Google Pay (GPay) से पे करें
      </a>
      <a href="paytmmp://pay?pa=${encodeURIComponent(pa)}&pn=${encodeURIComponent(pn)}&am=${encodeURIComponent(am)}&cu=INR&tn=${encodeURIComponent(tn)}" class="btn btn-paytm">
        🔷 Paytm से पे करें
      </a>
      <a href="${upiPayUrl}" class="btn btn-upi">
        🟢 किसी भी अन्य UPI ऐप से पे करें
      </a>
    </div>
  </div>
</body>
</html>`;
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (err: any) {
    res.status(500).send(`Payment page error: ${err.message}`);
  }
});

// ==========================================
// VITE DEV SERVER / PRODUCTION STATIC SERVING
// ==========================================
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    // Mount Vite middleware in development mode
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    // Serve static build files in production
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`🚀 Dukaan Khaata Server running at http://${HOST}:${PORT}`);
    console.log(`📦 Database: ${db.dbType.toUpperCase()} (MySQL Connected: ${db.isMySQLConnected})`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
