import { Controller, Post, Body, Res, Get, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthDto } from '../users/dto/signIn-user.dto';
import type { Response, Request } from 'express';
import { ApiTags, ApiOperation, ApiBody, ApiResponse, ApiCookieAuth, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/guards/accessToken.guard';
import { GetCurrentUser } from '../common/decorators/getCurrentUserid';
import { JwtRefresh } from '../common/guards/guards/refreshToken.guard';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('signin')
  @ApiOperation({ summary: 'Sign in user and get access & refresh tokens' })
  @ApiBody({ type: AuthDto })
  @ApiResponse({ status: 200, description: 'Successful login, access token returned.' })
  @ApiResponse({ status: 403, description: 'Invalid email or password.' })
  async signIn(@Body() dto: AuthDto, @Res({ passthrough: true }) res: Response) {
    return this.authService.signIn(dto, res);
  }

  @UseGuards(JwtRefresh)
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token using refresh token cookie' })
  @ApiResponse({ status: 200, description: 'New access token issued.' })
  @ApiResponse({ status: 401, description: 'Unauthorized or invalid refresh token.' })
  @ApiCookieAuth('refreshToken')
  async refresh(@Res({ passthrough: true }) res: Response, @GetCurrentUser("refreshToken") refreshToken: string) {
    return this.authService.refresh(res, refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get currently logged-in user info' })
  @ApiResponse({ status: 200, description: 'Returns current user info.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  @ApiBearerAuth()
  async me(@Req() req: Request, @GetCurrentUser("id") id: number) {
    return this.authService.me(id);
  }

  @UseGuards(JwtAuthGuard, JwtRefresh)
  @Post('signout')
  @ApiOperation({ summary: 'Sign out user and clear refresh token cookie' })
  @ApiResponse({ status: 200, description: 'Signed out successfully.' })
  @ApiResponse({ status: 401, description: 'Not logged in.' })
  @ApiCookieAuth('refreshToken')
  @ApiBearerAuth()
  async signOut(@Res({ passthrough: true }) res: Response, @GetCurrentUser("refreshToken") refreshToken: string) {
    return this.authService.signOut(res, refreshToken);
  }
}
