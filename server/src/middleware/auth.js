import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
export async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.accessToken || req.get('authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ ok: false, error: 'Authentication required' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.sub).select('-__v');
    if (!user || !user.isActive || user.approvalStatus !== 'approved')
      return res.status(401).json({ ok: false, error: 'Account unavailable' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'Invalid or expired session' });
  }
}
export const allow =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user?.role)
      ? next()
      : res.status(403).json({ ok: false, error: 'Insufficient permissions' });
