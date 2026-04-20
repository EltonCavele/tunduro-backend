import { Injectable } from '@nestjs/common';
import { DatabaseService } from 'src/common/database/services/database.service';

import { AnalyticsQueryDto } from '../dtos/request/analytics.request';
import { DateRangeQueryDto } from '../dtos/request/report.request';
import { AnalyticsResponseDto } from '../dtos/response/analytics.response';
import {
  GeneralReportResponseDto,
  PaymentReportResponseDto,
  ScheduleReportResponseDto,
} from '../dtos/response/report.response';

@Injectable()
export class ReportsService {
  constructor(private readonly db: DatabaseService) {}

  async getAnalytics(query: AnalyticsQueryDto): Promise<AnalyticsResponseDto> {
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(new Date().getFullYear(), 0, 1);
    const endDate = query.endDate
      ? new Date(query.endDate + 'T23:59:59')
      : new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);

    const [totalBookings, bookingsInRange, totalCourts, activeCourts, totalUsers, payments, completedPayments] =
      await Promise.all([
        this.db.booking.count(),
        this.db.booking.count({
          where: { startAt: { gte: startDate, lte: endDate } },
        }),
        this.db.court.count({ where: { deletedAt: null } }),
        this.db.court.count({ where: { deletedAt: null, isActive: true } }),
        this.db.user.count({ where: { deletedAt: null } }),
        this.db.paymentTransaction.findMany({
          where: {
            processedAt: { gte: startDate, lte: endDate },
          },
          orderBy: { processedAt: 'asc' },
        }),
        this.db.paymentTransaction.findMany({
          where: {
            status: 'COMPLETED' as any,
            processedAt: { gte: startDate, lte: endDate },
          },
          orderBy: { processedAt: 'asc' },
        }),
      ]);

    const confirmedBookings = await this.db.booking.count({
      where: {
        status: 'CONFIRMED' as any,
        startAt: { gte: startDate, lte: endDate },
      },
    });

    const cancelledBookings = await this.db.booking.count({
      where: {
        status: 'CANCELLED' as any,
        startAt: { gte: startDate, lte: endDate },
      },
    });

