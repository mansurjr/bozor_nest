import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOwnerDto } from './dto/create-owner.dto';
import { UpdateOwnerDto } from './dto/update-owner.dto';

@Injectable()
export class OwnersService {
  constructor(private readonly prisma: PrismaService) { }

  async create(dto: CreateOwnerDto, createdById: number) {
    const existingOwner = await this.prisma.owner.findUnique({
      where: { tin: dto.tin },
    })
    if (existingOwner) {
      throw new ConflictException('Owner with this TIN already exists');
    }
    return this.prisma.owner.create({
      data: { ...dto, createdById },
    });
  }

  async findAll(search?: string, page = 1, limit = 10, isActive?: boolean) {
    const where: any = {};
    if (isActive !== undefined) {
      where.isActive = isActive;
    }

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
        orderBy: { createdAt: 'desc' },
        where,
        skip,
        take: limit,
        select: {
          id: true,
          fullName: true,
          address: true,
          tin: true,
          phoneNumber: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          archivedAt: true,

          createdBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },

          archivedBy: {
            select: {
              firstName: true,
              lastName: true,
            },
          },

          contracts: {
            select: {
              id: true,
              certificateNumber: true,
              expiryDate: true,
              isActive: true,
              shopMonthlyFee: true,

              createdBy: {
                select: {
                  firstName: true,
                  lastName: true,
                },
              },

              store: {
                select: {
                  id: true,
                  storeNumber: true,
                  area: true,
                  sectionId: true,
                },
              },
            },
          },
        },
      }, ),

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
      include: { 
        createdBy: true, 
        archivedBy: true,
        contracts: { include: { store: true } } 
      },
    });
    if (!owner) throw new NotFoundException(`Owner with id ${id} not found`);
    return owner;
  }

  async update(id: number, dto: UpdateOwnerDto, userId?: number) {
    const owner = await this.findOne(id);

    return this.prisma.$transaction(async (tx) => {
      const data: any = { ...dto };
      
      if (dto.isActive === false && owner.isActive === true) {
        data.archivedById = userId;
        data.archivedAt = new Date();
      } else if (dto.isActive === true && owner.isActive === false) {
        data.archivedById = null;
        data.archivedAt = null;
      }

      if (dto.isActive === false) {
        await tx.contract.updateMany({
          where: { ownerId: id },
          data: { 
            isActive: false,
            archivedById: userId,
            archivedAt: new Date(),
          },
        });
      }

      return tx.owner.update({
        where: { id },
        data,
      });
    });
  }

  async remove(id: number, userId?: number) {
    const owner = await this.findOne(id);
    return this.prisma.$transaction(async (tx) => {
      // Deactivate all associated contracts
      await tx.contract.updateMany({
        where: { ownerId: id },
        data: { 
          isActive: false,
          archivedById: userId,
          archivedAt: new Date(),
        },
      });

      // Deactivate the owner
      return tx.owner.update({
        where: { id },
        data: { 
          isActive: false,
          archivedById: userId,
          archivedAt: new Date(),
        },
      });
    });
  }
}
