import { Customer, Product } from '../types';

const consonants = 'कखगघङचछजझञटठडढणतथदधनपफबभमयरलवशषसह';

const devanagariToLatinMap: Record<string, string> = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri',
  'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'अं': 'an', 'अः': 'ah',
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'f', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v',
  'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
  'क्ष': 'ksh', 'त्र': 'tr', 'ज्ञ': 'gya',
  'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ँ': 'n', '्': '', '़': '',
  'ॉ': 'o', 'ॅ': 'e'
};

/**
 * Phonetically transliterates Devanagari Hindi text to Romanized Latin text
 * e.g. "रमेश" -> "ramesh", "मैगी" -> "maigi", "अमित" -> "amit"
 */
export function devanagariToLatin(str: string): string {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    const nextCh = str[i + 1];
    if (devanagariToLatinMap[ch] !== undefined) {
      out += devanagariToLatinMap[ch];
      // Inherent 'a' in Hindi consonants when followed by another consonant
      if (consonants.includes(ch) && nextCh && consonants.includes(nextCh)) {
        out += 'a';
      }
    } else {
      out += ch;
    }
  }
  return out.toLowerCase().replace(/[^a-z0-9\s]/g, '');
}

/**
 * Normalizes phonetic variants (ee/i, oo/u, w/v, c/k, sh/s, repeated letters)
 */
export function phoneticNormalize(str: string): string {
  return str.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/aa/g, 'a')
    .replace(/sh/g, 's')
    .replace(/w/g, 'v')
    .replace(/c(?=[iey])/g, 's')
    .replace(/c/g, 'k')
    .replace(/ph/g, 'f')
    .replace(/(.)\1+/g, '$1'); // collapse duplicate consecutive letters
}

// Common grocery product bilingual dictionary aliases
const productBilingualDict: [string[], string[]][] = [
  [['sugar', 'chini', 'cheeni', 'shakkar'], ['चीनी', 'शक्कर']],
  [['oil', 'tel', 'refine', 'refined', 'mustard', 'sarson'], ['तेल', 'सरसों तेल', 'रिफाइंड']],
  [['salt', 'namak'], ['नमक']],
  [['tata salt', 'tata namak'], ['टाटा नमक', 'टाटा साल्ट']],
  [['flour', 'atta', 'aata', 'gehu', 'wheat'], ['आटा', 'गेहूं का आटा']],
  [['rice', 'chawal'], ['चावल']],
  [['pulse', 'pulses', 'dal', 'daal'], ['दाल']],
  [['tea', 'chai'], ['चाय', 'चाय पत्ती']],
  [['coffee'], ['कॉफी']],
  [['milk', 'doodh'], ['दूध']],
  [['butter', 'makkhan'], ['मक्खन', 'बटर']],
  [['biscuit', 'biscuits'], ['बिस्कुट', 'बिस्किट']],
  [['parle', 'parle-g', 'parle g'], ['पार्ले', 'पार्ले जी', 'पार्ले-जी']],
  [['good day', 'goodday'], ['गुड डे', 'गुडडे']],
  [['soap', 'sabun'], ['साबुन']],
  [['surf', 'detergent'], ['सर्फ', 'डिटर्जेंट']],
  [['ghadi', 'ghari'], ['घड़ी', 'घड़ी सर्फ']],
  [['colgate'], ['कोलगेट']],
  [['toothpaste', 'paste'], ['टूथपेस्ट', 'पेस्ट']],
  [['shampoo'], ['शैम्पू']],
  [['chips'], ['चिप्स']],
  [['kurkure'], ['कुरकुरे']],
  [['matchbox', 'maachis', 'machis'], ['माचिस']],
  [['incense', 'agarbatti'], ['अगरबत्ती']],
  [['spices', 'masala'], ['मसाला']],
  [['turmeric', 'haldi'], ['हल्दी']],
  [['chilli', 'mirch'], ['मिर्च']],
  [['coriander', 'dhaniya'], ['धनिया']],
  [['cumin', 'jeera'], ['जीरा']],
  [['maggi', 'maggie'], ['मैगी', 'मैगी नूडल्स']],
  [['fortune'], ['फॉर्च्यून']],
  [['aashirvaad', 'ashirvad', 'ashirwad'], ['आशीर्वाद']]
];

