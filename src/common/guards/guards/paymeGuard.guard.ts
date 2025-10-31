import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { PaymeError } from '../../../payme/constants/payme-error';

// ✅ Payme so'rovlarini tekshiruvchi guard
@Injectable()
export class PaymeBasicAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const token = this.extractTokenFromHeader(request);
    const transId = request?.body?.id ?? null;

    // ✅ Token mavjud emas — javob 200 qaytariladi
    if (!token) {
      this.sendError(response, transId, PaymeError.InvalidAuthorization);
      return false;
    }

    try {
      const decoded = this.decodeToken(token);
      if (!decoded) {
        this.sendError(response, transId, PaymeError.InvalidAuthorization);
        return false;
      }

      const [username, password] = decoded.split(':');

      // ✅ Configdan login va parolni tekshiramiz
      const validUsername = this.configService.get<string>('PAYMENT_MERCHANT_ID');
      const validPassword = this.configService.get<string>('PAYME_TEST_PASS');

      const isValid =
        username === validUsername && password === validPassword;

      if (!isValid) {
        this.sendError(response, transId, PaymeError.InvalidAuthorization);
        return false;
      }

      // ✅ Agar token to'g'ri bo'lsa — davom etadi
      return true;
    } catch {
      this.sendError(response, transId, PaymeError.InvalidAuthorization);
      return false;
    }
  }

  // 🔹 "Authorization" headerdan tokenni ajratish
  private extractTokenFromHeader(request: Request): string | undefined {
    const authHeader = request.headers['authorization'];
    if (!authHeader) return undefined;

    const [type, token] = authHeader.split(' ');
    return type === 'Basic' ? token : undefined;
  }

  // 🔹 Base64 decode qilish (Node.js uchun)
  private decodeToken(token: string): string | undefined {
    try {
      return Buffer.from(token, 'base64').toString('utf8');
    } catch {
      return undefined;
    }
  }

  // 🔹 Payme standartidagi error javobi
  private sendError(response: Response, id: any, error: any) {
    response.status(200).json({
      id,
      error,
    });
  }
}
