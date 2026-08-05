import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import type { StringValue } from 'ms';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { LoginDto } from './dto/login.dto';

export type AccessTokenPayload = {
  sub: string;
  empresaId: string;
  perfilId: string;
  perfilCodigo: string;
  login: string;
  permissoes: string[];
  jti: string;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  async login(dto: LoginDto, meta?: { ip?: string; userAgent?: string }) {
    const login = dto.login.trim().toLowerCase();
    const user = await this.prisma.usuario.findUnique({ where: { login } });
    if (!user || !user.ativo) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const ok = await bcrypt.compare(dto.senha, user.senhaHash);
    if (!ok) throw new UnauthorizedException('Credenciais inválidas');

    const slug = dto.tenantSlug?.trim() || 'fort-beer';
    const empresa = await this.prisma.empresa.findUnique({ where: { slug } });
    if (!empresa || !empresa.ativo) {
      throw new UnauthorizedException('Empresa inválida');
    }

    const vinculo = await this.prisma.usuarioEmpresa.findUnique({
      where: {
        usuarioId_empresaId: { usuarioId: user.id, empresaId: empresa.id },
      },
      include: {
        perfil: {
          include: {
            permissoes: { include: { permissao: true } },
          },
        },
      },
    });
    if (!vinculo || !vinculo.ativo) {
      throw new UnauthorizedException('Usuário sem acesso a esta empresa');
    }

    return this.issueTokens(user, empresa.id, vinculo.perfil, meta);
  }

  async refresh(rawRefresh: string, meta?: { ip?: string; userAgent?: string }) {
    if (!rawRefresh) throw new UnauthorizedException('Refresh ausente');

    const hash = this.hashToken(rawRefresh);
    const denylist = await this.redis.get(`rt:deny:${hash}`);
    if (denylist) throw new UnauthorizedException('Refresh revogado');

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hash },
      include: { usuario: true },
    });
    if (!stored || stored.revogado || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh inválido');
    }
    if (!stored.usuario.ativo) {
      throw new UnauthorizedException('Usuário inativo');
    }

    const vinculo = await this.prisma.usuarioEmpresa.findFirst({
      where: { usuarioId: stored.usuario.id, ativo: true },
      include: {
        perfil: { include: { permissoes: { include: { permissao: true } } } },
        empresa: true,
      },
      orderBy: { criadoEm: 'asc' },
    });
    if (!vinculo || !vinculo.empresa.ativo) {
      throw new UnauthorizedException('Sem empresa ativa');
    }

    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revogado: true },
    });
    await this.redis.set(`rt:deny:${hash}`, '1', 60 * 60 * 24 * 40);

    return this.issueTokens(
      stored.usuario,
      vinculo.empresaId,
      vinculo.perfil,
      meta,
    );
  }

  async logout(rawRefresh?: string) {
    if (!rawRefresh) return { ok: true };
    const hash = this.hashToken(rawRefresh);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: hash, revogado: false },
      data: { revogado: true },
    });
    await this.redis.set(`rt:deny:${hash}`, '1', 60 * 60 * 24 * 40);
    return { ok: true };
  }

  async getProfile(userId: string, empresaId?: string) {
    const user = await this.prisma.usuario.findUnique({ where: { id: userId } });
    if (!user || !user.ativo) throw new UnauthorizedException();

    const vinculo = await this.prisma.usuarioEmpresa.findFirst({
      where: {
        usuarioId: userId,
        ativo: true,
        ...(empresaId ? { empresaId } : {}),
      },
      include: {
        empresa: true,
        perfil: { include: { permissoes: { include: { permissao: true } } } },
      },
    });
    if (!vinculo) throw new UnauthorizedException();

    return {
      id: user.id,
      nome: user.nome,
      login: user.login,
      empresaId: vinculo.empresaId,
      empresaSlug: vinculo.empresa.slug,
      empresaNome: vinculo.empresa.nome,
      perfil: vinculo.perfil.codigo,
      perfilId: vinculo.perfilId,
      permissoes: vinculo.perfil.permissoes.map((p) => p.permissao.codigo),
    };
  }

  private async issueTokens(
    user: { id: string; login: string; nome: string },
    empresaId: string,
    perfil: {
      id: string;
      codigo: string;
      permissoes: { permissao: { codigo: string } }[];
    },
    meta?: { ip?: string; userAgent?: string },
  ) {
    const jti = randomBytes(16).toString('hex');
    const permissoes = perfil.permissoes.map((p) => p.permissao.codigo);
    const payload: AccessTokenPayload = {
      sub: user.id,
      empresaId,
      perfilId: perfil.id,
      perfilCodigo: perfil.codigo,
      login: user.login,
      permissoes,
      jti,
    };

    const expiresIn = (this.config.get<string>('JWT_ACCESS_TTL') ||
      '15m') as StringValue;

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn,
    });

    const rawRefresh = randomBytes(48).toString('hex');
    const tokenHash = this.hashToken(rawRefresh);
    const refreshTtlDays = Number(this.config.get('JWT_REFRESH_DAYS') || 14);
    const expiresAt = new Date(
      Date.now() + refreshTtlDays * 24 * 60 * 60 * 1000,
    );

    await this.prisma.refreshToken.create({
      data: {
        usuarioId: user.id,
        tokenHash,
        expiresAt,
        ip: meta?.ip,
        userAgent: meta?.userAgent,
      },
    });

    return {
      accessToken,
      refreshToken: rawRefresh,
      expiresIn,
      user: {
        id: user.id,
        nome: user.nome,
        login: user.login,
        empresaId,
        perfil: perfil.codigo,
        permissoes,
      },
    };
  }

  private hashToken(raw: string) {
    return createHash('sha256').update(raw).digest('hex');
  }
}
