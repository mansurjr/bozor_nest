import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';
import { Roles } from '@prisma/client';

@Injectable()
export class UserService {
  constructor(private readonly prisma: PrismaService) { }


  async create(currentUserId: number, dto: CreateUserDto) {
    const currentUser = await this.prisma.user.findUnique({ where: { id: currentUserId } });
    if (!currentUser) throw new NotFoundException(`User with id ${currentUserId} not found`);

    const role = dto.role;

    if (role === Roles.SUPERADMIN) {
      throw new ForbiddenException("You can't create SUPERADMIN");
    }
    if (role === Roles.ADMIN && currentUser.role !== Roles.SUPERADMIN) {
      throw new ForbiddenException('Only SUPERADMIN can create ADMIN');
    }
    const hashedPassword = await bcrypt.hash(dto.password, 10);

    return this.prisma.user.create({
      data: { ...dto, password: hashedPassword, role },
    });
  }


  async findAll(currentUserId: number, search?: string, role?: Roles) {
    const where: any = { NOT: { id: currentUserId } };

    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
    }

    return this.prisma.user.findMany({ where });
  }


  async findOne(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException(`User with id ${id} not found`);
    return user;
  }


  async update(currentUserId: number, id: number, dto: UpdateUserDto) {
    const currentUser = await this.prisma.user.findUnique({ where: { id: currentUserId } });
    if (!currentUser) throw new NotFoundException(`User with id ${currentUserId} not found`);
    const user = await this.findOne(id);

    if (user.role === Roles.SUPERADMIN && dto.role !== undefined) {
      if (dto.role !== Roles.SUPERADMIN) {
        throw new ForbiddenException('Cannot change SUPERADMIN role');
      }
    }


    if (dto.role && dto.role !== user.role && currentUser.role !== Roles.SUPERADMIN) {
      throw new ForbiddenException('Only SUPERADMIN can change roles');
    }


    if (currentUser.role === Roles.ADMIN && [Roles.ADMIN, Roles.SUPERADMIN as Roles].includes(user.role)) {
      throw new ForbiddenException('ADMIN cannot update ADMIN or SUPERADMIN');
    }


    if (dto.password) {
      dto.password = await bcrypt.hash(dto.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data: dto,
    });
  }


  async remove(currentUserId: number, id: number) {
    const currentUser = await this.prisma.user.findUnique({ where: { id: currentUserId } });
    if (!currentUser) throw new NotFoundException(`User with id ${currentUserId} not found`);

    const user = await this.findOne(id);


    if (user.role === Roles.SUPERADMIN) {
      throw new ForbiddenException('Cannot delete SUPERADMIN');
    }


    if (currentUser.role === Roles.ADMIN && user.role !== Roles.CHECKER) {
      throw new ForbiddenException('ADMIN can delete CHECKER only');
    }


    if (![Roles.ADMIN, Roles.SUPERADMIN as Roles].includes(currentUser.role)) {
      throw new ForbiddenException('You do not have permission to delete users');
    }

    return this.prisma.user.delete({ where: { id } });
  }
}
