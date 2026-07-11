import { Platform } from 'react-native'
import * as Localization from 'expo-localization'
import * as SecureStore from 'expo-secure-store'
import { create } from 'zustand'

// Lightweight i18n: EN is the source of truth; AR and FR cover the shopper
// funnel (feed, product, cart, login, checkout) plus shared labels. Screens
// not yet translated fall back to English key-by-key.
// Follow-up: full RTL layout pass (I18nManager) once AR coverage is complete.

export type Locale = 'en' | 'ar' | 'fr'

export const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ar', label: 'العربية' },
  { value: 'fr', label: 'Français' },
]

const STORAGE_KEY = 'souk.locale'

const en = {
  // Shared
  'common.retry': 'Retry',
  'common.signIn': 'Sign in',
  'common.optional': '(optional)',

  // Feed
  'feed.tagline': 'Local boutiques, delivered',
  'feed.searchPlaceholder': 'Search products or stores…',
  'feed.all': 'All',
  'feed.sortNewest': 'Newest',
  'feed.sortPriceAsc': 'Price ↑',
  'feed.sortPriceDesc': 'Price ↓',
  'feed.featuredBoutique': 'Featured boutique',
  'feed.newThisWeek': 'New this week',
  'feed.thriftedPicks': 'Thrifted picks',
  'feed.allProducts': 'All products',
  'feed.visit': 'Visit ›',
  'feed.noMatches': 'No matches',
  'feed.nothingYet': 'Nothing here yet',
  'feed.tryDifferent': 'Try a different search, category, or region.',
  'feed.newBoutiques': 'New boutiques are joining Souk every day.',
  'feed.clearFilters': 'Clear filters',
  'feed.sponsored': 'Sponsored',
  'feed.adLabel': 'Ad',
  'feed.adPlaceholder': 'Advertisement space',
  'feed.adSubtext': 'Ad partner banner mounts here',

  // Product
  'product.addToBag': 'Add to Bag',
  'product.addedToBag': 'Added to Bag ✓',
  'product.selectOptions': 'Select options',
  'product.size': 'Size',
  'product.color': 'Color',
  'product.colorNamed': 'Color — {name}',
  'product.newStore': '★ New',
  'product.linkCopied': 'Link copied',
  'product.notFound': 'Product not found.',

  // Cart
  'cart.title': 'Your Bag',
  'cart.empty': 'Your bag is empty',
  'cart.emptyBody': 'Browse the marketplace and add items to get started.',
  'cart.browse': 'Browse Products',
  'cart.subtotal': 'Subtotal',
  'cart.checkout': 'Proceed to Checkout',
  'cart.signInToCheckout': 'Sign in to Checkout',
  'cart.guestHint': 'Sign in to place your order — your bag is saved.',

  // Login
  'login.welcome': 'Welcome to Souk',
  'login.enterCode': 'Enter your code',
  'login.subtitle': 'Enter your email to sign in or create an account.',
  'login.sentCode': 'We sent a 6-digit code to\n',
  'login.invalidEmail': 'Enter a valid email address.',
  'login.sendCode': 'Send Code',
  'login.confirmCode': 'Confirm Code',
  'login.resend': 'Resend code',
  'login.resending': 'Sending…',
  'login.changeEmail': 'Change email',
  'login.newCodeSent': 'New code sent!',
  'login.genericError': 'Something went wrong. Try again.',
  'login.invalidCode': 'Invalid code. Try again.',

  // Checkout
  'checkout.title': 'Checkout',
  'checkout.orderSummary': 'Order Summary',
  'checkout.subtotal': 'Subtotal',
  'checkout.deliveryDetails': 'Delivery Details',
  'checkout.region': 'Region',
  'checkout.street': 'Street / Area',
  'checkout.streetPlaceholder': 'Building name, floor, street name, and neighbourhood',
  'checkout.landmark': 'Landmark',
  'checkout.landmarkCritical': '(critical for local couriers)',
  'checkout.landmarkPlaceholder': 'e.g. opposite the blue mosque, next to ABC pharmacy',
  'checkout.landmarkHint': 'A precise landmark greatly speeds up delivery and reduces missed drops.',
  'checkout.payment': 'Payment Method',
  'checkout.discounts': 'Discounts',
  'checkout.voucherOff': '−{pct}% off this order',
  'checkout.referralQuestion': "Have a friend's referral code?",
  'checkout.referralFirstOrder': '(first order only)',
  'checkout.apply': 'Apply',
  'checkout.referralHint': "You'll both get a 10% voucher after your first order is delivered.",
  'checkout.referralApplied': "✓ Referral applied — you'll both get a 10% voucher once this order is delivered.",
  'checkout.voucher': 'Voucher',
  'checkout.total': 'Total',
  'checkout.placeOrder': 'Place Order',
  'checkout.placing': 'Placing Order…',
  'checkout.outOfStock': 'One or more items in your bag are out of stock. Please review your cart and try again.',

  // Profile (language section)
  'profile.language': 'Language',
  'profile.languageHint': 'Choose the language Souk uses on this device.',
}

