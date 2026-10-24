'use strict';
// Tiny dependency-free validators. Collect field errors, then throw one 400.
const { HttpError } = require('./errors');

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const PHONE = /^\+?[0-9 ()-]{7,20}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g;

class Validator {
  constructor(input) { this.input = input && typeof input === 'object' ? input : {}; this.errors = {}; this.out = {}; }
  fail(field, msg) { if (!this.errors[field]) this.errors[field] = msg; return undefined; }
  string(field, { min = 1, max = 200, optional = false, pattern, patternMsg } = {}) {
    let v = this.input[field];
    if (v === undefined || v === null || v === '') {
      if (!optional) this.fail(field, 'Required');
      return (this.out[field] = optional ? '' : undefined);
    }
    if (typeof v !== 'string') return this.fail(field, 'Must be text');
    v = v.trim().replace(CONTROL_CHARS, '');
    if (v.length < min) return this.fail(field, `Must be at least ${min} characters`);
    if (v.length > max) return this.fail(field, `Must be at most ${max} characters`);
    if (pattern && !pattern.test(v)) return this.fail(field, patternMsg || 'Invalid format');
    return (this.out[field] = v);
  }
  email(field) {
    const v = this.string(field, { max: 254, pattern: EMAIL, patternMsg: 'Enter a valid email address' });
    if (v) this.out[field] = v.toLowerCase();
    return this.out[field];
  }
  phone(field) { return this.string(field, { pattern: PHONE, patternMsg: 'Enter a valid phone number' }); }
  date(field, { optional = false } = {}) {
    const v = this.string(field, { optional, pattern: DATE, patternMsg: 'Use YYYY-MM-DD' });
    if (v) {
      const d = new Date(`${v}T00:00:00Z`);
      if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) return this.fail(field, 'Invalid date');
    }
    return v;
  }
  int(field, { min = -Infinity, max = Infinity, optional = false } = {}) {
    const v = this.input[field];
    if (v === undefined || v === null || v === '') { if (!optional) this.fail(field, 'Required'); return undefined; }
    const n = Number(v);
    if (!Number.isInteger(n) || n < min || n > max) return this.fail(field, `Must be a whole number between ${min} and ${max}`);
    return (this.out[field] = n);
  }
  number(field, { min = -Infinity, max = Infinity, optional = false } = {}) {
    const v = this.input[field];
    if (v === undefined || v === null || v === '') { if (!optional) this.fail(field, 'Required'); return undefined; }
    const n = Number(v);
    if (!Number.isFinite(n) || n < min || n > max) return this.fail(field, `Must be a number between ${min} and ${max}`);
    return (this.out[field] = n);
  }
  oneOf(field, values, { optional = false } = {}) {
    const v = this.input[field];
    if (v === undefined || v === '') { if (!optional) this.fail(field, 'Required'); return undefined; }
    if (!values.includes(v)) return this.fail(field, `Must be one of: ${values.join(', ')}`);
    return (this.out[field] = v);
  }
  bool(field) { const v = this.input[field]; return (this.out[field] = v === true || v === 'true' || v === 1 || v === '1'); }
  done() {
    if (Object.keys(this.errors).length) throw new HttpError(400, 'Validation failed', this.errors);
    return this.out;
  }
}

const validator = (input) => new Validator(input);
const todayIso = () => new Date().toISOString().slice(0, 10);
const shiftYears = (iso, years) => {
  const date = new Date(`${iso}T00:00:00Z`);
  const month = date.getUTCMonth();
  date.setUTCFullYear(date.getUTCFullYear() + years);
  if (date.getUTCMonth() !== month) date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
};
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const ageOn = (dob, onDate) => {
  const d = new Date(`${dob}T00:00:00Z`), t = new Date(`${onDate}T00:00:00Z`);
  let age = t.getUTCFullYear() - d.getUTCFullYear();
  if (t.getUTCMonth() < d.getUTCMonth() || (t.getUTCMonth() === d.getUTCMonth() && t.getUTCDate() < d.getUTCDate())) age--;
  return age;
};

module.exports = { validator, todayIso, shiftYears, daysBetween, ageOn };
