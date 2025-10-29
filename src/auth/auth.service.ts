import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthDto } from '../users/dto/signIn-user.dto';
import * as bcrypt from 'bcrypt';
import { JwtService } from '../jwt/jwt.service';
import { Response } from 'express';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwt: JwtService) { }

  async signIn(dto: AuthDto, res: Response) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !await bcrypt.compare(dto.password, user.password)) {
      throw new ForbiddenException('Email or password incorrect');
    }

    if (!user.isActive) {
      throw new ForbiddenException('User is not active');
    }

    const tokens = await this.jwt.generateTokens(user);

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return { success: true, accessToken: tokens.accessToken };
  }

  async refresh(res: Response, refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException('No refresh token');

    const payload = this.jwt.verifyRefreshToken(refreshToken);
    const user = await this.prisma.user.findUnique({ where: { id: payload.id } });

    if (!user) throw new UnauthorizedException('User not found');

    const tokens = await this.jwt.generateTokens(user);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return { accessToken: tokens.accessToken };
  }
  async me(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");

    const {
      password,
      isActive,
      role,
      ...safeUser
    } = user;
    return safeUser;
  }
  async signOut(res: Response, refreshToken: string) {
    if (!refreshToken) throw new UnauthorizedException("Not logged in");

    const refreshPayload = this.jwt.decodeToken(refreshToken);
    if (!refreshPayload?.id) throw new UnauthorizedException("Invalid token");

    const userId = refreshPayload.id;

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });

    res.clearCookie("refreshToken", {
      httpOnly: true,
    });

    return { message: "Signed out successfully" };
  }
}
