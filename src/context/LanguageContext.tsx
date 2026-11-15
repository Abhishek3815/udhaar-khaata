import React, { createContext, useContext, useState, useEffect } from 'react';

export type Language = 'hi' | 'en';

// Comprehensive dictionary for Dukaan Khaata
export const translations: Record<string, { hi: string; en: string }> = {
  // App Bar & Header
  app_subtitle: { hi: 'दुकान मुनीम & रेट लिस्ट', en: 'Dukaan Khaata & Rates' },
  shopkeeper: { hi: 'दुकानदार', en: 'Shopkeeper' },
  owner: { hi: 'मालिक', en: 'Owner' },
  shop_settings: { hi: 'दुकान सेटिंग्स', en: 'Shop Settings' },
  soundbox_on: { hi: 'साउंडबॉक्स चालू', en: 'Soundbox ON' },
  soundbox_off: { hi: 'साउंडबॉक्स बंद', en: 'Soundbox OFF' },

  // Bottom Navigation
  nav_khata: { hi: 'खाता (उधार-जमा)', en: 'Khata (Ledger)' },
  nav_voice: { hi: 'बोलकर / लिखकर', en: 'Voice / Type' },
  nav_rates: { hi: 'रेट लिस्ट (Price)', en: 'Rate List' },

  // Ledger Summary Cards
  total_market_udhaar: { hi: 'मार्केट में बाकी (उधार)', en: 'Total Market Udhaar' },
  customers_to_receive: { hi: 'ग्राहकों से लेना है', en: 'customers pending' },
  total_jama_advance: { hi: 'जमा / एडवांस बाकी', en: 'Advance / Settled' },
  advance_from_customers: { hi: 'ग्राहकों के जमा हैं', en: 'advance deposit' },
  overdue_count: { hi: 'तारीख पार बकाया', en: 'Overdue Customers' },
  action_needed: { hi: 'तगादा करने की जरूरत', en: 'Immediate action needed' },

  // Filters & Search
  search_customer_placeholder: { hi: 'ग्राहक का नाम या फोन नंबर खोजें...', en: 'Search customer name or phone...' },
  filter_all: { hi: 'सभी ग्राहक', en: 'All' },
  filter_udhaar: { hi: 'बाकी वाले', en: 'Pending' },
  filter_settled: { hi: 'निपटारा', en: 'Settled' },
  filter_due: { hi: 'देय तारीख पार', en: 'Overdue' },

  // Ledger Actions
  btn_add_customer: { hi: '+ नया ग्राहक', en: '+ Add Customer' },
  btn_bulk_reminder: { hi: '📢 सभी को तगादा', en: '📢 Bulk Reminder' },
  btn_give_udhaar: { hi: 'उधार दें (-)', en: 'Give Udhaar (-)' },
  btn_get_jama: { hi: 'जमा लें (+)', en: 'Get Jama (+)' },
  btn_send_qr: { hi: 'QR कोड', en: 'QR Code' },
  btn_whatsapp: { hi: 'व्हाट्सएप', en: 'WhatsApp' },
  btn_statement: { hi: 'हिसाब पर्ची', en: 'Statement' },

  // Customer Card Labels
  label_give: { hi: 'उधार (बाकी)', en: 'Udhaar (Pending)' },
  label_got: { hi: 'जमा (प्राप्त)', en: 'Jama (Received)' },
  label_balance: { hi: 'नेट बाकी', en: 'Net Balance' },
  label_settled: { hi: 'हिसाब चुकता (बराबर)', en: 'Settled (Zero Balance)' },
  label_advance: { hi: 'एडवांस जमा', en: 'Advance' },
  label_due_date: { hi: 'देय तारीख', en: 'Due Date' },
  label_limit: { hi: 'उधार लिमिट', en: 'Credit Limit' },
  label_overdue_badge: { hi: 'तारीख पार', en: 'OVERDUE' },
  label_no_customers: { hi: 'कोई ग्राहक नहीं मिला', en: 'No customer found' },

  // Rate List (Products) Header & Stats
  ratelist_title: { hi: 'सामान रेट लिस्ट', en: 'Items Rate List' },
  ratelist_subtitle: { hi: 'MRP, खरीद व बिक्री मूल्य त्वरित जांच व अपडेट', en: 'Quickly check and update MRP, purchase & selling rates' },
  total_items: { hi: 'कुल सामान रेट', en: 'Total Items in List' },
  avg_margin: { hi: 'औसत मुनाफा मार्जिन', en: 'Average Margin' },
  search_product_placeholder: { hi: 'सामान का नाम या बारकोड खोजें...', en: 'Search item name or barcode...' },
  btn_add_rate: { hi: '+ नया रेट जोड़ें', en: '+ Add New Item' },
  btn_quick_bill: { hi: '🧮 कच्चा पर्चा (बिल)', en: '🧮 Quick Bill' },
  btn_quick_price: { hi: '⚡ त्वरित रेट जांच', en: '⚡ Check Price' },
  btn_duplicate_mrp: { hi: '2nd MRP जोड़ें', en: 'Add 2nd MRP' },

  // Product Table / Card Details
  col_product: { hi: 'सामान का नाम', en: 'Product Name' },
  col_purchase: { hi: 'खरीद रेट', en: 'Purchase Rate' },
  col_selling: { hi: 'बिक्री रेट (MRP)', en: 'Selling Rate (MRP)' },
  col_wholesale: { hi: 'थोक रेट', en: 'Wholesale' },
  col_profit: { hi: 'मुनाफा मार्जिन', en: 'Profit Margin' },
  col_actions: { hi: 'कार्रवाई', en: 'Actions' },
  btn_edit: { hi: 'बदलें', en: 'Edit' },
  btn_delete: { hi: 'हटाएं', en: 'Delete' },
  unit_pack: { hi: 'पैकेट', en: 'Pack' },
  unit_kg: { hi: 'किग्रा', en: 'Kg' },
  unit_liter: { hi: 'लीटर', en: 'Liter' },
  unit_piece: { hi: 'पीस', en: 'Piece' },

  // Voice & Typing Modal
  voice_modal_title: { hi: 'स्मार्ट मुनीम असिस्टेंट', en: 'Smart Assistant' },
  voice_tab_speak: { hi: '🎙️ बोलकर दर्ज करें', en: '🎙️ Voice (Speak)' },
  voice_tab_type: { hi: '⌨️ लिखकर दर्ज करें', en: '⌨️ Type Text' },
  voice_listening: { hi: 'माइक सुन रहा है... बोलिए!', en: 'Listening... Please speak!' },
  voice_tap_mic: { hi: 'माइक दबाएं और बोलें', en: 'Tap mic and speak' },
  type_placeholder: { hi: 'जैसे: रमेश को ₹500 का सामान उधार दिया', en: 'e.g. Sold ₹500 grocery on credit to Ramesh' },
  btn_parse_details: { hi: '⚡ ऑटो-पहचानें', en: '⚡ Parse Details' },
  parsed_preview: { hi: 'पहचानी गई जानकारी (एडिट कर सकते हैं):', en: 'Parsed Details (Editable):' },
  btn_save_to_khata: { hi: 'खाते में सेव करें', en: 'Save to Khata' },

  // Common Dialogs & Feedback
  confirm_delete: { hi: 'क्या आप इसे हटाना चाहते हैं?', en: 'Are you sure you want to delete?' },
  save_success: { hi: 'सफलतापूर्वक सुरक्षित हो गया', en: 'Saved successfully' },
  cancel: { hi: 'रद्द करें', en: 'Cancel' },
  save: { hi: 'सेव करें', en: 'Save' }
};

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: (key: string, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: 'hi',
  setLang: () => {},
  toggleLang: () => {},
  t: (key: string, fallback?: string) => fallback || key
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [lang, setLangState] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('app_lang');
      if (saved === 'hi' || saved === 'en') return saved;
    }
    return 'hi';
  });

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('app_lang', newLang);
    }
  };

  const toggleLang = () => {
    setLang(lang === 'hi' ? 'en' : 'hi');
  };

  const t = (key: string, fallback?: string): string => {
    const entry = translations[key];
    if (entry && entry[lang]) {
      return entry[lang];
    }
    return fallback || entry?.hi || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
