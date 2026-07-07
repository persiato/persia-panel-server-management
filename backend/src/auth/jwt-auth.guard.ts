import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { ApiKeysService } from '../api-keys/api-keys.service';

// Every controller in the app already guards its routes with
// @UseGuards(JwtAuthGuard, RolesGuard). Rather than adding a second,
// parallel guard class to ~10 existing controllers for API-key auth (and
// having to remember to add it to every new one going forward), an API key
// is treated as just another way to satisfy THIS guard: if the request
// carries an X-API-Key header, authenticate against ApiKeysService and
// attach the same { userId, username, role } shape JwtStrategy produces;
// otherwise fall through to normal Passport JWT bearer-token auth. This
// means a valid API key grants the exact same access as a logged-in
// session across the entire existing API surface — no endpoint needs to
// opt in.
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly apiKeysService: ApiKeysService) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-api-key'];
    const rawKey = Array.isArray(apiKey) ? apiKey[0] : apiKey;

    if (rawKey) {
      const user = await this.apiKeysService.authenticate(rawKey);
      if (!user) {
        return false;
      }
      request.user = user;
      return true;
    }

    return super.canActivate(context) as Promise<boolean>;
  }
}