type TranslationKey = keyof typeof en

const ar: Partial<Record<TranslationKey, string>> = {
  'common.retry': 'إعادة المحاولة',
  'common.signIn': 'تسجيل الدخول',
  'common.optional': '(اختياري)',

  'feed.tagline': 'بوتيكات محلية، توصَل إليك',
  'feed.searchPlaceholder': 'ابحث عن منتجات أو متاجر…',
  'feed.all': 'الكل',
  'feed.sortNewest': 'الأحدث',
  'feed.sortPriceAsc': 'السعر ↑',
  'feed.sortPriceDesc': 'السعر ↓',
  'feed.featuredBoutique': 'بوتيك مميّز',
  'feed.newThisWeek': 'جديد هذا الأسبوع',
  'feed.thriftedPicks': 'مختارات مستعملة',
  'feed.allProducts': 'كل المنتجات',
  'feed.visit': 'زيارة ‹',
  'feed.noMatches': 'لا نتائج',
  'feed.nothingYet': 'لا شيء هنا بعد',
  'feed.tryDifferent': 'جرّب بحثًا أو فئة أو منطقة مختلفة.',
  'feed.newBoutiques': 'بوتيكات جديدة تنضم إلى سوق كل يوم.',
  'feed.clearFilters': 'مسح الفلاتر',
  'feed.sponsored': 'ممول',
  'feed.adLabel': 'إعلان',
  'feed.adPlaceholder': 'مساحة إعلانية',
  'feed.adSubtext': 'شعار الشريك الإعلاني يظهر هنا',

  'product.addToBag': 'أضِف إلى الحقيبة',
  'product.addedToBag': '✓ أُضيف إلى الحقيبة',
  'product.selectOptions': 'اختر الخيارات',
  'product.size': 'المقاس',
  'product.color': 'اللون',
  'product.colorNamed': 'اللون — {name}',
  'product.newStore': '★ جديد',
  'product.linkCopied': 'تم نسخ الرابط',
  'product.notFound': 'المنتج غير موجود.',

  'cart.title': 'حقيبتك',
  'cart.empty': 'حقيبتك فارغة',
  'cart.emptyBody': 'تصفّح السوق وأضف منتجات للبدء.',
  'cart.browse': 'تصفّح المنتجات',
  'cart.subtotal': 'المجموع الفرعي',
  'cart.checkout': 'إتمام الشراء',
  'cart.signInToCheckout': 'سجّل الدخول لإتمام الشراء',
  'cart.guestHint': 'سجّل الدخول لإتمام طلبك — حقيبتك محفوظة.',

  'login.welcome': 'أهلاً بك في سوق',
  'login.enterCode': 'أدخل الرمز',
  'login.subtitle': 'أدخل بريدك الإلكتروني لتسجيل الدخول أو إنشاء حساب.',
  'login.sentCode': 'أرسلنا رمزًا من 6 أرقام إلى\n',
  'login.invalidEmail': 'أدخل بريدًا إلكترونيًا صالحًا.',
  'login.sendCode': 'إرسال الرمز',
  'login.confirmCode': 'تأكيد الرمز',
  'login.resend': 'إعادة إرسال الرمز',
  'login.resending': 'جارٍ الإرسال…',
  'login.changeEmail': 'تغيير البريد',
  'login.newCodeSent': 'تم إرسال رمز جديد!',
  'login.genericError': 'حدث خطأ ما. حاول مجددًا.',
  'login.invalidCode': 'رمز غير صحيح. حاول مجددًا.',

  'checkout.title': 'إتمام الشراء',
  'checkout.orderSummary': 'ملخص الطلب',
  'checkout.subtotal': 'المجموع الفرعي',
  'checkout.deliveryDetails': 'تفاصيل التوصيل',
  'checkout.region': 'المنطقة',
  'checkout.street': 'الشارع / المنطقة',
  'checkout.streetPlaceholder': 'اسم المبنى، الطابق، اسم الشارع، والحي',
  'checkout.landmark': 'معلم قريب',
  'checkout.landmarkCritical': '(مهم جدًا لشركات التوصيل المحلية)',
  'checkout.landmarkPlaceholder': 'مثال: مقابل الجامع الأزرق، بجانب صيدلية ABC',
  'checkout.landmarkHint': 'معلم دقيق يسرّع التوصيل ويقلل حالات الفشل.',
  'checkout.payment': 'طريقة الدفع',
  'checkout.discounts': 'الخصومات',
  'checkout.voucherOff': 'خصم {pct}٪ على هذا الطلب',
  'checkout.referralQuestion': 'لديك رمز إحالة من صديق؟',
  'checkout.referralFirstOrder': '(للطلب الأول فقط)',
  'checkout.apply': 'تطبيق',
  'checkout.referralHint': 'ستحصلان معًا على قسيمة 10٪ بعد توصيل طلبك الأول.',
  'checkout.referralApplied': '✓ تم تطبيق الإحالة — ستحصلان معًا على قسيمة 10٪ بعد توصيل هذا الطلب.',
  'checkout.voucher': 'قسيمة',
  'checkout.total': 'المجموع',
  'checkout.placeOrder': 'تأكيد الطلب',
  'checkout.placing': 'جارٍ تأكيد الطلب…',
  'checkout.outOfStock': 'منتج أو أكثر في حقيبتك نفدت كميته. راجع حقيبتك وحاول مجددًا.',

  'profile.language': 'اللغة',
  'profile.languageHint': 'اختر اللغة التي يستخدمها سوق على هذا الجهاز.',
}

