import { Test, TestingModule } from '@nestjs/testing';
import { MentorshipService } from './mentorship.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { Role } from '@prisma/client';

describe('MentorshipService analytics', () => {
  let service: MentorshipService;

  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
    mentorship: {
      findMany: jest.fn(),
    },
    meeting: {
      findMany: jest.fn(),
    },
    feedback: {
      findMany: jest.fn(),
    },
  } as any;

  const mockNotificationService = {
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MentorshipService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: NotificationService,
          useValue: mockNotificationService,
        },
      ],
    }).compile();

    service = module.get<MentorshipService>(MentorshipService);
    jest.clearAllMocks();
  });

  it('should return zeroed summary metrics when no mentorship data exists', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', role: Role.STUDENT });
    mockPrisma.mentorship.findMany.mockResolvedValue([]);
    mockPrisma.meeting.findMany.mockResolvedValue([]);
    mockPrisma.feedback.findMany.mockResolvedValue([]);

    const result = await service.getMentorshipSummaryAnalytics('u1', Role.ADMIN, 'admin-1');

    expect(result.summary.totalMentorships).toBe(0);
    expect(result.summary.totalMeetings).toBe(0);
    expect(result.summary.completionRate).toBe(0);
    expect(result.summary.mentorshipHoursLogged).toBe(0);
    expect(result.summary.completedGoals).toBe(0);
  });

  it('should return empty recent sessions and milestone counts for impact with no data', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', role: Role.STUDENT });
    mockPrisma.meeting.findMany.mockResolvedValue([]);
    mockPrisma.mentorship.findMany.mockResolvedValue([]);

    const result = await service.getMentorshipImpactAnalytics('u1', Role.ADMIN, 'admin-1');

    expect(result.impact.recentSessions).toHaveLength(0);
    expect(result.impact.milestonesAchieved).toBe(0);
    expect(result.impact.totalMilestones).toBe(0);
    expect(result.impact.impactScore).toBe(0);
  });
});
