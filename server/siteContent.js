import express from 'express';
import { sqlite } from './db.js';

function parseValue(raw) {
  if (raw === null || raw === undefined) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export function createSiteContentRouter() {
  const router = express.Router();

  router.get('/', (req, res) => {
    const content = {};
    const rows = sqlite.prepare('SELECT "key", value FROM site_content').all();
    for (const row of rows) {
      const value = parseValue(row.value);
      if (value !== null) content[row.key] = value;
    }

    const faqs = sqlite
      .prepare('SELECT id, question, answer, sort_order FROM site_faq WHERE active = 1 ORDER BY sort_order ASC')
      .all();
    const features = sqlite
      .prepare('SELECT id, title, description, sort_order FROM site_feature WHERE active = 1 ORDER BY sort_order ASC')
      .all();

    res.json({ content, faqs, features });
  });

  return router;
}
