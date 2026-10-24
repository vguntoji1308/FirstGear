'use strict';
// Central configuration. Everything comes from environment variables.
// Selected env file: config/<APP_ENV>.env (dev | prod), then .env. Real environment variables always win.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const appEnv = (process.env.APP_ENV || (process.env.NODE_ENV === 'production' ? 'prod' : 'dev')).toLowerCase();

for (const file of [path.join(root, 'config', `${appEnv}.env`), path.join(root, '.env')]) {
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

const env = process.env;
const isProd = appEnv === 'prod';
const isTest = appEnv === 'test';
const int = (v, d) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : d);
const bool = (v, d) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(String(v).toLowerCase()));
const list = (v) => (v ? String(v).split(',').map((s) => s.trim()).filter(Boolean) : []);

const PLACEHOLDER = /change[-_ ]?me|replace[-_ ]?me|example|password123/i;
const problems = [];
const warnings = [];

let jwtSecret = env.JWT_SECRET;
if (!jwtSecret || PLACEHOLDER.test(jwtSecret) || jwtSecret.length < 32) {
  if (isProd) problems.push('JWT_SECRET must be set to a random string of at least 32 characters.');
  else {
    jwtSecret = crypto.randomBytes(32).toString('hex');
    if (!isTest) warnings.push('JWT_SECRET not set; using a random one (admin sessions reset on restart).');
  }
}

const adminEmail = env.ADMIN_EMAIL || 'admin@localhost.test';
let adminPassword = env.ADMIN_PASSWORD;
if (!adminPassword || PLACEHOLDER.test(adminPassword) || adminPassword.length < 12) {
  if (isProd) problems.push('ADMIN_PASSWORD must be set (min 12 characters, not a placeholder).');
  else {
    adminPassword = crypto.randomBytes(9).toString('base64url');
    if (!isTest) warnings.push(`ADMIN_PASSWORD not set; generated a one-off dev password for ${adminEmail}: ${adminPassword}`);
  }
}

if (isProd && list(env.CORS_ORIGINS).includes('*')) problems.push('CORS_ORIGINS must not be "*" in prod.');
if (problems.length) {
  console.error(`Invalid ${appEnv} configuration:\n - ${problems.join('\n - ')}`);
  throw new Error('Invalid configuration');
}

module.exports = {
  appEnv,
  isProd,
  isTest,
  root,
  warnings,
  host: env.HOST || '0.0.0.0',
  port: int(env.PORT, 3000),
  trustProxy: bool(env.TRUST_PROXY, isProd),
  dbPath: env.DB_PATH || path.join(root, 'data', `${appEnv}.sqlite`),
  seedDemoData: bool(env.SEED_DEMO_DATA, !isProd),
  jwtSecret,
  jwtExpiresIn: env.JWT_EXPIRES_IN || '8h',
  adminEmail,
  adminPassword,
  corsOrigins: list(env.CORS_ORIGINS), // empty = same-origin only
  rateLimit: {
    windowMs: int(env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: int(env.RATE_LIMIT_MAX, 300),
    writeMax: int(env.RATE_LIMIT_WRITE_MAX, 30),
    loginMax: int(env.RATE_LIMIT_LOGIN_MAX, 10),
  },
  business: {
    name: env.BUSINESS_NAME || 'FirstGear Car Rentals',
    // Public link to the Google Maps listing ("View on Google"). Set GOOGLE_REVIEWS_URL to your own listing link.
    googleReviewsUrl: env.GOOGLE_REVIEWS_URL || 'https://www.google.com/maps/search/?api=1&query=First+Gear+Cars+Coimbatore',
    // Defaults come from the FirstGear demo site; override with BUSINESS_PHONE (E.164 style).
    phone: env.BUSINESS_PHONE || '+91 96533 13974',
    email: env.BUSINESS_EMAIL || 'firstgearcarzit@gmail.com',
    address: env.BUSINESS_ADDRESS || 'No 51/A, Ganesh Nagar, Veeriyampalayam Road, Kalapatti Post, Coimbatore 641048',
    hours: env.BUSINESS_HOURS || 'Daily 08:00-20:00 (please confirm)',
    supportNote: env.BUSINESS_SUPPORT_NOTE || 'Phone line answered 24/7 for breakdowns and urgent requests.',
    social: {
      facebook: env.SOCIAL_FACEBOOK ?? 'https://facebook.com/',
      instagram: env.SOCIAL_INSTAGRAM ?? 'https://instagram.com/',
      x: env.SOCIAL_X ?? 'https://x.com/',
      linkedin: env.SOCIAL_LINKEDIN ?? 'https://linkedin.com/',
      youtube: env.SOCIAL_YOUTUBE ?? 'https://youtube.com/',
      whatsapp: env.SOCIAL_WHATSAPP ?? 'https://wa.me/919653313974',
    },
  },
  rental: {
    currency: env.CURRENCY || 'INR',
    currencySymbol: env.CURRENCY_SYMBOL || '₹',
    taxRate: Number(env.TAX_RATE ?? 0.05),
    minDriverAge: int(env.MIN_DRIVER_AGE, 21),
    youngDriverUnder: int(env.YOUNG_DRIVER_UNDER, 25),
    youngDriverFeePerDay: Number(env.YOUNG_DRIVER_FEE_PER_DAY ?? 300),
    maxRentalDays: int(env.MAX_RENTAL_DAYS, 30),
    weeklyDiscount: Number(env.WEEKLY_DISCOUNT ?? 0.1), // applied to rentals of 7+ days
    chauffeurDailyRate: Number(env.CHAUFFEUR_DAILY_RATE ?? 1200),
    minChauffeurAge: 18,
    freeCancellationHours: int(env.FREE_CANCELLATION_HOURS, 48),
  },
  chatbot: { provider: env.CHATBOT_PROVIDER || 'rules' },
};
