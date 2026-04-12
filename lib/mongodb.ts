import { MongoClient, Db, ClientSession } from 'mongodb';

/** Cached connection bundle shared across requests and tests. */
interface MongoConnection {
  client: MongoClient;
  db: Db;
}

let cachedConnection: MongoConnection | null = null;

/**
 * Connect to MongoDB and return the database instance.
 * Uses connection caching for serverless environments.
 */
/** Connects to MongoDB, falling back to an in-memory replica set in tests. */
export async function connectToDatabase(): Promise<MongoConnection> {
  // Get environment variables at runtime, not module load time
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB;

  if (!uri) {
    throw new Error('Please define the MONGODB_URI environment variable');
  }

  if (!dbName) {
    throw new Error('Please define the MONGODB_DB environment variable');
  }

  // Return cached connection if available
  if (cachedConnection) {
    return cachedConnection;
  }

  // Create new connection
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 2000 });
  
  try {
    // Attempt to connect with a short timeout to seamlessly fallback to memory-server
    await client.connect();
    const db = client.db(dbName);
    cachedConnection = { client, db };
    return cachedConnection;
  } catch (err: any) {
    if (uri.includes('localhost') || uri.includes('127.0.0.1')) {
      console.warn('⚠️ Local MongoDB connection failed. Falling back to mongodb-memory-server...');
      // Dynamically import to avoid stuffing the prod bundle
      // Transactions absolutely require a Replica Set topology; standard memory servers fail.
      const { MongoMemoryReplSet } = await import('mongodb-memory-server');
      const mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
      const memUri = mongoServer.getUri();
      
      const memClient = new MongoClient(memUri);
      await memClient.connect();
      const db = memClient.db(dbName);
      cachedConnection = { client: memClient, db };
      return cachedConnection;
    }
    throw err;
  }
}

/**
 * Get the database instance
 */
/** Returns the active database handle. */
export async function getDb(): Promise<Db> {
  const { db } = await connectToDatabase();
  return db;
}

/**
 * Get the raw MongoClient instance (required for managing ClientSession Transactions)
 */
/** Returns the underlying Mongo client for transaction/session workflows. */
export async function getClient(): Promise<MongoClient> {
  const { client } = await connectToDatabase();
  return client;
}

/**
 * Executes a callback within a database transaction safely mapping to the exact cluster capabilities. 
 * If the current topology does not support transactions (e.g. standalone test DBs lacking Replica Sets),
 * it elegantly falls back to running the operations serially without throwing MongoDB Server Errors.
 */
/**
 * Executes a callback in a transaction when possible, otherwise falls back
 * to a non-transactional run so standalone deployments still work.
 */
export async function executeTransaction<T>(
  client: MongoClient,
  callback: (session?: ClientSession) => Promise<T>
): Promise<T> {
  const session = client.startSession();
  try {
    let result: T | undefined;
    let fallbackRequired = false;

    try {
      await session.withTransaction(async () => {
        result = await callback(session);
      });
      return result as T;
    } catch (err: any) {
      if (err.code === 20 || (err.message && err.message.toLowerCase().includes('replica set'))) {
        console.warn('⚠️ MongoDB Transactions not supported on this topology. Executing callback non-transactionally as fallback.');
        fallbackRequired = true;
      } else {
        throw err;
      }
    }

    if (fallbackRequired) {
      result = await callback(undefined);
      return result as T;
    }
    
    return result as T;
  } finally {
    await session.endSession();
  }
}

/**
 * Close the database connection (mainly for testing)
 */
/** Closes the cached connection, primarily for test cleanup. */
export async function closeConnection(): Promise<void> {
  if (cachedConnection) {
    await cachedConnection.client.close();
    cachedConnection = null;
  }
}

/**
 * Reset the cached connection (for testing)
 */
/** Clears the cached connection reference without closing it. */
export function resetConnection(): void {
  cachedConnection = null;
}
