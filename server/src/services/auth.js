import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
export async function authenticateGoogle(credential) {
  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  const info = ticket.getPayload();
  if (!info?.email_verified)
    throw Object.assign(new Error('A verified Google email is required'), { status: 401 });
  const email = info.email.toLowerCase();
  const domains = (process.env.ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  const allowlist = (process.env.ALLOWED_EMAILS || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  if (!domains.some((domain) => email.endsWith(`@${domain}`)) && !allowlist.includes(email))
    throw Object.assign(new Error('This account is not authorized for RVCE Academic Hub'), { status: 403 });
  const user = await User.findOne({ email });
  if (!user)
    throw Object.assign(new Error('Account not provisioned. Contact an administrator.'), { status: 403 });
  if (!user.isActive || user.approvalStatus !== 'approved')
    throw Object.assign(new Error('Account is pending approval or inactive'), { status: 403 });
  user.googleId = info.sub;
  user.lastLoginAt = new Date();
  await user.save();
  return { user, token: signSession(user) };
}

export const signSession = (user) =>
  jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_TTL || '4h' });

/**
 * Local-development sign-in that skips Google. It is available only when
 * DEV_LOGIN=true and NODE_ENV is not production, and still requires an
 * existing, active, approved account.
 */
export const devLoginEnabled = () =>
  process.env.DEV_LOGIN === 'true' && process.env.NODE_ENV !== 'production';

export async function authenticateDev(email) {
  if (!devLoginEnabled()) throw Object.assign(new Error('Not found'), { status: 404 });
  const user = await User.findOne({ email: String(email).toLowerCase() });
  if (!user || !user.isActive || user.approvalStatus !== 'approved')
    throw Object.assign(new Error('No active account with that email'), { status: 403 });
  user.lastLoginAt = new Date();
  await user.save();
  return { user, token: signSession(user) };
}
