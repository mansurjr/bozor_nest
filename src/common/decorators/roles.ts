// users/roles.decorator.ts
import { SetMetadata } from "@nestjs/common";
import { Roles as RoleEnum } from "@prisma/client"; // rename enum locally

export const RolesDecorator = (...roles: RoleEnum[]) => SetMetadata("roles", roles);
