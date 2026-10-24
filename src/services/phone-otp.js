'use strict';
const { HttpError } = require('../errors');

function createPhoneOtp(settings, request = fetch) {
  const configured = /^AC[a-f0-9]{32}$/i.test(settings.accountSid)
    && /^VA[a-f0-9]{32}$/i.test(settings.verifyServiceSid) && !!settings.authToken;
  async function send(path, body) {
    if (!configured) throw new HttpError(503, 'Phone sign-in is not configured. Set up Twilio Verify; guest booking is still available.');
    let response;
    try {
      response = await request(`https://verify.twilio.com/v2/Services/${settings.verifyServiceSid}/${path}`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: `Basic ${Buffer.from(`${settings.accountSid}:${settings.authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(body).toString(),
      });
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') throw new HttpError(504, 'SMS verification timed out. Please try again later.');
      throw new HttpError(503, 'SMS verification is unavailable. Please try again later.');
    }
    if (!response.ok) {
      if (response.status === 429) throw new HttpError(429, 'SMS verification limit reached. Please try again later.');
      if (path === 'VerificationCheck' && [400, 404].includes(response.status)) throw new HttpError(400, 'Invalid or expired OTP. Request a new code.');
      throw new HttpError(502, 'Twilio could not process verification. Check the service configuration or try again later.');
    }
    try { return await response.json(); }
    catch { throw new HttpError(502, 'SMS provider returned an invalid response.'); }
  }
  return {
    async request(phone) {
      const result = await send('Verifications', { To: phone, Channel: 'sms' });
      if (result.status !== 'pending') throw new HttpError(502, 'SMS provider did not accept the verification request.');
    },
    async verify(phone, code) {
      const result = await send('VerificationCheck', { To: phone, Code: code });
      if (result.status !== 'approved') throw new HttpError(400, 'Invalid or expired OTP.');
    },
  };
}

module.exports = { createPhoneOtp };
