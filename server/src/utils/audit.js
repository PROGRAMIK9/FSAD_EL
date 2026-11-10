import { AuditLog } from '../models/index.js';
export const audit = (req, action, entityType, entityId, details = {}) =>
  AuditLog.create({ actor: req.user?._id, action, entityType, entityId, details, ip: req.ip });
