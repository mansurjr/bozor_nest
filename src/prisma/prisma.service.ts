import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL + (process.env.DATABASE_URL?.includes('?') ? '&' : '?') + 'connection_limit=50&pool_timeout=30',
        },
      },
    });
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Prisma connected to the database with connection_limit=50');
    } catch (error) {
      this.logger.error('Failed to connect Prisma to the database', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.logger.log('Prisma disconnected from the database');
    } catch (error) {
      this.logger.error('Failed to disconnect Prisma', error);
    }
  }
}
