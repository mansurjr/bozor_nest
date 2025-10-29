import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';

@Injectable()
export class StoresService {
  constructor(private readonly prisma: PrismaService) { }


  async create(dto: CreateStoreDto) {
    if (dto.sectionId) {
      const section = await this.prisma.section.findUnique({ where: { id: dto.sectionId } });
      if (!section) throw new NotFoundException('Section not found');
    }


    return this.prisma.store.create({ data: dto });
  }


  async findAll(
    search?: string,
    page: number = 1,
    limit: number = 10,
    opts?: { onlyFree?: boolean; withContracts?: boolean; asOf?: string },
  ) {
    const where: any = {};

    if (search) {
      where.OR = [
        { storeNumber: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    const asOf = opts?.asOf ? new Date(opts.asOf) : new Date();
    const includeContracts = Boolean(opts?.withContracts || opts?.onlyFree);

    const skip = (page - 1) * limit;

    const [total, stores] = await Promise.all([
      this.prisma.store.count({ where }),
      this.prisma.store.findMany({
        where,
        include: { Section: true, contracts: includeContracts },
        skip,
        take: limit,
        orderBy: { id: 'asc' },
      }),
    ]);

    const withOccupation = stores.map((s) => {
      let isOccupied = false;
      if (includeContracts && Array.isArray((s as any).contracts)) {
        isOccupied = (s as any).contracts.some((c: any) => {
          const active = c.isActive !== false;
          const startOk = !c.issueDate || new Date(c.issueDate) <= asOf;
          const endOk = !c.expiryDate || new Date(c.expiryDate) >= asOf;
          return active && startOk && endOk;
        });
      }
      return { ...s, isOccupied } as any;
    });

    const filtered = opts?.onlyFree ? withOccupation.filter((s: any) => !s.isOccupied) : withOccupation;

    return {
      total: opts?.onlyFree ? filtered.length : total,
      page,
      limit,
      data: filtered,
    };
  }


  async findOne(id: number) {
    const store = await this.prisma.store.findUnique({
      where: { id },
      include: { Section: true, contracts: true },
    });
    if (!store) throw new NotFoundException(`Store with id ${id} not found`);
    return store;
  }


  async update(id: number, dto: UpdateStoreDto) {
    await this.findOne(id);
    return this.prisma.store.update({
      where: { id },
      data: dto,
    });
  }


  async remove(id: number) {
    await this.findOne(id);
    return this.prisma.store.delete({ where: { id } });
  }
}
