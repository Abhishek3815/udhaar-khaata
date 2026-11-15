# Dukaan Khaata & Stock Manager - XAMPP Localhost Setup Guide

यह प्रोजेक्ट Node.js Express और MySQL डेटाबेस के साथ पूरी तरह तैयार है। इसे अपने कंप्यूटर पर XAMPP के साथ चलाने के लिए नीचे दिए गए स्टेप्स फॉलो करें:

---

### Step 1: XAMPP शुरू करें
1. अपने कंप्यूटर में **XAMPP Control Panel** खोलें।
2. **Apache** के सामने **Start** बटन दबाएं।
3. **MySQL** के सामने **Start** बटन दबाएं।
*(सुनिश्चित करें कि दोनों का स्टेटस हरा यानी Running हो गया है)*

---

### Step 2: डेटाबेस बनाएं (phpMyAdmin)
1. ब्राउज़र में यह लिंक खोलें:
   `http://localhost/phpmyadmin`
2. बाईं तरफ **New** पर क्लिक करें और डेटाबेस का नाम डालें:
   `dukaan_khaata_db`
3. **Create** पर क्लिक करें।
4. *(वैकल्पिक)*: आप प्रोजेक्ट की **`schema.sql`** फ़ाइल को phpMyAdmin के **Import** टैब से भी रन कर सकते हैं (हालांकि ऐप चालू होने पर अपने-आप टेबल्स बना लेती है)।

---

### Step 3: `.env` फ़ाइल चेक करें
प्रोजेक्ट के मुख्य फोल्डर में `.env` फ़ाइल पहले से XAMPP के लिए कॉन्फ़िगर है:
```env
PORT=3000
HOST="0.0.0.0"

DB_TYPE="mysql"
MYSQL_HOST="localhost"
MYSQL_PORT=3306
MYSQL_USER="root"
MYSQL_PASSWORD=""
MYSQL_DATABASE="dukaan_khaata_db"
MYSQL_SSL="false"
```
*(नोट: XAMPP में MySQL का यूजर `root` और पासवर्ड खाली `""` होता है।)*

---

### Step 4: ऐप इंस्टॉल और रन करें
प्रोजेक्ट फोल्डर में **Command Prompt (CMD)**, **PowerShell** या **VS Code Terminal** खोलें:

```bash
# 1. आवश्यक पैकेज इंस्टॉल करें
npm install

# 2. सर्वर शुरू करें
npm run dev
```

टर्मिनल में दिखेगा:
```
🚀 Dukaan Khaata Server running at http://0.0.0.0:3000
✅ [DB] Successfully connected to MySQL database: dukaan_khaata_db
```

---

### Step 5: ऐप खोलें
- अपने कंप्यूटर ब्राउज़र (Chrome, Edge) में खोलें:
  **`http://localhost:3000`**

---

### Step 6: मोबाइल फोन पर कैसे चलाएं (Android App Experience)
अगर आप अपने एंड्रॉइड फोन से माइक में बोलकर एंट्री करना चाहते हैं:
1. आपका कंप्यूटर और मोबाइल एक ही वाई-फाई (Wi-Fi) या मोबाइल हॉटस्पॉट से जुड़े होने चाहिए।
2. अपने कंप्यूटर का IP एड्रेस पता करें (CMD में `ipconfig` लिखें, उदा: `192.168.1.15`).
3. अपने मोबाइल फोन के Chrome ब्राउज़र में खोलें:
   **`http://192.168.1.15:3000`**
4. Chrome मेनू में **"Add to Home Screen"** दबाएं - यह आपके मोबाइल पर असली एंड्रॉइड ऐप की तरह इंस्टॉल हो जाएगा!
