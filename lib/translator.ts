// Multi-language Translation Engine for SafeFleet Exam Questions & Options

export type SupportedLanguage = 'en' | 'hi' | 'ur' | 'ar' | 'tl';

const TRANSLATION_CACHE = new Map<string, string>();

// Predefined high-precision translations for common driving and EHSS safety question phrases
const PREDEFINED_TRANSLATIONS: Record<string, Record<SupportedLanguage, string>> = {
  // Common Questions
  "What is the recommended following distance when transporting hazardous materials?": {
    en: "What is the recommended following distance when transporting hazardous materials?",
    hi: "खतरनाक सामग्री का परिवहन करते समय अनुशंसित सुरक्षित दूरी क्या है?",
    ur: "خطرناک مواد کی نقل و حمل کے دوران تجویز کردہ محفوظ فاصلہ کیا ہے؟",
    ar: "ما هي مسافة الأمان الموصى بها عند نقل المواد الخطرة؟",
    tl: "Ano ang inirerekomendang distansya ng pagsunod kapag nagtatransporte ng mga delikadong materyales?",
  },
  "Which of these are key defensive driving techniques? (select all that apply)": {
    en: "Which of these are key defensive driving techniques? (select all that apply)",
    hi: "इनमें से कौन सी प्रमुख रक्षात्मक ड्राइविंग तकनीकें हैं? (सभी लागू विकल्प चुनें)",
    ur: "ان میں سے کون سی اہم دفاعی ڈرائیونگ کی تکنیکیں ہیں؟ (تمام متعلقہ منتخب کریں)",
    ar: "أي مما يلي يعد من تقنيات القيادة الوقائية الرئيسية؟ (اختر كل ما ينطبق)",
    tl: "Alin sa mga ito ang mga pangunahing pamamaraan ng defensive driving? (piliin ang lahat ng naaangkop)",
  },
  "When approaching an intersection with a stale green light, you should prepare to stop.": {
    en: "When approaching an intersection with a stale green light, you should prepare to stop.",
    hi: "जब आप किसी ऐसे चौराहे के पास पहुँचते हैं जहाँ लंबे समय से हरी बत्ती है, तो आपको रुकने के लिए तैयार रहना चाहिए।",
    ur: "جب آپ کسی ایسے چوراہے کے قریب پہنچیں جہاں دیر سے ہری بتی آن ہو، تو آپ کو رکنے کے لیے تیار رہنا چاہیے۔",
    ar: "عند الاقتراب من تقاطع بضوء أخضر قديم، يجب عليك الاستعداد للتوقف.",
    tl: "Kapag lumalapit sa isang sangandaan na matagal nang berde ang ilaw, dapat kang maghandang huminto.",
  },
  "Hydroplaning is more likely at speeds above:...": {
    en: "Hydroplaning is more likely at speeds above:...",
    hi: "हाइड्रोप्लेनिंग (पानी पर फिसलने) की संभावना किस गति से अधिक पर होती है:...",
    ur: "ہائیڈرو پلیننگ (پانی پر پھسلنے) کا امکان کس رفتار سے زیادہ پر ہوتا ہے:...",
    ar: "يزداد احتمال حدوث الانزلاق المائي عند السرعات التي تزيد عن:...",
    tl: "Ang hydroplaning ay mas malamang sa mga bilis na higit sa:...",
  },
  "Fatigue impairs reaction time similarly to:...": {
    en: "Fatigue impairs reaction time similarly to:...",
    hi: "थकान प्रतिक्रिया समय को किस प्रकार प्रभावित करती है:...",
    ur: "تھکاوٹ ردعمل کے وقت کو کس طرح متاثر کرتی ہے:...",
    ar: "تؤثر التعب والإرهاق على سرعة الاستجابة بشكل مشابه لـ:...",
    tl: "Ang pagod ay nakakaapekto sa oras ng reaksyon tulad ng:...",
  },
  "A blind spot check is necessary before:...": {
    en: "A blind spot check is necessary before:...",
    hi: "ब्लाइंड स्पॉट की जांच किसके पहले आवश्यक है:...",
    ur: "بلائنڈ اسپاٹ چیک کس سے پہلے ضروری ہے:...",
    ar: "يجب فحص النقاط العمياء قبل:...",
    tl: "Kailangan ang pagsuri sa blind spot bago:...",
  },
  "The safest response to an aggressive tailgater is:...": {
    en: "The safest response to an aggressive tailgater is:...",
    hi: "आक्रामक तरीके से पीछे चलने वाले वाहन चालक के प्रति सबसे सुरक्षित प्रतिक्रिया क्या है:...",
    ur: "جارحانہ انداز میں پیچھے چلنے والے ڈرائیور کے ساتھ سب سے محفوظ ردعمل کیا ہے:...",
    ar: "الاستجابة الأكثر أمانًا للسائق العدواني الملتصق بمركبتك هي:...",
    tl: "Ang pinakaligtas na tugon sa isang agresibong sumusunod nang napakalapit ay:...",
  },

  // Common Options & Choices
  "4 seconds": { en: "4 seconds", hi: "4 सेकंड", ur: "4 سیکنڈ", ar: "4 ثوانٍ", tl: "4 na segundo" },
  "2 seconds": { en: "2 seconds", hi: "2 सेकंड", ur: "2 سیکنڈ", ar: "2 ثانية", tl: "2 segundo" },
  "6 seconds": { en: "6 seconds", hi: "6 सेकंड", ur: "6 सेकंड", ar: "6 ثوانٍ", tl: "6 na segundo" },
  "10 seconds": { en: "10 seconds", hi: "10 seconds", ur: "10 سیکنڈ", ar: "10 ثوانٍ", tl: "10 segundo" },

  "True": { en: "True", hi: "सत्य (सही)", ur: "سچ", ar: "صحيح", tl: "Tama" },
  "False": { en: "False", hi: "असत्य (गलत)", ur: "غلط", ar: "خطأ", tl: "Mali" },

  "Maintaining a 3-second minimum following distance": {
    en: "Maintaining a 3-second minimum following distance",
    hi: "कम से कम 3 सेकंड की सुरक्षित दूरी बनाए रखना",
    ur: "کم از کم 3 سیکنڈ کا محفوظ فاصلہ برقرار رکھنا",
    ar: "الحفاظ على مسافة أمان لا تقل عن 3 ثوانٍ",
    tl: "Pagpapanatili ng minimum na 3-segundong distansya ng pagsunod",
  },
  "Scanning 12-15 seconds ahead": {
    en: "Scanning 12-15 seconds ahead",
    hi: "आगे 12-15 सेकंड की दूरी तक नज़र रखना",
    ur: "آگے 12 سے 15 سیکنڈ تک نظر رکھنا",
    ar: "مسح الطريق للأمام لمسافة 12-15 ثانية",
    tl: "Pag-scan ng 12-15 segundo sa unahan",
  },
  "Honking aggressively at slow drivers": {
    en: "Honking aggressively at slow drivers",
    hi: "धीमे चलने वाले ड्राइवरों पर आक्रामक रूप से हॉर्न बजाना",
    ur: "آہستہ ڈرائیوروں پر تیزی سے ہارن بجانا",
    ar: "استخدام بوق السيارة بعدوانية ضد السائقين البطئي الحركة",
    tl: "Galit na pagbusina sa mabagal na drayber",
  },
  "Checking blind spots before changing lanes": {
    en: "Checking blind spots before changing lanes",
    hi: "लेन बदलने से पहले ब्लाइंड स्पॉट की जाँच करना",
    ur: "لین تبدیل کرنے سے پہلے بلائنڈ اسپاٹ چیک کرنا",
    ar: "فحص النقاط العمياء قبل تغيير المسار",
    tl: "Pagsuri sa mga blind spot bago lumipat ng linya",
  },

  "35 mph (56 km/h)": { en: "35 mph (56 km/h)", hi: "35 मील प्रति घंटा (56 किमी/घंटा)", ur: "35 میل فی گھنٹہ (56 کلومیٹر/گھنٹہ)", ar: "35 ميل/ساعة (56 كم/ساعة)", tl: "35 mph (56 km/h)" },
  "20 mph (32 km/h)": { en: "20 mph (32 km/h)", hi: "20 मील प्रति घंटा (32 किमी/घंटा)", ur: "20 میل فی گھنٹہ (32 کلومیٹر/گھنٹہ)", ar: "20 ميل/ساعة (32 كم/ساعة)", tl: "20 mph (32 km/h)" },
  "50 mph (80 km/h)": { en: "50 mph (80 km/h)", hi: "50 मील प्रति घंटा (80 किमी/घंटा)", ur: "50 میل فی گھنٹہ (80 کلومیٹر/گھنٹہ)", ar: "50 ميل/ساعة (80 كم/ساعة)", tl: "50 mph (80 km/h)" },

  "Alcohol intoxication": { en: "Alcohol intoxication", hi: "शराब का नशा", ur: "شراب کی نادی", ar: "تأثير الكحول", tl: "Lasing sa alak" },
  "Loud music": { en: "Loud music", hi: "तेज संगीत", ur: "تیز موسیقی", ar: "الموسيقى العالية", tl: "Malakas na musika" },
  "Daydreaming": { en: "Daydreaming", hi: "दिवास्वप्न देखना", ur: "خیالی دنیا", ar: "أحلام اليقظة", tl: "Pangangarap nang gising" },

  "Changing lanes": { en: "Changing lanes", hi: "लेन बदलना", ur: "لین تبدیل کرنا", ar: "تغيير المسار", tl: "Pagpalit ng linya" },
  "Merging onto a highway": { en: "Merging onto a highway", hi: "राजमार्ग पर प्रवेश करना", ur: "ہائی وے پر شامل ہونا", ar: "الاندماج في الطريق السريع", tl: "Pagsama sa highway" },
  "Turning at an intersection": { en: "Turning at an intersection", hi: "चौराहे पर मुड़ना", ur: "چوراہے پر مڑنا", ar: "الانعطاف عند التقاطع", tl: "Pagliko sa sangandaan" },

  "Increase following distance to encourage them to pass": {
    en: "Increase following distance to encourage them to pass",
    hi: "आगे की दूरी बढ़ाएं ताकि वे आसानी से आगे निकल सकें",
    ur: "آگے کا فاصلہ بڑھائیں تاکہ وہ آسانی سے آگے نکل سکیں",
    ar: "زيادة مسافة الأمان الأمامية لتشجيعهم على التجاوز",
    tl: "Lakihan ang distansya sa unahan upang hikayatin silang mag-overtake",
  },
  "Brake harshly to scare them off": {
    en: "Brake harshly to scare them off",
    hi: "उन्हें डराने के लिए अचानक ब्रेक लगाना",
    ur: "انہیں ڈرانے کے لیے اچانک بریک لگانا",
    ar: "الضغط على الفرامل بشكل مفاجئ لإخافتهم",
    tl: "Mabilis na pagpapakawala ng preno upang takutin sila",
  },
  "Speed up to outrun them": {
    en: "Speed up to outrun them",
    hi: "उनसे आगे निकलने के लिए गति बढ़ाएं",
    ur: "ان سے آگے نکلنے کے لیے رفتار بڑھائیں",
    ar: "زيادة السرعة للابتعاد عنهم",
    tl: "Bilisan ang pagtakbo upang iwanan sila",
  },
};

