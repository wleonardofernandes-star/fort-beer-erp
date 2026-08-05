import { IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  login!: string;

  @IsString()
  @MinLength(4)
  senha!: string;

  @IsOptional()
  @IsString()
  tenantSlug?: string;
}
