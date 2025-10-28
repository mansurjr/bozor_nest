import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';

@Injectable()
export class OwnersService {
  constructor(private readonly prisma: PrismaService) { }

  async create(dto: CreateOwnerDto, createdById: number) {
    return this.prisma.owner.create({
      data: { ...dto, createdById },
    });
  }

  async findAll(search?: string, page = 1, limit = 10) {
    const where: any = {};

    if (search) {
      where.OR = [
        { fullName: { contains: search, mode: 'insensitive' } },
        { tin: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (page - 1) * limit;

    const [owners, total] = await Promise.all([
      this.prisma.owner.findMany({
        where,
        include: { createdBy: true, contracts: { include: { store: true } } },
        skip,
        take: limit,
      }),
      this.prisma.owner.count({ where }),
    ]);

    return {
      data: owners,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: number) {
    const owner = await this.prisma.owner.findUnique({
      where: { id },
      include: { createdBy: true, contracts: { include: { store: true } } },
    });
    if (!owner) throw new NotFoundException(`Owner with id ${id} not found`);
    return owner;
  }

  async update(id: number, dto: UpdateOwnerDto) {
    await this.findOne(id);
    return this.prisma.owner.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.owner.delete({ where: { id } });
  }
}