    const totalPayments = completedPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0
    );

    const chartDataMap = new Map<string, number>();
    for (const payment of payments) {
      if (payment.processedAt) {
        const dateKey = payment.processedAt.toISOString().split('T')[0];
        chartDataMap.set(
          dateKey,
          (chartDataMap.get(dateKey) || 0) + Number(payment.amount)
        );
      }
    }

    const chartData = Array.from(chartDataMap.entries())
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      bookings: {
        total: totalBookings,
        confirmed: confirmedBookings,
        cancelled: cancelledBookings,
      },
      courts: {
        total: totalCourts,
        active: activeCourts,
      },
      users: {
        total: totalUsers,
      },
      payments: {
        total: Math.round(totalPayments * 100) / 100,
        count: completedPayments.length,
        chartData,
      },
    };
  }

  async getGeneralReport(query: DateRangeQueryDto): Promise<GeneralReportResponseDto> {
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(new Date().getFullYear(), 0, 1);
    const endDate = query.endDate
      ? new Date(query.endDate)
      : new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);

    const [totalUsers, newUsers, totalBookings, revenueResult, occupancyResult, cancellations] =
      await Promise.all([
        this.db.user.count({
          where: { deletedAt: null },
        }),
        this.db.user.count({
          where: {
            createdAt: { gte: startDate, lte: endDate },
            deletedAt: null,
          },
        }),
        this.db.booking.count({
          where: { createdAt: { gte: startDate, lte: endDate } },
        }),
        this.db.paymentTransaction.aggregate({
          where: {
            status: 'COMPLETED' as any,
            processedAt: { gte: startDate, lte: endDate },
          },
          _sum: { amount: true },
        }),
        this.db.booking.groupBy({
          by: ['courtId'],
          where: { startAt: { gte: startDate, lte: endDate } },
          _count: true,
        }),
        this.db.booking.count({
          where: {
            status: 'CANCELLED' as any,
            cancelledAt: { gte: startDate, lte: endDate },
          },
        }),
      ]);

    const totalCourtSlots = await this.db.court.count({
      where: { isActive: true, deletedAt: null },
    });
    const bookingDays = Math.max(
      1,
      Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      )
    );
    const totalSlots = totalCourtSlots * bookingDays * 2;
    const totalBookedSlots = occupancyResult.reduce((sum, b) => sum + b._count, 0);
    const averageOccupancyRate = totalSlots > 0 ? (totalBookedSlots / totalSlots) * 100 : 0;

    const totalRevenue = Number(revenueResult._sum.amount || 0);

    return {
      totalUsers,
      newUsers,
      totalBookings,
      totalRevenue,
      averageOccupancyRate: Math.round(averageOccupancyRate * 100) / 100,
      totalCancellations: cancellations,
    };
  }

  async getScheduleReport(
    query: DateRangeQueryDto
  ): Promise<ScheduleReportResponseDto> {
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(new Date().getFullYear(), 0, 1);
    const endDate = query.endDate
      ? new Date(query.endDate)
      : new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);

    const [pending, confirmed, courtCounts, userCounts, noShows, totalBookings] =
      await Promise.all([
        this.db.booking.count({
          where: {
            status: 'PENDING' as any,
            startAt: { gte: startDate, lte: endDate },
          },
        }),
        this.db.booking.count({
          where: {
            status: 'CONFIRMED' as any,
            startAt: { gte: startDate, lte: endDate },
          },
        }),
        this.db.booking.groupBy({
          by: ['courtId'],
          where: { startAt: { gte: startDate, lte: endDate } },
          _count: true,
          orderBy: { _count: { courtId: 'desc' } },
          take: 1,
        }),
        this.db.booking.groupBy({
          by: ['organizerId'],
          where: { startAt: { gte: startDate, lte: endDate } },
          _count: true,
          orderBy: { _count: { organizerId: 'desc' } },
          take: 1,
        }),
        this.db.booking.count({
          where: {
            status: 'NO_SHOW' as any,
            startAt: { gte: startDate, lte: endDate },
          },
        }),
        this.db.booking.count({
          where: { startAt: { gte: startDate, lte: endDate } },
        }),
      ]);

    const cancellationCount = await this.db.booking.count({
      where: {
        status: 'CANCELLED' as any,
        startAt: { gte: startDate, lte: endDate },
      },
    });
    const cancellationRate =
      totalBookings > 0 ? (cancellationCount / totalBookings) * 100 : 0;

    let mostPopularCourt = null;
    if (courtCounts.length > 0) {
      const court = await this.db.court.findUnique({
        where: { id: courtCounts[0].courtId },
      });
      mostPopularCourt = {
        id: courtCounts[0].courtId,
        name: court?.name || 'Unknown',
        count: courtCounts[0]._count,
      };
    }

    let mostActiveUser = null;
    if (userCounts.length > 0) {
      const user = await this.db.user.findUnique({
        where: { id: userCounts[0].organizerId },
      });
      mostActiveUser = {
        id: userCounts[0].organizerId,
        name: `${user?.firstName || ''} ${user?.lastName || ''}`.trim() || 'Unknown',
        count: userCounts[0]._count,
      };
    }

    return {
      pendingBookings: pending,
      confirmedBookings: confirmed,
      mostPopularCourt,
      mostActiveUser,
      cancellationRate: Math.round(cancellationRate * 100) / 100,
      noShows,
    };
  }

  async getPaymentReport(
    query: DateRangeQueryDto
  ): Promise<PaymentReportResponseDto> {
    const startDate = query.startDate
      ? new Date(query.startDate)
      : new Date(new Date().getFullYear(), 0, 1);
    const endDate = query.endDate
      ? new Date(query.endDate)
      : new Date(new Date().getFullYear(), 11, 31, 23, 59, 59);

    const [completedPayments, courtRevenues, refunds, totalCompleted] =
      await Promise.all([
        this.db.paymentTransaction.findMany({
          where: {
            status: 'COMPLETED' as any,
            processedAt: { gte: startDate, lte: endDate },
          },
          include: { booking: true },
        }),
        this.db.booking.groupBy({
          by: ['courtId'],
          where: {
            status: { in: ['CONFIRMED', 'COMPLETED'] as any },
            createdAt: { gte: startDate, lte: endDate },
          },
          _sum: { totalPrice: true },
        }),
        this.db.paymentTransaction.count({
          where: {
            status: 'REFUNDED' as any,
            processedAt: { gte: startDate, lte: endDate },
          },
        }),
        this.db.paymentTransaction.count({
          where: {
            status: 'COMPLETED' as any,
            processedAt: { gte: startDate, lte: endDate },
          },
        }),
      ]);

    const monthlyMap = new Map<string, number>();
    for (const payment of completedPayments) {
      if (payment.processedAt) {
        const monthKey = `${payment.processedAt.getFullYear()}-${String(
          payment.processedAt.getMonth() + 1
        ).padStart(2, '0')}`;
        monthlyMap.set(
          monthKey,
          (monthlyMap.get(monthKey) || 0) + Number(payment.amount)
        );
      }
    }
    const monthlyRevenue = Array.from(monthlyMap.entries())
      .map(([month, revenue]) => ({ month, revenue }))
      .sort((a, b) => a.month.localeCompare(b.month));

    const courtRevenueList: {
      courtId: string;
      courtName: string;
      revenue: number;
    }[] = [];
    for (const cr of courtRevenues) {
      const court = await this.db.court.findUnique({
        where: { id: cr.courtId },
      });
      courtRevenueList.push({
        courtId: cr.courtId,
        courtName: court?.name || 'Unknown',
        revenue: Number(cr._sum.totalPrice || 0),
      });
    }
    courtRevenueList.sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = completedPayments.reduce(
      (sum, p) => sum + Number(p.amount),
      0
    );
    const averageTicket = totalCompleted > 0 ? totalRevenue / totalCompleted : 0;

    return {
      monthlyRevenue,
      courtRevenues: courtRevenueList,
      totalRefunds: refunds,
      averageTicket: Math.round(averageTicket * 100) / 100,
    };
  }
}
