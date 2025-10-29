import { Module } from "@nestjs/common";
import { PassportModule } from "@nestjs/passport";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtModule } from "../jwt/jwt.module";
import { JwtStrategy } from "../common/strategies/access-strategy";
import { RefreshJwtStrategy } from "../common/strategies/refresh-strategy";

@Module({
  imports: [
    JwtModule,
    PassportModule.register({ defaultStrategy: "jwt", session: false }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RefreshJwtStrategy],
  exports: [AuthService, PassportModule],
})
export class AuthModule {}
