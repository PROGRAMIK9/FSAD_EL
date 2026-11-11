import mongoose from 'mongoose';

export const DEFAULT_DB_NAME = 'rvce_academic_hub';

/** True when the connection string names a database (mongodb://host/<db>). */
export const uriHasDatabase = (uri) => /^mongodb(\+srv)?:\/\/[^/]+\/[^/?]+/.test(uri);

/**
 * Connects Mongoose. Hosted URIs often end in "/" with no database name; then
 * MONGODB_DB (default rvce_academic_hub) is used instead of MongoDB's "test".
 */
export async function connectDB(uri = process.env.MONGODB_URI) {
  if (!uri) throw new Error('MONGODB_URI is required');
  mongoose.set('strictQuery', true);
  const dbName = process.env.MONGODB_DB || (uriHasDatabase(uri) ? undefined : DEFAULT_DB_NAME);
  await mongoose.connect(uri, dbName ? { dbName } : {});
  return mongoose.connection;
}
