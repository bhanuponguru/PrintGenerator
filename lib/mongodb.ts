import { MongoClient, Db } from 'mongodb';

interface MongoConnection {
  client: MongoClient;
  db: Db;
}

let cachedConnection: MongoConnection | null = null;

/**
 * Connect to MongoDB and return the database instance.
 * Uses connection caching for serverless environments.
 */
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
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      const mongoServer = await MongoMemoryServer.create();
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
export async function getDb(): Promise<Db> {
  const { db } = await connectToDatabase();
  return db;
}

/**
 * Close the database connection (mainly for testing)
 */
export async function closeConnection(): Promise<void> {
  if (cachedConnection) {
    await cachedConnection.client.close();
    cachedConnection = null;
  }
}

/**
 * Reset the cached connection (for testing)
 */
export function resetConnection(): void {
  cachedConnection = null;
}
