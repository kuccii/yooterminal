import { randomUUID } from 'node:crypto';
import { sqlite } from './db.js';

const insertAudit = sqlite.prepare(
  `INSERT INTO audit_log (id, actor_id, action, entity, entity_id, before_json, after_json, created_date)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
);

export function writeAuditLog({ actorId, action, entity, entityId, before, after }) {
  insertAudit.run(
    randomUUID(),
    actorId ?? null,
    action,
    entity,
    entityId ?? null,
    before === undefined ? null : JSON.stringify(before),
    after === undefined ? null : JSON.stringify(after),
    new Date().toISOString(),
  );
}
