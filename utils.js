// --- Data Mata Uang ---
const CURRENCY_MAP = {
  "IDR": { symbol: "Rp", name: "IDR" },
  "USD": { symbol: "$", name: "USD" },
  "EUR": { symbol: "€", name: "EUR" },
  "GBP": { symbol: "£", name: "GBP" },
  "JPY": { symbol: "¥", name: "JPY" },
  "CNY": { symbol: "¥", name: "CNY" }
};

// State Management
let currentCurrency = localStorage.getItem('app_currency') || 'IDR';
window.RATES_FROM_USD = {}; // Menyimpan semua kurs terhadap USD

// --- CSS Injection ---
const style = document.createElement('style');
style.id = 'hide-google-translate-ui';
style.innerHTML = `
  .goog-te-banner-frame, iframe.skiptranslate, .skiptranslate, .goog-tooltip, #goog-gt-tt { display: none !important; visibility: hidden !important; }
  body { top: 0 !important; position: static !important; }
  .goog-text-highlight { background-color: transparent !important; box-shadow: none !important; border: none !important; }
  #google_translate_element, .goog-logo-link, .goog-te-gadget { display: none !important; }
`;
document.head.appendChild(style);

// --- Search & Currency Functions ---

function filterCurrencies() {
  const input = document.getElementById('currency-search-input');
  const filter = input.value.toUpperCase();
  const listContainer = document.getElementById('currency-list');
  if (!listContainer) return;
  const buttons = listContainer.getElementsByTagName('button');

  for (let i = 0; i < buttons.length; i++) {
    const txtValue = buttons[i].textContent || buttons[i].innerText;
    if (txtValue.toUpperCase().indexOf(filter) > -1) {
      buttons[i].style.display = "flex";
    } else {
      buttons[i].style.display = "none";
    }
  }
}

