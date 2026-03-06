import { Role } from '@prisma/client';

export interface IAuthUser {
  userId: string;
  role: Role;
  tokenVersion?: number;
}

export interface IRequest {
  user: IAuthUser;
}
