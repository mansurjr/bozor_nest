import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStoreDto } from './dto/create-store.dto';
import { UpdateStoreDto } from './dto/update-store.dto';
import { Prisma } from '@prisma/client';

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
    const includeContracts = Boolean(opts?.withContracts);

    const skip = (page - 1) * limit;

    const storeInclude: Prisma.StoreInclude = {
      Section: true,
    };
    if (includeContracts) {
      storeInclude.contracts = {
        include: {
          owner: true,
        },
        orderBy: { issueDate: 'asc' },
      };
    }

    const activeContractWhere: Prisma.ContractWhereInput = {
      isActive: true,
      AND: [
        {
          OR: [
            { issueDate: null },
            { issueDate: { lte: asOf } },
          ],
        },
        {
          OR: [
            { expiryDate: null },
            { expiryDate: { gte: asOf } },
          ],
        },
      ],
    };

    const [total, stores, activeContracts] = await Promise.all([
      this.prisma.store.count({ where }),
      this.prisma.store.findMany({
        where,
        include: storeInclude,
        skip,
        take: limit,
        orderBy: { id: 'asc' },
      }),
      this.prisma.contract.findMany({
        where: activeContractWhere,
        select: { storeId: true },
      }),
    ]);

    const occupiedStoreIds = new Set<number>(
      activeContracts.map((c) => c.storeId),
    );

    const withOccupation = stores.map((s) => {
      const isOccupied = occupiedStoreIds.has(s.id);
      if (!includeContracts) {
        const { contracts, ...rest } = s as any;
        return { ...rest, isOccupied };
      }
      return { ...(s as any), isOccupied };
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