const fr: Partial<Record<TranslationKey, string>> = {
  'common.retry': 'Réessayer',
  'common.signIn': 'Se connecter',
  'common.optional': '(facultatif)',

  'feed.tagline': 'Boutiques locales, livrées chez vous',
  'feed.searchPlaceholder': 'Rechercher produits ou boutiques…',
  'feed.all': 'Tout',
  'feed.sortNewest': 'Nouveautés',
  'feed.sortPriceAsc': 'Prix ↑',
  'feed.sortPriceDesc': 'Prix ↓',
  'feed.featuredBoutique': 'Boutique à la une',
  'feed.newThisWeek': 'Nouveau cette semaine',
  'feed.thriftedPicks': 'Sélection seconde main',
  'feed.allProducts': 'Tous les produits',
  'feed.visit': 'Visiter ›',
  'feed.noMatches': 'Aucun résultat',
  'feed.nothingYet': 'Rien ici pour le moment',
  'feed.tryDifferent': 'Essayez une autre recherche, catégorie ou région.',
  'feed.newBoutiques': 'De nouvelles boutiques rejoignent Souk chaque jour.',
  'feed.clearFilters': 'Effacer les filtres',
  'feed.sponsored': 'Sponsorisé',
  'feed.adLabel': 'Pub',
  'feed.adPlaceholder': 'Espace publicitaire',
  'feed.adSubtext': "La bannière du partenaire publicitaire s'affiche ici",

  'product.addToBag': 'Ajouter au panier',
  'product.addedToBag': 'Ajouté au panier ✓',
  'product.selectOptions': 'Choisir les options',
  'product.size': 'Taille',
  'product.color': 'Couleur',
  'product.colorNamed': 'Couleur — {name}',
  'product.newStore': '★ Nouveau',
  'product.linkCopied': 'Lien copié',
  'product.notFound': 'Produit introuvable.',

  'cart.title': 'Votre panier',
  'cart.empty': 'Votre panier est vide',
  'cart.emptyBody': 'Parcourez le marché et ajoutez des articles pour commencer.',
  'cart.browse': 'Parcourir les produits',
  'cart.subtotal': 'Sous-total',
  'cart.checkout': 'Passer la commande',
  'cart.signInToCheckout': 'Connectez-vous pour commander',
  'cart.guestHint': 'Connectez-vous pour commander — votre panier est sauvegardé.',

  'login.welcome': 'Bienvenue sur Souk',
  'login.enterCode': 'Saisissez votre code',
  'login.subtitle': 'Entrez votre e-mail pour vous connecter ou créer un compte.',
  'login.sentCode': 'Nous avons envoyé un code à 6 chiffres à\n',
  'login.invalidEmail': 'Entrez une adresse e-mail valide.',
  'login.sendCode': 'Envoyer le code',
  'login.confirmCode': 'Confirmer le code',
  'login.resend': 'Renvoyer le code',
  'login.resending': 'Envoi…',
  'login.changeEmail': "Changer d'e-mail",
  'login.newCodeSent': 'Nouveau code envoyé !',
  'login.genericError': 'Une erreur est survenue. Réessayez.',
  'login.invalidCode': 'Code invalide. Réessayez.',

  'checkout.title': 'Commande',
  'checkout.orderSummary': 'Récapitulatif',
  'checkout.subtotal': 'Sous-total',
  'checkout.deliveryDetails': 'Détails de livraison',
  'checkout.region': 'Région',
  'checkout.street': 'Rue / Quartier',
  'checkout.streetPlaceholder': 'Nom de l\'immeuble, étage, rue et quartier',
  'checkout.landmark': 'Point de repère',
  'checkout.landmarkCritical': '(essentiel pour les coursiers locaux)',
  'checkout.landmarkPlaceholder': 'ex. en face de la mosquée bleue, à côté de la pharmacie ABC',
  'checkout.landmarkHint': 'Un repère précis accélère la livraison et évite les échecs.',
  'checkout.payment': 'Mode de paiement',
  'checkout.discounts': 'Réductions',
  'checkout.voucherOff': '−{pct}% sur cette commande',
  'checkout.referralQuestion': "Vous avez un code de parrainage ?",
  'checkout.referralFirstOrder': '(première commande uniquement)',
  'checkout.apply': 'Appliquer',
  'checkout.referralHint': 'Vous recevrez chacun un bon de 10% après la livraison de votre première commande.',
  'checkout.referralApplied': '✓ Parrainage appliqué — vous recevrez chacun un bon de 10% après la livraison.',
  'checkout.voucher': 'Bon',
  'checkout.total': 'Total',
  'checkout.placeOrder': 'Commander',
  'checkout.placing': 'Commande en cours…',
  'checkout.outOfStock': 'Un ou plusieurs articles de votre panier sont en rupture. Vérifiez votre panier et réessayez.',

  'profile.language': 'Langue',
  'profile.languageHint': 'Choisissez la langue utilisée par Souk sur cet appareil.',
}

