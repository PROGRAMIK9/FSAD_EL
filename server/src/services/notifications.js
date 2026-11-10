import { Notification } from '../models/index.js';
export async function notify(app, recipients, { title, body, href }) {
  const unique = [...new Set(recipients.map((id) => String(id)))];
  if (!unique.length) return [];
  const rows = await Notification.insertMany(
    unique.map((recipient) => ({ recipient, title, body, href })),
    { ordered: false },
  );
  const io = app.get('io');
  if (io) for (const row of rows) io.to(`user:${row.recipient}`).emit('notification:new', row);
  return rows;
}
