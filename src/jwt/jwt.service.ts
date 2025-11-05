import { Injectable, UnauthorizedException, InternalServerErrorException } from "@nestjs/common";
import { JwtService as NestJwtService } from "@nestjs/jwt";
import type { JwtSignOptions } from "@nestjs/jwt";
import type { StringValue } from "ms";
import { ConfigService } from "@nestjs/config";
import { Roles, User } from "@prisma/client";

export interface JwtPayload {
  id: number;
  email: string;
  role: Roles;
  isActive: boolean;
}

export interface JwtPayloadWithRefreshToken extends JwtPayload {
  refreshToken: string;
}

@Injectable()
export class JwtService {
  constructor(
    private readonly jwt: NestJwtService,
    private readonly configService: ConfigService
  ) { }

  /**
   * Generate access and refresh tokens for a user
   */
  async generateTokens(user: User): Promise<{ accessToken: string; refreshToken: string }> {
    if (!user.email || user.isActive === undefined) {
      throw new InternalServerErrorException("User data is incomplete");
    }

    const payload: JwtPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };

    const accessSecret = this.configService.get<string>("ACCESS_SECRET");
    const refreshSecret = this.configService.get<string>("REFRESH_SECRET");

    if (!accessSecret || !refreshSecret) {
      throw new InternalServerErrorException("JWT secrets are not configured");
    }

    const DEFAULT_ACCESS_EXPIRES: StringValue = "15m";
    const DEFAULT_REFRESH_EXPIRES: StringValue = "7d";

    const normalizeExpiresIn = (
      raw: string | undefined,
      fallback: StringValue,
    ): JwtSignOptions["expiresIn"] => {
      const value = raw?.trim();
      if (value && /^\d+$/.test(value)) {
        return Number(value);
      }
      return (value ?? fallback) as StringValue;
    };
    const accessExpiresIn = normalizeExpiresIn(
      this.configService.get<string>("ACCESS_TIME"),
      DEFAULT_ACCESS_EXPIRES,
    );
    const refreshExpiresIn = normalizeExpiresIn(
      this.configService.get<string>("REFRESH_TIME"),
      DEFAULT_REFRESH_EXPIRES,
    );

    const [accessToken, refreshToken] = await Promise.all([
      this.jwt.signAsync(payload, { secret: accessSecret, expiresIn: accessExpiresIn }),
      this.jwt.signAsync(payload, { secret: refreshSecret, expiresIn: refreshExpiresIn }),
    ]);

    return { accessToken, refreshToken };
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): JwtPayload {
    try {
      const secret = this.configService.get<string>("ACCESS_SECRET");
      if (!secret) throw new InternalServerErrorException("ACCESS_SECRET not configured");

      return this.jwt.verify<JwtPayload>(token, { secret });
    } catch (err) {
      throw new UnauthorizedException("Invalid access token");
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token: string): JwtPayload {
    try {
      const secret = this.configService.get<string>("REFRESH_SECRET");
      if (!secret) throw new InternalServerErrorException("REFRESH_SECRET not configured");

      return this.jwt.verify<JwtPayload>(token, { secret });
    } catch (err) {
      throw new UnauthorizedException("Invalid refresh token");
    }
  }

  /**
   * Decode token without verifying
   */
  decodeToken(token: string): JwtPayload | null {
    const decoded = this.jwt.decode(token);
    return decoded as JwtPayload | null;
  }
}