async function fetchAndUpdateExchangeRate() {
  const codes = Object.keys(CURRENCY_MAP).join(',');
  try {
    // Fetch all rates against USD (more reliable)
    const response = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${codes}`);
    if (!response.ok) throw new Error('Network response was not ok');
    const data = await response.json();
    if (data.rates) {
      window.RATES_FROM_USD = data.rates;
      window.RATES_FROM_USD['USD'] = 1; // Add USD itself
      console.log("All currency rates from USD fetched successfully.");
    }
  } catch (error) {
    console.error("Failed to fetch rates, conversion will use fallback:", error);
  }
}

function formatPrice(priceIDR) {
  const targetCurrency = currentCurrency;
  const currencyInfo = CURRENCY_MAP[targetCurrency];

  // Fallback to IDR if currency not found or rates not loaded
  if (targetCurrency === 'IDR' || !window.RATES_FROM_USD.IDR || !currencyInfo) {
    return `Rp ${new Intl.NumberFormat("id-ID").format(priceIDR)}`;
  }

  // 1. Convert original price from IDR to USD
  const priceInUSD = priceIDR / window.RATES_FROM_USD.IDR;

  // 2. Convert price from USD to the target currency
  const targetRate = window.RATES_FROM_USD[targetCurrency];
  if (!targetRate) {
    return `Rp ${new Intl.NumberFormat("id-ID").format(priceIDR)}`; // Fallback if target rate not found
  }
  const convertedPrice = priceInUSD * targetRate;

  return `${currencyInfo.symbol} ${new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(convertedPrice)}`;
}

function setCurrency(curr) {
  localStorage.setItem('app_currency', curr);
  location.reload();
}

function buildCurrencyDropdown() {
  const desktopMenu = document.getElementById('currency-dropdown-menu');
  const mobileMenu = document.getElementById('mobile-currency-menu');

  // Helper function to build menu items
  const buildItems = (container, isMobile) => {
    if (!container) return;
    container.innerHTML = '';

    // Add search for desktop only if list is long
    if (!isMobile && Object.keys(CURRENCY_MAP).length > 5) {
      const searchContainer = document.createElement('div');
      searchContainer.className = "p-2 sticky top-0 bg-slate-900 z-10";
      searchContainer.innerHTML = `<input type="text" id="currency-search-input" onkeyup="filterCurrencies()" placeholder="Cari mata uang..." class="w-full rounded-md border border-white/20 bg-slate-800 px-3 py-2 text-xs text-white focus:border-indigo-500 focus:outline-none">`;
      container.appendChild(searchContainer);
    }

    Object.entries(CURRENCY_MAP).forEach(([code, info]) => {
      const btn = document.createElement('button');
      // Different styling for mobile vs desktop
      if (isMobile) {
        btn.className = "flex items-center justify-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 hover:bg-white/10 transition border border-white/5 w-full";
        btn.innerHTML = `<span class="font-bold text-emerald-400">${info.symbol}</span> ${code}`;
      } else {
        btn.className = "currency-item flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs text-slate-300 hover:bg-white/10 hover:text-white transition";
        btn.innerHTML = `
          <div class="flex items-center gap-3">
            <span class="font-bold text-emerald-400 w-6 text-center">${info.symbol}</span>
            <span>${info.name}</span>
          </div>
          <span class="text-xs text-slate-500 font-mono">${code}</span>
        `;
      }
      btn.onclick = () => setCurrency(code);
      container.appendChild(btn);
    });
  };

  buildItems(desktopMenu, false);
  buildItems(mobileMenu, true);
}

// --- Google Translate Logic ---
window.googleTranslateElementInit = function () {
  new google.translate.TranslateElement({ pageLanguage: 'id', includedLanguages: 'id,en', autoDisplay: false, layout: google.translate.TranslateElement.InlineLayout.SIMPLE }, 'google_translate_element');
};

function setLanguage(lang) {
  // Get the domain (handle both localhost and hosted environments)
  const hostname = window.location.hostname;

  // Function to delete all variations of a cookie
  function deleteCookie(name) {
    const expireDate = "Thu, 01 Jan 1970 00:00:00 UTC";
    // Clear with various domain and path combinations
    document.cookie = `${name}=; expires=${expireDate}; path=/;`;
    document.cookie = `${name}=; expires=${expireDate}; path=/; domain=${hostname};`;
    document.cookie = `${name}=; expires=${expireDate}; path=/; domain=.${hostname};`;
    // Try with root domain if it's a subdomain
    if (hostname.split('.').length > 2) {
      const rootDomain = hostname.split('.').slice(-2).join('.');
      document.cookie = `${name}=; expires=${expireDate}; path=/; domain=${rootDomain};`;
      document.cookie = `${name}=; expires=${expireDate}; path=/; domain=.${rootDomain};`;
    }
  }

  // Clear ALL Google Translate related cookies
  deleteCookie('googtrans');
  deleteCookie('googtrans(null)');
  deleteCookie('googtrans(en)');
  deleteCookie('googtrans(id)');

  // Clear sessionStorage items that Google Translate might use
  try {
    Object.keys(sessionStorage).forEach(key => {
      if (key.includes('google') || key.includes('translate')) {
        sessionStorage.removeItem(key);
      }
    });
  } catch (e) {
    console.log('Could not clear sessionStorage:', e);
  }

  // Save preference BEFORE setting cookie
  localStorage.setItem('app_lang', lang);

  // Set the new cookie value with proper format
  const cookieValue = (lang === 'en') ? '/id/en' : '/id/id';

  // Set cookie without domain to let browser handle it automatically
  document.cookie = `googtrans=${cookieValue}; path=/; max-age=31536000; SameSite=Lax;`;

  // Force a complete refresh by using location.href instead of reload
  // This ensures Google Translate reinitializes completely
  setTimeout(() => {
    window.location.href = window.location.pathname + window.location.search;
  }, 100);
}

function updateDropdownUI() {
  const savedLang = localStorage.getItem('app_lang') || 'id';
  const langText = document.getElementById('current-lang-text');
  const langFlag = document.getElementById('current-lang-flag');
  if (langText && langFlag) {
    langText.textContent = savedLang === 'en' ? 'EN' : 'ID';
    langFlag.textContent = savedLang === 'en' ? '🇺🇸' : '🇮🇩';
  }

  const currText = document.getElementById('current-curr-text');
  const currSymbol = document.getElementById('current-curr-symbol');
  if (currText && currSymbol && CURRENCY_MAP[currentCurrency]) {
    currText.textContent = currentCurrency;
    currSymbol.textContent = CURRENCY_MAP[currentCurrency].symbol;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateDropdownUI();
  buildCurrencyDropdown();
});
