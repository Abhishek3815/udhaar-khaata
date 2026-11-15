# 🚀 दुकान खाता (Dukaan Khaata) - Live Server Deployment Guide

इस ऐप को लाइव सर्वर या होस्टिंग (Hostinger, GoDaddy, cPanel, VPS आदि) पर अपलोड करने की पूरी गाइड नीचे दी गई है।

---

## 📦 तरीका 1: cPanel / Shared Hosting पर अपलोड करना (सबसे आसान)
*(Hostinger, GoDaddy, Namecheap, Bluehost या किसी भी cPanel होस्टिंग के लिए)*

आपके प्रोजेक्ट में पहले से तैयार ज़िप फ़ाइल **`dukaan-live-server.zip`** (केवल 152 KB) बन चुकी है।

### स्टेप 1: डेटाबेस बनाएं (cPanel / MySQL)
1. अपने होस्टिंग cPanel में लॉगिन करें।
2. **"MySQL Database Wizard"** या **"Databases"** पर जाएं।
3. एक नया डेटाबेस बनाएं (उदा: `u123456_dukaan_db`)।
4. एक नया डेटाबेस यूज़र और पासवर्ड बनाएं (उदा: `u123456_user` और पासवर्ड `MySecret@123`)।
5. उस यूज़र को उस डेटाबेस के लिए **"ALL PRIVILEGES"** देकर Save करें।
6. cPanel में **"phpMyAdmin"** खोलें।
7. अपने बनाए गए डेटाबेस पर क्लिक करें और ऊपर **"Import"** टैब पर जाएं।
8. प्रोजेक्ट के फोल्डर में मौजूद [schema.sql](file:///c:/Users/Asus/Desktop/dukaan-khaata-app/schema.sql) फ़ाइल को सेलेक्ट करके **"Import / Go"** दबाएं। (सभी टेबल्स तैयार हो जाएंगी)।

---

### स्टेप 2: वेबसाइट फ़ाइलें अपलोड करें
1. cPanel में **"File Manager"** खोलें।
2. **`public_html`** (या अपने सब-डोमेन) फ़ोल्डर में जाएं।
3. ऊपर **"Upload"** बटन दबाएं और [dukaan-live-server.zip](file:///c:/Users/Asus/Desktop/dukaan-khaata-app/dukaan-live-server.zip) फ़ाइल अपलोड करें।
4. अपलोड होने के बाद ज़िप फ़ाइल पर राइट क्लिक करके **"Extract"** करें।
5. `public_html` में आपको ये फ़ाइलें दिखेंगी:
   - `index.html`
   - `assets/` (CSS और JS)
   - `api/` (`config.php` और `index.php`)
   - `.htaccess`

---

### स्टेप 3: डेटाबेस पासवर्ड जोड़ें (`api/config.php`)
1. cPanel File Manager में `public_html/api/config.php` फ़ाइल पर राइट क्लिक करके **"Edit"** चुनें।
2. केवल ये 3 लाइनें अपने cPanel डेटाबेस के अनुसार बदलें:
   ```php
   define('DB_HOST', 'localhost');
   define('DB_NAME', 'apna_database_name');  // Step 1 वाला डेटाबेस नाम
   define('DB_USER', 'apna_database_user');  // Step 1 वाला यूज़रनेम
   define('DB_PASS', 'apna_database_pass');  // Step 1 वाला पासवर्ड
   ```
3. फ़ाइल को Save करें!

🎉 **बधाई हो! आपकी दुकान का खाता आपकी वेबसाइट (e.g. `https://yourdomain.com`) पर लाइव हो गया है!**

---

## 🖥️ तरीका 2: Node.js VPS / Cloud सर्वर पर अपलोड (Render, Railway, Ubuntu VPS)

यदि आपके पास VPS या Node.js क्लाउड सर्वर है:

1. **सर्वर पर Node.js 20+ और MySQL इंस्टॉल करें**।
2. पूरा प्रोजेक्ट गिट (Git) या ज़िप से सर्वर पर क्लोन/अपलोड करें।
3. सर्वर पर कमांड चलाएं:
   ```bash
   npm install
   npm run build
   ```
4. `.env` फ़ाइल बनाएं:
   ```env
   PORT=3000
   HOST=0.0.0.0
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=dukaan_khaata_db
   DB_USER=root
   DB_PASSWORD=your_password
   ```
5. **PM2** से सर्वर को बैकग्राउंड में चलाएं:
   ```bash
   npm install -g pm2
   pm2 start "npm run dev" --name "dukaan-app"
   pm2 save
   ```
6. Nginx Reverse Proxy से पोर्ट 3000 को अपने डोमेन पर फ़ॉरवर्ड करें।

---

## 🔑 डिफ़ॉल्ट लॉगिन विवरण:
- **पिन (PIN):** `1234`
- **पासवर्ड:** `admin`
- **मोबाइल:** `9369453815`
- *(लॉगिन के बाद आप दुकान सेटिंग्स से इसे कभी भी बदल सकते हैं)*
