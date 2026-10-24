'use strict';
const express = require('express');
const crypto = require('node:crypto');
const multer = require('multer');
const sharp = require('sharp');
const { HttpError } = require('../errors');
const { validator } = require('../validate');
const { transaction } = require('../db');
const { limiter } = require('../middleware');
const { createPhoneOtp } = require('../services/phone-otp');

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const now = () => Date.now();
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const asyncRoute = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = function customerRoutes({ db, config, otpFetch }) {
  const r = express.Router();
  const otp = createPhoneOtp(config.customerAuth, otpFetch);
  const sendLimit = limiter({ windowMs: 15 * 60 * 1000, max: 10 });
  const checkLimit = limiter({ windowMs: 15 * 60 * 1000, max: 30 });
  const registerLimit = limiter({ windowMs: 15 * 60 * 1000, max: 5 });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 2, fieldSize: 500, parts: 3 },
  }).single('licence');
  r.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  function issueSession(phone, purpose, customerId = null) {
    const token = crypto.randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO customer_sessions(token_hash,customer_id,phone,purpose,expires_at) VALUES(?,?,?,?,?)')
      .run(hash(token), customerId, phone, purpose, now() + (purpose === 'registration' ? 15 * 60000 : 8 * 3600000));
    return token;
  }
  function requireSession(purpose) {
    return (req, _res, next) => {
      const header = req.get('authorization') || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      const session = token && db.prepare('SELECT * FROM customer_sessions WHERE token_hash = ? AND purpose = ? AND expires_at > ?')
        .get(hash(token), purpose, now());
      if (!session) return next(new HttpError(401, 'Phone sign-in required or session expired.'));
      req.customerSession = session;
      next();
    };
  }
  const profile = (id) => db.prepare('SELECT id,phone,name,resume_mime AS licenceMime,length(resume) AS licenceBytes,created_at AS createdAt FROM customers WHERE id = ?').get(id);

  r.post('/otp/request', sendLimit, asyncRoute(async (req, res) => {
    const v = validator(req.body);
    const phone = v.string('phone', { pattern: /^\+[1-9]\d{7,14}$/, patternMsg: 'Use international format, for example +919876543210 (no spaces)' });
    v.done();
    const timestamp = now();
    db.prepare('DELETE FROM customer_sessions WHERE expires_at <= ?').run(timestamp);
    db.prepare('DELETE FROM otp_challenges WHERE created_at < ?').run(timestamp - 24 * 3600000);
    const recent = db.prepare('SELECT COUNT(*) AS count, MAX(created_at) AS latest FROM otp_challenges WHERE phone = ? AND created_at > ?')
      .get(phone, timestamp - 3600000);
    if (recent.count >= 5 || (recent.latest && timestamp - recent.latest < 60000)) throw new HttpError(429, 'Wait at least 60 seconds between codes; at most 5 codes per phone per hour.');
    const challengeId = crypto.randomBytes(24).toString('base64url');
    db.prepare("UPDATE otp_challenges SET status = 'superseded' WHERE phone = ? AND status IN ('sending','pending','checking')").run(phone);
    db.prepare("INSERT INTO otp_challenges(id,phone,status,created_at,expires_at) VALUES(?,?,'sending',?,?)")
      .run(challengeId, phone, timestamp, timestamp + 10 * 60000);
    try {
      await otp.request(phone);
      db.prepare("UPDATE otp_challenges SET status = 'pending' WHERE id = ? AND status = 'sending'").run(challengeId);
    } catch (err) {
      db.prepare("UPDATE otp_challenges SET status = 'failed' WHERE id = ?").run(challengeId);
      throw err;
    }
    res.json({ challengeId, expiresIn: 600, retryAfter: 60, message: 'OTP requested by SMS. Use the latest code sent to your phone.' });
  }));

  r.post('/otp/verify', checkLimit, asyncRoute(async (req, res) => {
    const v = validator(req.body);
    const id = v.string('challengeId', { max: 64 });
    const code = v.string('code', { pattern: /^\d{4,10}$/, patternMsg: 'Enter the numeric OTP sent to your phone' });
    v.done();
    const challenge = db.prepare("SELECT * FROM otp_challenges WHERE id = ? AND status = 'pending' AND expires_at > ?").get(id, now());
    if (!challenge || challenge.attempts >= 5) throw new HttpError(400, 'Invalid or expired challenge. Request a new OTP.');
    // Reserve this check before awaiting Twilio to prevent concurrent reuse.
    db.prepare("UPDATE otp_challenges SET status = 'checking', attempts = attempts + 1 WHERE id = ?").run(id);
    try {
      await otp.verify(challenge.phone, code);
    } catch (err) {
      db.prepare("UPDATE otp_challenges SET status = ? WHERE id = ? AND status = 'checking'")
        .run(challenge.attempts + 1 >= 5 ? 'locked' : 'pending', id);
      throw err;
    }
    const result = transaction(db, () => {
      const used = db.prepare("UPDATE otp_challenges SET status = 'used' WHERE id = ? AND status = 'checking' AND expires_at > ?").run(id, now());
      if (!used.changes) throw new HttpError(400, 'OTP challenge expired. Request a new code.');
      const customer = db.prepare('SELECT id FROM customers WHERE phone = ?').get(challenge.phone);
      return customer
        ? { needsRegistration: false, token: issueSession(challenge.phone, 'login', customer.id), customer: profile(customer.id) }
        : { needsRegistration: true, registrationToken: issueSession(challenge.phone, 'registration') };
    });
    res.json(result);
  }));

  r.post('/register', registerLimit, requireSession('registration'), (req, res, next) => {
    upload(req, res, (err) => {
      if (err) return next(new HttpError(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400,
        err.code === 'LIMIT_FILE_SIZE' ? 'Driving-licence image must be no larger than 10 MB.' : 'Upload one driving-licence image, a name and storage consent only.'));
      next();
    });
  }, asyncRoute(async (req, res) => {
    const v = validator(req.body);
    const name = v.string('name', { min: 2, max: 80 });
    const consent = v.bool('consent'); v.done();
    if (!consent) throw new HttpError(400, 'Consent to private driving-licence storage is required.');
    if (!req.file) throw new HttpError(400, 'A driving-licence image is required to register.');
    let image;
    try {
      const input = sharp(req.file.buffer, { limitInputPixels: 25000000, failOn: 'warning', animated: false });
      const metadata = await input.metadata();
      if (!['jpeg', 'png', 'webp', 'gif', 'tiff', 'heif', 'avif'].includes(metadata.format)) throw new Error('Unsupported image format');
      image = await input.rotate().webp({ quality: 90 }).toBuffer();
    } catch {
      throw new HttpError(400, 'Use a valid JPEG, PNG, WebP, GIF, TIFF or AVIF image (maximum 25 megapixels). SVG, documents and unsupported image codecs are not accepted.');
    }
    if (image.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'Processed driving-licence image exceeds 10 MB. Use a smaller image.');
    const result = transaction(db, () => {
      const session = req.customerSession;
      if (!db.prepare('DELETE FROM customer_sessions WHERE token_hash = ? AND expires_at > ?').run(session.token_hash, now()).changes) {
        throw new HttpError(401, 'Registration session expired. Verify your phone again.');
      }
      if (db.prepare('SELECT id FROM customers WHERE phone = ?').get(session.phone)) throw new HttpError(409, 'This phone is already registered. Sign in again.');
      const id = Number(db.prepare('INSERT INTO customers(phone,name,resume,resume_mime) VALUES(?,?,?,?)')
        .run(session.phone, name, image, 'image/webp').lastInsertRowid);
      return { token: issueSession(session.phone, 'login', id), customer: profile(id) };
    });
    res.status(201).json(result);
  }));

  r.get('/me', requireSession('login'), (req, res) => res.json(profile(req.customerSession.customer_id)));
  r.get('/licence', requireSession('login'), (req, res) => {
    const customer = db.prepare('SELECT resume FROM customers WHERE id = ?').get(req.customerSession.customer_id);
    if (!customer) throw new HttpError(404, 'Driving-licence image not found');
    res.set('Content-Type', 'image/webp');
    res.set('Content-Disposition', 'attachment; filename="driving-licence.webp"');
    res.send(Buffer.from(customer.resume));
  });
  r.post('/logout', requireSession('login'), (req, res) => {
    db.prepare('DELETE FROM customer_sessions WHERE token_hash = ?').run(req.customerSession.token_hash);
    res.json({ ok: true });
  });
  return r;
};
