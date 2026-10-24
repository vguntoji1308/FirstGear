'use strict';
// Public reviews = imported Google reviews + customer feedback the admin approved for publishing.
// Demo (seeded) feedback is hidden as soon as at least one real review exists.
const crypto = require('node:crypto');

const reviewHash = (r) => crypto.createHash('sha1').update([r.author, r.rating, r.date, r.text].join('|')).digest('hex');

function collect(db, includePending) {
  const imported = db.prepare('SELECT id, author, rating, text, review_date AS date, source, url FROM customer_reviews').all()
    .map((r) => ({ ...r, key: `g${r.id}`, demo: false }));
  const feedback = db.prepare("SELECT id, name AS author, rating, message AS text, substr(created_at, 1, 10) AS date, email, approved FROM feedback WHERE (approved = 1 OR ? = 1) AND allow_publish = 1").all(includePending ? 1 : 0)
    .map((r) => ({ id: r.id, key: `f${r.id}`, author: r.author, rating: r.rating, text: r.text, date: r.date, source: 'website', url: null, pendingApproval: !r.approved, demo: r.email === 'demo@example.com' }));
  let all = [...imported, ...feedback];
  if (all.some((r) => !r.demo)) all = all.filter((r) => !r.demo);
  return all.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.id - a.id);
}

function listReviews(db, { limit, includePending = false } = {}) {
  const all = collect(db, includePending);
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  all.forEach((r) => { distribution[r.rating] += 1; });
  const count = all.length;
  const average = count ? Math.round((all.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10 : null;
  const items = (limit ? all.slice(0, limit) : all).map(({ key, author, rating, text, date, source, pendingApproval }) => ({ id: key, author, rating, text, date, source, pendingApproval: !!pendingApproval }));
  return { summary: { average, count, distribution, demo: count > 0 && all.every((r) => r.demo) }, items };
}

function importReviews(db, rows, { replace = false } = {}) {
  db.exec('BEGIN IMMEDIATE');
  try {
    if (replace) db.prepare("DELETE FROM customer_reviews WHERE source = 'google'").run();
    const ins = db.prepare('INSERT OR IGNORE INTO customer_reviews (author, rating, text, review_date, source, url, hash) VALUES (?, ?, ?, ?, ?, ?, ?)');
    let added = 0;
    for (const r of rows) {
      const info = ins.run(r.author, r.rating, r.text, r.date, 'google', r.url || null, reviewHash(r));
      added += Number(info.changes);
    }
    db.exec('COMMIT');
    return { added, skippedDuplicates: rows.length - added };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { listReviews, importReviews, reviewHash };
