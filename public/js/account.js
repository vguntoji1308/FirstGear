'use strict';
(function () {
  const { api, $, notice } = window.VR;
  const KEY = 'fg_customer_token';
  let token = sessionStorage.getItem(KEY), registrationToken = '', challengeId = '', busy = false, resendAt = 0;
  const message = (type, text) => notice($('#account-message'), type, text);
  function navLabel() {
    const link = document.querySelector('#nav-links a[href="/account"]');
    if (link) link.textContent = token ? 'Account' : 'Sign in';
  }
  function profile(customer) {
    $('#account-signin').classList.add('hidden');
    $('#account-profile').classList.remove('hidden');
    $('#profile-name').textContent = customer.name;
    $('#profile-phone').textContent = customer.phone;
    navLabel();
  }
  function clearSession() {
    token = null; registrationToken = ''; challengeId = '';
    sessionStorage.removeItem(KEY);
    $('#account-profile').classList.add('hidden');
    $('#account-signin').classList.remove('hidden');
    $('#otp-form').classList.add('hidden');
    $('#registration-form').classList.add('hidden');
    $('#phone-form').classList.remove('hidden');
    $('#profile-name').textContent = ''; $('#profile-phone').textContent = '';
    $('#registration-form').reset(); $('#otp-form').reset();
    navLabel();
  }
  async function action(fn) {
    if (busy) return;
    busy = true;
    document.querySelectorAll('.account-panel button').forEach((button) => { button.disabled = true; });
    try { await fn(); }
    catch (err) {
      if (err.status === 401) clearSession();
      message('error', err.message);
    } finally {
      busy = false;
      document.querySelectorAll('.account-panel button').forEach((button) => { button.disabled = false; });
    }
  }
  async function uploadLicence(form) {
    const response = await fetch('/api/customer/register', {
      method: 'POST', headers: { Authorization: `Bearer ${registrationToken}` }, body: new FormData(form),
    });
    const data = await response.json();
    if (!response.ok) {
      const err = new Error(data.error || 'Registration failed'); err.status = response.status;
      if (data.details) err.message += ': ' + Object.values(data.details).join('; ');
      throw err;
    }
    return data;
  }
  document.addEventListener('vr:ready', async () => {
    $('#phone-form').addEventListener('submit', (event) => {
      event.preventDefault();
      action(async () => {
        if (Date.now() < resendAt) throw new Error(`Please wait ${Math.ceil((resendAt - Date.now()) / 1000)} seconds before requesting another code.`);
        const phone = $('#account-phone').value.trim();
        const result = await api('/customer/otp/request', { method: 'POST', body: { phone } });
        challengeId = result.challengeId; registrationToken = '';
        resendAt = Date.now() + result.retryAfter * 1000;
        $('#otp-form').reset(); $('#otp-form').classList.remove('hidden');
        $('#registration-form').classList.add('hidden');
        $('#otp-recipient').textContent = `Code requested for ${phone}.`;
        message('ok', result.message); $('#account-code').focus();
      });
    });
    $('#otp-form').addEventListener('submit', (event) => {
      event.preventDefault();
      action(async () => {
        const result = await api('/customer/otp/verify', { method: 'POST', body: { challengeId, code: $('#account-code').value } });
        $('#otp-form').reset(); $('#otp-form').classList.add('hidden'); $('#phone-form').classList.add('hidden');
        challengeId = '';
        if (result.needsRegistration) {
          registrationToken = result.registrationToken;
          $('#registration-form').classList.remove('hidden');
          message('info', 'Phone verified. Complete registration within 15 minutes.'); $('#account-name').focus();
        } else {
          token = result.token; sessionStorage.setItem(KEY, token);
          profile(result.customer); message('ok', 'Signed in successfully.');
        }
      });
    });
    $('#registration-form').addEventListener('submit', (event) => {
      event.preventDefault();
      action(async () => {
        const file = $('#account-licence').files[0];
        if (!file || file.size > 10 * 1024 * 1024) throw new Error('Choose a driving-licence image no larger than 10 MB.');
        const result = await uploadLicence(event.target);
        token = result.token; registrationToken = ''; sessionStorage.setItem(KEY, token);
        event.target.reset(); profile(result.customer); message('ok', 'Your account has been created.');
      });
    });
    $('#licence-download').addEventListener('click', () => action(async () => {
      const response = await fetch('/api/customer/licence', { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        const data = await response.json(); const err = new Error(data.error || 'Driving-licence download failed'); err.status = response.status; throw err;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'driving-licence.webp';
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }));
    $('#account-logout').addEventListener('click', () => action(async () => {
      await api('/customer/logout', { method: 'POST', token });
      clearSession(); message('ok', 'Signed out.');
    }));
    if (token) await action(async () => profile(await api('/customer/me', { token })));
  });
})();
