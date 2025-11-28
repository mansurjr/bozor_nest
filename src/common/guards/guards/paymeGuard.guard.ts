import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { PaymeError } from '../../types/payme-error';

@Injectable()
export class PaymeBasicAuthGuard implements CanActivate {
  private readonly logger = new Logger(PaymeBasicAuthGuard.name);

  constructor(private configService: ConfigService) { }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const transId = request?.body?.id;

    const denyAccess = (reason: string) => {
      this.logger.error(`Payme authorization failed: ${reason}, transaction id: ${transId}`);
      response.status(200).send({
        id: transId,
        error: PaymeError.InvalidAuthorization,
      });
      return false;
    };

    const token = this.extractTokenFromHeader(request);
    if (!token) return denyAccess('No authorization token provided');

    const decoded = this.decodeToken(token);
    if (!decoded) return denyAccess('Failed to decode token');

    const [username, password] = decoded.split(':');
    const isValidUsername = this.configService.get<string>('PAYME_LOGIN') === username;
    const isValidPassword = this.configService.get<string>('PAYME_PASS') === password;
    if (!isValidUsername || !isValidPassword) {
      return denyAccess('Invalid username or password');
    }

    return true;
  }

  private extractTokenFromHeader(request: Request): string | undefined {
    const [type, token] = request.headers['authorization']?.split(' ') ?? [];
    return type === 'Basic' ? token : undefined;
  }

  private decodeToken(token: string) {
    return token?.length > 0 ? Buffer.from(token, 'base64').toString('utf-8') : undefined;
  }
}
