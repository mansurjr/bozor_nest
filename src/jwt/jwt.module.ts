import { Module } from "@nestjs/common";
import { JwtModule as NestJwtModule } from "@nestjs/jwt";
import type { JwtSignOptions } from "@nestjs/jwt";
import type { StringValue } from "ms";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { JwtService } from "./jwt.service";

@Module({
  imports: [
    ConfigModule,
    NestJwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => {
        const DEFAULT_ACCESS_EXPIRES: StringValue = "15m";
        const normalizeExpiresIn = (
          value: string | undefined,
          fallback: StringValue,
        ): JwtSignOptions["expiresIn"] => {
          const trimmed = value?.trim();
          if (trimmed && /^\d+$/.test(trimmed)) {
            return Number(trimmed);
          }
          return (trimmed ?? fallback) as StringValue;
        };
        const expiresIn = normalizeExpiresIn(
          configService.get<string>("ACCESS_TIME"),
          DEFAULT_ACCESS_EXPIRES,
        );
        return {
          secret: configService.get<string>("ACCESS_SECRET"),
          signOptions: { expiresIn },
        };
      },
    }),
  ],
  providers: [JwtService],
  exports: [JwtService],
})
export class JwtModule { }