const DICTIONARIES: Record<Locale, Partial<Record<TranslationKey, string>>> = { en, ar, fr }

// ---------------------------------------------------------------------------
// Locale persistence + store
// ---------------------------------------------------------------------------

async function readStoredLocale(): Promise<Locale | null> {
  try {
    const raw = Platform.OS === 'web'
      ? localStorage.getItem(STORAGE_KEY)
      : await SecureStore.getItemAsync(STORAGE_KEY)
    return raw === 'en' || raw === 'ar' || raw === 'fr' ? raw : null
  } catch {
    return null
  }
}

function writeStoredLocale(locale: Locale): void {
  try {
    if (Platform.OS === 'web') localStorage.setItem(STORAGE_KEY, locale)
    else void SecureStore.setItemAsync(STORAGE_KEY, locale)
  } catch {
    // Non-fatal — locale just won't persist
  }
}

function deviceLocale(): Locale {
  const lang = Localization.getLocales()[0]?.languageCode
  return lang === 'ar' || lang === 'fr' ? lang : 'en'
}

interface LocaleState {
  locale: Locale
  setLocale: (l: Locale) => void
}

export const useLocaleStore = create<LocaleState>((set) => ({
  locale: deviceLocale(),
  setLocale: (locale) => {
    writeStoredLocale(locale)
    set({ locale })
  },
}))

// Stored preference beats device default — applied once at import time
void readStoredLocale().then(stored => {
  if (stored) useLocaleStore.setState({ locale: stored })
})

// ---------------------------------------------------------------------------
// Translation
// ---------------------------------------------------------------------------

export function translate(locale: Locale, key: TranslationKey, vars?: Record<string, string | number>): string {
  let text = DICTIONARIES[locale][key] ?? en[key]
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v))
    }
  }
  return text
}

// Hook — subscribes to locale changes so screens re-render on switch
export function useT() {
  const locale = useLocaleStore(s => s.locale)
  return (key: TranslationKey, vars?: Record<string, string | number>) =>
    translate(locale, key, vars)
}
