import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { beforeAll, afterAll, afterEach } from 'vitest';

let mongoServer: MongoMemoryReplSet;

// Start MongoDB Memory Server before all tests
beforeAll(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = mongoServer.getUri();
  
  // Set environment variables for testing
  process.env.MONGODB_URI = uri;
  process.env.MONGODB_DB = 'test_db';
}, 60000); // 60 second timeout for starting MongoDB

// Clean up after all tests
afterAll(async () => {
  if (mongoServer) {
    await mongoServer.stop();
  }
}, 30000);

// Reset connection state after each test
afterEach(async () => {
  const { resetConnection, closeConnection } = await import('./lib/mongodb');
  await closeConnection();
  resetConnection();
});
