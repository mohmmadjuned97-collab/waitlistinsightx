/* ============================================================
   InsightX Waitlist — Script
   Handles form submission via API, duplicate detection,
   loading/success/already-joined states, and localStorage cache.
   ============================================================ */

(function () {
  'use strict';

  // --- DOM refs ---
  const form            = document.getElementById('waitlist-form');
  const emailInput      = document.getElementById('email-input');
  const submitBtn       = document.getElementById('submit-btn');
  const errorMsg        = document.getElementById('error-msg');
  const stateForm       = document.getElementById('state-form');
  const stateSuccess    = document.getElementById('state-success');
  const stateAlready    = document.getElementById('state-already');
  const positionEl      = document.getElementById('position-number');
  const successEmail    = document.getElementById('success-email');
  const alreadyPosition = document.getElementById('already-position');
  const alreadyEmail    = document.getElementById('already-email');

  const tryAnotherBtn   = document.getElementById('try-another-btn');

  const STORAGE_KEY = 'insightx_waitlist';

  // --- Helpers ---
  function formatNumber(num) {
    return '#' + num.toLocaleString('en-US');
  }

  function getStoredData() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function storeData(email, position) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, position, ts: Date.now() }));
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
    setTimeout(() => errorMsg.classList.add('hidden'), 5000);
  }

  // --- Transition helpers ---
  function switchTo(targetEl) {
    // Hide all states
    [stateForm, stateSuccess, stateAlready].forEach(el => {
      if (!el.classList.contains('hidden')) {
        el.classList.add('fade-out');
        setTimeout(() => {
          el.classList.add('hidden');
          el.classList.remove('fade-out');
        }, 350);
      }
    });

    // Show target after a brief delay
    setTimeout(() => {
      targetEl.classList.remove('hidden');
      targetEl.classList.add('fade-in');
    }, 380);
  }

  function showSuccess(email, position) {
    positionEl.textContent = formatNumber(position);
    successEmail.textContent = 'Signed up as ' + email;
    storeData(email, position);
    switchTo(stateSuccess);
  }

  function showAlreadyJoined(email, position) {
    alreadyPosition.textContent = formatNumber(position);
    alreadyEmail.textContent = 'Registered as ' + email;
    storeData(email, position);
    switchTo(stateAlready);
  }



  // --- Form submit (Formspree API) ---
  async function handleSubmit(e) {
    e.preventDefault();
    errorMsg.classList.add('hidden');

    const email = emailInput.value.trim();
    if (!email) return;

    const emailLower = email.toLowerCase();

    // Check mock DB first (prevent sending duplicate to Formspree from same browser)
    const dbRaw = localStorage.getItem('insightx_waitlist_db');
    const db = dbRaw ? JSON.parse(dbRaw) : {};
    if (db[emailLower]) {
      showAlreadyJoined(email, db[emailLower].position);
      return;
    }

    // Activate loading state
    submitBtn.classList.add('loading');
    submitBtn.disabled = true;

    try {
      const res = await fetch('https://formspree.io/f/mwvrbjjz', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: emailLower }),
      });

      if (res.ok) {
        // Formspree success!
        const position = Object.keys(db).length + 842; // Simulated position number
        db[emailLower] = { position, ts: Date.now() };
        localStorage.setItem('insightx_waitlist_db', JSON.stringify(db));
        
        showSuccess(email, position);
      } else {
        const data = await res.json();
        if (Object.hasOwn(data, 'errors')) {
          showError(data.errors.map(err => err.message).join(', '));
        } else {
          showError('Something went wrong. Please try again.');
        }
      }
    } catch (err) {
      showError('Cannot connect to waitlist. Please check your internet connection.');
      console.error('Formspree API error:', err);
    } finally {
      submitBtn.classList.remove('loading');
      submitBtn.disabled = false;
    }
  }

  // --- Try another email (from already-joined state) ---
  function handleTryAnother() {
    localStorage.removeItem(STORAGE_KEY);
    emailInput.value = '';
    switchTo(stateForm);
  }

  // --- Init ---
  async function init() {
    const cached = getStoredData();

    if (cached && cached.email) {
      // Check local DB for returning users
      const dbRaw = localStorage.getItem('insightx_waitlist_db');
      const db = dbRaw ? JSON.parse(dbRaw) : {};
      
      const emailLower = cached.email.toLowerCase();

      if (db[emailLower]) {
        // Confirmed — show "already registered" state
        stateForm.classList.add('hidden');
        alreadyPosition.textContent = formatNumber(db[emailLower].position);
        alreadyEmail.textContent = 'Registered as ' + cached.email;
        stateAlready.classList.remove('hidden');
        stateAlready.classList.add('fade-in');
        storeData(cached.email, db[emailLower].position);
        return;
      }

      // Email not found in DB — clear stale cache
      localStorage.removeItem(STORAGE_KEY);
    }

    // Show form
    form.addEventListener('submit', handleSubmit);
    tryAnotherBtn.addEventListener('click', handleTryAnother);
  }

  // Always bind events (even if we show already-joined, try another still needs to work)
  tryAnotherBtn.addEventListener('click', handleTryAnother);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