/**
 * Checks whether two names (English/Hindi or bilingual equivalents) represent the same person or product.
 * Returns true if:
 * 1. Exact string match (case-insensitive)
 * 2. Matches via bilingual grocery product dictionary
 * 3. Matches via Devanagari-to-Latin phonetic transliteration (e.g. "Ramesh" <-> "रमेश")
 * 4. Token substring or prefix match (e.g. "Ramesh Kumar" <-> "रमेश")
 */
export function areNamesEquivalent(nameA: string, nameB: string): boolean {
  if (!nameA || !nameB) return false;
  const cleanA = nameA.trim().toLowerCase();
  const cleanB = nameB.trim().toLowerCase();
  if (cleanA === cleanB) return true;

  // 1. Check Bilingual Product Dictionary
  for (const [enList, hiList] of productBilingualDict) {
    const matchAEn = enList.some(e => cleanA.includes(e));
    const matchBHi = hiList.some(h => cleanB.includes(h));
    if (matchAEn && matchBHi) return true;

    const matchAHi = hiList.some(h => cleanA.includes(h));
    const matchBEn = enList.some(e => cleanB.includes(e));
    if (matchAHi && matchBEn) return true;
  }

  // 2. Transliterate Devanagari to Latin phonetics
  const latA = /[\u0900-\u097F]/.test(nameA) ? devanagariToLatin(nameA) : cleanA;
  const latB = /[\u0900-\u097F]/.test(nameB) ? devanagariToLatin(nameB) : cleanB;

  const normA = phoneticNormalize(latA);
  const normB = phoneticNormalize(latB);

  if (normA === normB) return true;

  // 3. Substring / Prefix match for names with titles/surnames (length >= 3)
  if (normA.length >= 3 && normB.length >= 3) {
    if (normA.startsWith(normB) || normB.startsWith(normA) || normA.includes(normB) || normB.includes(normA)) {
      return true;
    }
  }

  // 4. Token-by-token check (e.g. "Ramesh" in "Ramesh Kumar")
  const tokensA = cleanA.split(/[\s\(\)]+/).filter(t => t.length >= 3);
  const tokensB = cleanB.split(/[\s\(\)]+/).filter(t => t.length >= 3);

  for (const tA of tokensA) {
    const normTA = phoneticNormalize(/[\u0900-\u097F]/.test(tA) ? devanagariToLatin(tA) : tA);
    for (const tB of tokensB) {
      const normTB = phoneticNormalize(/[\u0900-\u097F]/.test(tB) ? devanagariToLatin(tB) : tB);
      if (normTA === normTB && normTA.length >= 3) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Searches the list of existing customers and returns the matching customer
 * whether their name was registered in English or in Hindi.
 */
export function findEquivalentCustomer(queryName: string, customers: Customer[]): Customer | undefined {
  if (!queryName || !customers || customers.length === 0) return undefined;
  const trimmed = queryName.trim();
  if (!trimmed) return undefined;

  // 1. Exact match first
  const exact = customers.find(c => c.name.trim().toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;

  // 2. Bilingual equivalence match
  return customers.find(c => areNamesEquivalent(c.name, trimmed));
}

/**
 * Searches the list of existing products and returns the matching product
 * whether registered in English or in Hindi.
 */
export function findEquivalentProduct(queryName: string, products: Product[]): Product | undefined {
  if (!queryName || !products || products.length === 0) return undefined;
  const trimmed = queryName.trim();
  if (!trimmed) return undefined;

  // 1. Exact match first
  const exact = products.find(p => p.name.trim().toLowerCase() === trimmed.toLowerCase());
  if (exact) return exact;

  // 2. Bilingual equivalence match
  return products.find(p => areNamesEquivalent(p.name, trimmed));
}
