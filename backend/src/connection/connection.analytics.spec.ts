import { ConnectionService } from './connection.service';

describe('ConnectionService analytics calculations', () => {
  const userId = 'user-1';

  const prismaMock = {
    connection: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    user: {
      count: jest.fn(),
    },
  } as any;

  const notificationServiceMock = {
    createConnectionRequestNotification: jest.fn(),
    createConnectionAcceptedNotification: jest.fn(),
  } as any;

  const gamificationServiceMock = {
    awardPoints: jest.fn(),
    awardForEvent: jest.fn(),
  } as any;

  const loggerMock = {
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  } as any;

  let service: ConnectionService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConnectionService(
      prismaMock,
      notificationServiceMock,
      gamificationServiceMock,
      loggerMock,
    );
  });

  it('calculates growth analytics for selected period', async () => {
    prismaMock.connection.count
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(10);

    prismaMock.connection.findMany.mockResolvedValueOnce(
      Array.from({ length: 12 }).map((_, index) => ({
        createdAt: new Date(Date.now() - index * 24 * 60 * 60 * 1000),
      })),
    );

    const result = await service.getConnectionGrowthAnalytics(userId, '30d');

    expect(result.userId).toBe(userId);
    expect(result.period).toBe('30d');
    expect(result.metrics.totalConnections).toBe(50);
    expect(result.metrics.newConnections).toBe(12);
    expect(result.metrics.previousPeriodConnections).toBe(10);
    expect(result.metrics.growthRate).toBe(20);
    expect(result.data.length).toBe(30);
  });

  it('calculates distribution analytics by role, graduation year, and location', async () => {
    prismaMock.connection.findMany.mockResolvedValueOnce([
      {
        requesterId: userId,
        recipientId: 'u2',
        requester: {
          role: 'ADMIN',
          graduationYear: null,
          profile: { year: null, location: 'Bhubaneswar' },
        },
        recipient: {
          role: 'ALUM',
          graduationYear: 2022,
          profile: { year: '2022', location: 'Delhi' },
        },
      },
      {
        requesterId: 'u3',
        recipientId: userId,
        requester: {
          role: 'STUDENT',
          graduationYear: null,
          profile: { year: '2026', location: 'Delhi' },
        },
        recipient: {
          role: 'ADMIN',
          graduationYear: null,
          profile: { year: null, location: 'Bhubaneswar' },
        },
      },
    ]);

    const result = await service.getConnectionDistributionAnalytics(userId);

    expect(result.totalConnections).toBe(2);
    expect(result.byRole.find((item) => item.role === 'ALUM')?.count).toBe(1);
    expect(result.byRole.find((item) => item.role === 'STUDENT')?.count).toBe(1);
    expect(result.byGraduationYear.find((item) => item.year === '2022')?.count).toBe(1);
    expect(result.byGraduationYear.find((item) => item.year === '2026')?.count).toBe(1);
    expect(result.byLocation.find((item) => item.location === 'Delhi')?.count).toBe(2);
  });

  it('calculates network strength score and key metrics', async () => {
    jest
      .spyOn(service, 'getConnectionDistributionAnalytics')
      .mockResolvedValueOnce({
        userId,
        totalConnections: 40,
        byRole: [
          { role: 'STUDENT', count: 20, percentage: 50 },
          { role: 'ALUM', count: 20, percentage: 50 },
        ],
        byGraduationYear: [
          { year: '2022', count: 10 },
          { year: '2025', count: 20 },
          { year: '2026', count: 10 },
        ],
        byLocation: [
          { location: 'Delhi', count: 20 },
          { location: 'Bhubaneswar', count: 20 },
        ],
      });

    prismaMock.user.count.mockResolvedValueOnce(200);
    prismaMock.connection.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(8);
    prismaMock.connection.findMany.mockResolvedValueOnce([
      { createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
      { createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000) },
    ]);

    const result = await service.getNetworkStrengthScore(userId);

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.metrics.totalConnections).toBe(40);
    expect(result.metrics.averageResponseTimeHours).toBeGreaterThan(0);
    expect(typeof result.interpretation).toBe('string');
  });
});