/**
 * Translates any text into the target language.
 * Uses exact match dictionary first, then falls back to MyMemory Public API or returns clean text.
 */
export async function translateText(text: string, targetLang: SupportedLanguage): Promise<string> {
  if (targetLang === 'en' || !text || !text.trim()) return text;

  const trimmed = text.trim();
  const cacheKey = `${targetLang}:${trimmed}`;

  if (TRANSLATION_CACHE.has(cacheKey)) {
    return TRANSLATION_CACHE.get(cacheKey)!;
  }

  // Predefined translation lookup
  if (PREDEFINED_TRANSLATIONS[trimmed]?.[targetLang]) {
    const res = PREDEFINED_TRANSLATIONS[trimmed][targetLang];
    TRANSLATION_CACHE.set(cacheKey, res);
    return res;
  }

  // Dynamic API Fetch (MyMemory Free Translation Service)
  try {
    const langPair = `en|${targetLang}`;
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(trimmed)}&langpair=${langPair}`);
    if (res.ok) {
      const json = await res.json();
      if (json.responseData?.translatedText && !json.responseData.translatedText.includes('MYMEMORY WARNING')) {
        const translated = json.responseData.translatedText;
        TRANSLATION_CACHE.set(cacheKey, translated);
        return translated;
      }
    }
  } catch (err) {
    console.warn('Translation API error:', err);
  }

  return trimmed;
}
