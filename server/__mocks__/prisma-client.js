// Mock Prisma Client
const mockPrisma = {
  workspace: {
    create: jest.fn(),
    findUnique: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
  },
  userWorkspace: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    delete: jest.fn(),
  },
  user: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
  },
  task: {
    findMany: jest.fn(),
    update: jest.fn(),
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    create: jest.fn(),
  },
  message: {
    findMany: jest.fn(),
    create: jest.fn(),
    findFirst: jest.fn(),
  },
  $transaction: jest.fn().mockImplementation((callback) => {
    if (typeof callback === 'function') {
      return callback(mockPrisma);
    }
    return Promise.resolve(null);
  }),
};

// Initialize default mock implementations
Object.values(mockPrisma).forEach(model => {
  if (model.findFirst) {
    model.findFirst.mockResolvedValue(null);
  }
  if (model.findUnique) {
    model.findUnique.mockResolvedValue(null);
  }
  if (model.findMany) {
    model.findMany.mockResolvedValue([]);
  }
  if (model.create) {
    model.create.mockImplementation(data => Promise.resolve(data));
  }
  if (model.update) {
    model.update.mockImplementation(data => Promise.resolve(data));
  }
  if (model.delete) {
    model.delete.mockResolvedValue(null);
  }
});

module.exports = mockPrisma;
