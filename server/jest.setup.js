// Set up environment variables for testing
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';

// Mock Prisma globally
jest.mock('./prisma-client', () => {
  const mockMethods = {
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  return {
    workspace: {
      ...mockMethods,
      findFirst: jest.fn().mockImplementation((args) => {
        return Promise.resolve(null);
      }),
    },
    userWorkspace: {
      ...mockMethods,
      findFirst: jest.fn().mockImplementation((args) => {
        return Promise.resolve(null);
      }),
    },
    user: {
      ...mockMethods,
      findFirst: jest.fn().mockImplementation((args) => {
        return Promise.resolve(null);
      }),
    },
    task: {
      ...mockMethods,
      findFirst: jest.fn().mockImplementation((args) => {
        return Promise.resolve(null);
      }),
    },
    message: {
      ...mockMethods,
      findFirst: jest.fn().mockImplementation((args) => {
        return Promise.resolve(null);
      }),
    },
    $transaction: jest.fn().mockImplementation((callback) => {
      if (typeof callback === 'function') {
        return callback(mockPrisma);
      }
      return Promise.resolve(null);
    }),
  };
});
