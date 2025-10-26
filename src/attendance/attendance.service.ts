import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAttendanceDto } from './dto/create-attendance.dto';
import { UpdateAttendanceDto } from './dto/update-attendance.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateAttendanceDto) {
    // Validate Stall exists
    const stall = await this.prisma.stall.findUnique({ where: { id: dto.stallId } });
    if (!stall) throw new NotFoundException(`Stall with id ${dto.stallId} not found`);

    return this.prisma.attendance.create({
      data: {
        ...dto,
        date: new Date(dto.date),
        amount: dto.amount ? new Prisma.Decimal(dto.amount) : new Prisma.Decimal(0),
      },
      include: { Stall: true, transaction: true },
    });
  }

  async findAll(page = 1, limit = 10) {
    const total = await this.prisma.attendance.count();
    const data = await this.prisma.attendance.findMany({
      include: { Stall: true, transaction: true },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { total, page, limit, data };
  }

  async findOne(id: number) {
    const attendance = await this.prisma.attendance.findUnique({
      where: { id },
      include: { Stall: true, transaction: true },
    });
    if (!attendance) throw new NotFoundException(`Attendance with id ${id} not found`);
    return attendance;
  }

  async update(id: number, dto: UpdateAttendanceDto) {
    await this.findOne(id);

    const data: any = { ...dto };
    if (dto.amount !== undefined) data.amount = new Prisma.Decimal(dto.amount);
    if (dto.date) data.date = new Date(dto.date);

    return this.prisma.attendance.update({
      where: { id },
      data,
      include: { Stall: true, transaction: true },
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.attendance.delete({ where: { id } });
  }
}
