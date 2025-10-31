import { Module } from "@nestjs/common";
import { AppService } from "./app.service";
import { PrismaModule } from "./prisma/prisma.module";
import { UsersModule } from "./users/users.module";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { SalesTypeModule } from "./sales-type/sales-type.module";
import { SectionModule } from "./section/section.module";
import { OwnersModule } from "./owners/owners.module";
import { StoreModule } from "./store/store.module";
import { StallModule } from "./stall/stall.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { ContractModule } from "./contract/contract.module";
import { TransactionModule } from "./transaction/transaction.module";
import { ClickWebhookModule } from "./click_webhook/click_webhook.module";
import { StatiscticsModule } from "./statisctics/statisctics.module";
import { PublicModule } from './public/public.module';
import { PaymeModule } from './payme/payme.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: ".env",
      isGlobal: true,
    }),
    PrismaModule,
    UsersModule,
    AuthModule,
    SalesTypeModule,
    SectionModule,
    OwnersModule,
    StoreModule,
    StallModule,
    AttendanceModule,
    ContractModule,
    TransactionModule,
    ClickWebhookModule,
    StatiscticsModule,
    PublicModule,
    PaymeModule,
  ],
  providers: [AppService],
  exports: [ConfigModule],
})
export class AppModule {}
