import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Repository } from '../db/repository';
import type { AuthUser } from './auth.guard';

const VALID_ROLES = new Set(['admin', 'architect', 'advisor', 'client']);

@Injectable()
export class AuthService {
  constructor(
    private readonly repository: Repository,
    private readonly jwt: JwtService,
  ) {}

  async register(input: {
    email: string;
    password: string;
    fullName: string;
    phone?: string;
    role?: string;
  }): Promise<{ token: string; user: AuthUser }> {
    const email = input.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new BadRequestException('El correo electrónico no es válido.');
    }
    if (input.password.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres.');
    }
    const role = input.role ?? 'client';
    if (!VALID_ROLES.has(role)) {
      throw new BadRequestException(`Rol inválido. Valores admitidos: ${[...VALID_ROLES].join(', ')}.`);
    }
    const existing = await this.repository.findUserByEmail(email);
    if (existing) throw new ConflictException('Ya existe una cuenta con ese correo electrónico.');

    const user = await this.repository.insertUser({
      id: randomUUID(),
      email,
      password_hash: await bcrypt.hash(input.password, 10),
      full_name: input.fullName.trim(),
      phone: input.phone ?? null,
      role_id: role,
    });

    await this.repository.insertAudit({
      id: randomUUID(),
      actor_id: user.id,
      action: 'user.register',
      entity: 'user',
      entity_id: user.id,
      payload: { role },
      ip: null,
    });

    return this.issueToken(user.id, user.email, user.full_name, user.role_id);
  }

  async login(email: string, password: string): Promise<{ token: string; user: AuthUser }> {
    const user = await this.repository.findUserByEmail(email.trim().toLowerCase());
    if (!user) throw new UnauthorizedException('Credenciales incorrectas.');
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Credenciales incorrectas.');
    await this.repository.touchLogin(user.id);
    await this.repository.insertAudit({
      id: randomUUID(),
      actor_id: user.id,
      action: 'user.login',
      entity: 'user',
      entity_id: user.id,
      payload: {},
      ip: null,
    });
    return this.issueToken(user.id, user.email, user.full_name, user.role_id);
  }

  async profile(userId: string): Promise<AuthUser> {
    const user = await this.repository.findUserById(userId);
    if (!user) throw new UnauthorizedException('Usuario no encontrado.');
    return { id: user.id, email: user.email, fullName: user.full_name, role: user.role_id };
  }

  private async issueToken(
    id: string,
    email: string,
    fullName: string,
    role: string,
  ): Promise<{ token: string; user: AuthUser }> {
    const token = await this.jwt.signAsync({ sub: id, email, role });
    return { token, user: { id, email, fullName, role } };
  }
}
