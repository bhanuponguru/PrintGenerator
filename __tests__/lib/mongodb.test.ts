import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { 
  connectToDatabase, 
  getDb, 
  closeConnection, 
  resetConnection 
} from '@/lib/mongodb';

describe('MongoDB Connection', () => {
  afterEach(async () => {
    await closeConnection();
    resetConnection();
  });

  describe('connectToDatabase', () => {
    it('should successfully connect to the database', async () => {
      const connection = await connectToDatabase();
      
      expect(connection).toBeDefined();
      expect(connection.client).toBeDefined();
      expect(connection.db).toBeDefined();
    });

    it('should return the same cached connection on subsequent calls', async () => {
      const connection1 = await connectToDatabase();
      const connection2 = await connectToDatabase();
      
      expect(connection1).toBe(connection2);
      expect(connection1.client).toBe(connection2.client);
      expect(connection1.db).toBe(connection2.db);
    });

    it('should throw error when MONGODB_URI is not defined', async () => {
      const originalUri = process.env.MONGODB_URI;
      delete process.env.MONGODB_URI;
      
      // Reset to clear cached connection
      resetConnection();
      
      await expect(connectToDatabase()).rejects.toThrow(
        'Please define the MONGODB_URI environment variable'
      );
      
      // Restore
      process.env.MONGODB_URI = originalUri;
    });

    it('should throw error when MONGODB_DB is not defined', async () => {
      const originalDb = process.env.MONGODB_DB;
      delete process.env.MONGODB_DB;
      
      // Reset to clear cached connection
      resetConnection();
      
      await expect(connectToDatabase()).rejects.toThrow(
        'Please define the MONGODB_DB environment variable'
      );
      
      // Restore
      process.env.MONGODB_DB = originalDb;
    });
  });

  describe('getDb', () => {
    it('should return the database instance', async () => {
      const db = await getDb();
      
      expect(db).toBeDefined();
      expect(db.databaseName).toBe(process.env.MONGODB_DB);
    });

    it('should return the same database instance on multiple calls', async () => {
      const db1 = await getDb();
      const db2 = await getDb();
      
      expect(db1).toBe(db2);
    });

    it('should be able to perform database operations', async () => {
      const db = await getDb();
      const testCollection = db.collection('test');
      
      // Insert a document
      const result = await testCollection.insertOne({ test: 'data' });
      expect(result.insertedId).toBeDefined();
      
      // Find the document
      const document = await testCollection.findOne({ test: 'data' });
      expect(document).toBeDefined();
      expect(document?.test).toBe('data');
      
      // Clean up
      await testCollection.deleteMany({});
    });
  });

  describe('closeConnection', () => {
    it('should close the database connection', async () => {
      // First establish a connection
      await connectToDatabase();
      
      // Close it
      await closeConnection();
      
      // After closing, the next call should create a new connection
      const newConnection = await connectToDatabase();
      expect(newConnection).toBeDefined();
    });

    it('should not throw error when no connection exists', async () => {
      resetConnection();
      await expect(closeConnection()).resolves.not.toThrow();
    });
  });

  describe('resetConnection', () => {
    it('should reset the cached connection', async () => {
      const connection1 = await connectToDatabase();
      
      resetConnection();
      
      const connection2 = await connectToDatabase();
      
      // After reset, should get a new connection
      expect(connection1.client).not.toBe(connection2.client);
    });

    it('should allow fresh connection after reset', async () => {
      await connectToDatabase();
      resetConnection();
      
      // Should be able to connect again
      const newConnection = await connectToDatabase();
      expect(newConnection).toBeDefined();
      expect(newConnection.client).toBeDefined();
      expect(newConnection.db).toBeDefined();
    });
  });
});
