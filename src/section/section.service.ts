import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { CreateSectionDto } from "./dto/create-section.dto";
import { UpdateSectionDto } from "./dto/update-section.dto";

@Injectable()
export class SectionService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSectionDto) {
    const assignee = await this.prisma.user.findUnique({
      where: { id: dto.assigneeId },
    });
    if (!assignee)
      throw new NotFoundException(`User with id ${dto.assigneeId} not found`);

    return this.prisma.section.create({
      data: {
        name: dto.name,
        description: dto.description,
        assignedCheckerId: dto.assigneeId,
      },
    });
  }

  async findAll() {
    return this.prisma.section.findMany({
      include: {
        assignedChecker: {
          select: { firstName: true, lastName: true },
        },
      },
    });
  }

  async findOne(id: number) {
    const section = await this.prisma.section.findUnique({
      where: { id },
      include: {
        assignedChecker: {
          select: { firstName: true, lastName: true },
        },
      },
    });
    if (!section)
      throw new NotFoundException(`Section with id ${id} not found`);
    return section;
  }

  async update(id: number, dto: UpdateSectionDto) {
    const data: any = {
      name: dto.name,
      description: dto.description,
    };
    if (dto.assigneeId) {
      const assignee = await this.prisma.user.findUnique({
        where: { id: dto.assigneeId },
      });
      if (!assignee)
        throw new NotFoundException(`User with id ${dto.assigneeId} not found`);
      data.assignedCheckerId = dto.assigneeId;
    }
    return this.prisma.section.update({ where: { id }, data });
  }

  async remove(id: number) {
    const section = await this.findOne(id);
    if (!section)
      throw new NotFoundException(`Section with id ${id} not found`);
    return this.prisma.section.delete({ where: { id } });
  }
}
