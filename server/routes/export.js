import { Router } from 'express';
import db from '../db/init.js';

const router = Router();

function csvEscape(value) {
  if (value == null) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// GET /api/export/logboek?from=YYYY-MM-DD&to=YYYY-MM-DD&contact_id=&channel_type=&format=csv
router.get('/logboek', (req, res) => {
  const { from, to, contact_id, channel_type } = req.query;
  const format = (req.query.format || 'csv').toLowerCase();

  const where = [`m.status = 'done'`];
  const params = {};
  if (from) { where.push(`date(m.done_at) >= @from`); params.from = from; }
  if (to)   { where.push(`date(m.done_at) <= @to`); params.to = to; }
  if (contact_id) { where.push('m.contact_id = @contact_id'); params.contact_id = contact_id; }
  if (channel_type) { where.push('ch.type = @channel_type'); params.channel_type = channel_type; }

  const rows = db.prepare(`
    SELECT
      m.done_at, m.received_at, m.subject, m.snippet, m.done_note, m.done_category,
      c.name AS contact_name, c.company AS contact_company,
      ch.type AS channel_type, ch.label AS channel_label
    FROM messages m
    LEFT JOIN contacts c ON c.id = m.contact_id
    LEFT JOIN channels ch ON ch.id = m.channel_id
    WHERE ${where.join(' AND ')}
    ORDER BY m.done_at DESC
  `).all(params);

  if (format === 'json') {
    return res.json({ items: rows, total: rows.length });
  }

  const headers = ['datum', 'contact', 'bedrijf', 'kanaal', 'onderwerp', 'snippet', 'categorie', 'notitie'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      csvEscape(r.done_at || r.received_at),
      csvEscape(r.contact_name),
      csvEscape(r.contact_company),
      csvEscape(r.channel_label || r.channel_type),
      csvEscape(r.subject),
      csvEscape(r.snippet),
      csvEscape(r.done_category),
      csvEscape(r.done_note),
    ].join(','));
  }

  const csv = lines.join('\r\n');
  const filename = `kyano-logboek-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + csv); // BOM voor Excel UTF-8
});

export default router;
