import { Injectable, OnModuleInit } from '@nestjs/common';
import { Roles } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from "./prisma/prisma.service";

@Injectable()
export class AppService implements OnModuleInit {
  constructor(private prisma: PrismaService) { }

  async onModuleInit() {
    const superAdminEmail = "superadmin@example.com";

    const existingAdmin = await this.prisma.user.findUnique({
      where: { email: superAdminEmail },
    });

    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash("SuperAdmin123!", 10);
      await this.prisma.user.create({
        data: {
          email: superAdminEmail,
          firstName: "Super",
          lastName: "Admin",
          password: hashedPassword,
          role: Roles.SUPERADMIN,
          isActive: true,
        },
      });
      console.log("✅ Superadmin created:", superAdminEmail);
    }
  }
}
