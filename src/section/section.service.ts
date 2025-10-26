import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';

@Injectable()
export class SectionService {
  constructor(private readonly prisma: PrismaService) { }

  async create(dto: CreateSectionDto) {
    const assignee = await this.prisma.user.findUnique({ where: { id: dto.assigneeId } });
    if (!assignee) throw new NotFoundException(`User with id ${dto.assigneeId} not found`);
    return this.prisma.section.create({ data: { assignedCheckerId: dto.assigneeId, ...dto } });
  }

  async findAll() {
    return this.prisma.section.findMany();
  }

  async findOne(id: number) {
    const section = await this.prisma.section.findUnique({ where: { id } });
    if (!section) throw new NotFoundException(`Section with id ${id} not found`);
    return section;
  }

  async update(id: number, dto: UpdateSectionDto) {
    const section = await this.findOne(id);
    if (!section) throw new NotFoundException(`Section with id ${id} not found`);
    return this.prisma.section.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const section = await this.findOne(id);
    if (!section) throw new NotFoundException(`Section with id ${id} not found`);
    return this.prisma.section.delete({ where: { id } });
  }
}
