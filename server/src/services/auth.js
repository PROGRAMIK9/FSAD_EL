import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { AuditLog, User } from '../models/index.js';
import { enrollInDefaultSubjects } from './enrolment.js';
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const listFromEnv = (name) =>
  (process.env[name] || '')
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

/** True when the email belongs to an allowed domain or is explicitly allowlisted. */
export function isAllowedEmail(email) {
  const e = String(email || '').toLowerCase();
  return (
    listFromEnv('ALLOWED_EMAIL_DOMAINS').some((d) => e.endsWith(`@${d}`)) ||
    listFromEnv('ALLOWED_EMAILS').includes(e)
  );
}

/** Name derived from an email address, e.g. asha.rao.mca25@x -> "Asha Rao". Also used for placeholder accounts. */
export const nameFromEmail = (email) => {
  const parts = email
    .split('@')[0]
    .split(/[._-]+/)
    .filter(Boolean);
  // Drop batch/roll segments such as "mca25" when there is a name part left.
  const named = parts.filter((p) => !/\d/.test(p));
  return (named.length ? named : parts).map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
};

const nameFrom = (info, email) => String(info.name || '').trim() || nameFromEmail(email);

/**
 * Signs in a verified Google identity. An allowed email that has no account yet
 * is created as an active student on first sign-in; administrators assign
 * teacher or admin roles later. Disabled or rejected accounts stay blocked.
 */
export async function resolveGoogleUser(info) {
  if (!info?.email || !info.email_verified)
    throw Object.assign(new Error('A verified Google email is required'), { status: 401 });
  const email = info.email.toLowerCase();
  if (!isAllowedEmail(email))
    throw Object.assign(new Error('This account is not authorized for RVCE Academic Hub'), { status: 403 });
  let user = await User.findOne({ email });
  let created = false;
  if (!user) {
    try {
      user = await User.create({
        email,
        name: nameFrom(info, email),
        role: 'student',
        googleId: info.sub,
        isActive: true,
        approvalStatus: 'approved',
      });
      created = true;
    } catch (err) {
      // Two first sign-ins at once: the other request created the account.
      if (err?.code !== 11000) throw err;
      user = await User.findOne({ email });
    }
  }
  if (!user.isActive || user.approvalStatus !== 'approved')
    throw Object.assign(new Error('Account is pending approval or inactive'), { status: 403 });
  if (info.sub && user.googleId !== info.sub) user.googleId = info.sub;
  // Accounts created by an administrator or the seed start with a name derived from the email.
  const googleName = String(info.name || '').trim();
  if (googleName && user.name === nameFromEmail(email)) user.name = googleName;
  user.lastLoginAt = new Date();
  await user.save();
  if (created) {
    await enrollInDefaultSubjects(user).catch((err) => console.error('Auto-enrolment failed', err));
    await AuditLog.create({
      actor: user._id,
      action: 'USER_SELF_REGISTERED',
      entityType: 'User',
      entityId: user._id,
      details: { email, role: 'student' },
    }).catch(() => {});
  }
  return { user, token: signSession(user), created };
}

export async function authenticateGoogle(credential) {
  const ticket = await googleClient.verifyIdToken({
    idToken: credential,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return resolveGoogleUser(ticket.getPayload());
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
