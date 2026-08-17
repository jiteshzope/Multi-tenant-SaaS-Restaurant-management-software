import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

const lower = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;
const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterRestaurantDto {
  @ApiProperty({ example: 'Spice Garden' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  restaurantName!: string;

  @ApiProperty({ example: 'spice-garden', description: 'lowercase letters, digits and dashes' })
  @Transform(lower)
  @IsString()
  @MinLength(3)
  @MaxLength(60)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase letters, digits and single dashes',
  })
  slug!: string;

  @ApiPropertyOptional({ example: '+91-9000000000' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiProperty({ example: 'Raj' })
  @Transform(trim)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  ownerName!: string;

  @ApiProperty({ example: 'owner@spice.com' })
  @Transform(lower)
  @IsEmail()
  @MaxLength(255)
  ownerEmail!: string;

  @ApiProperty({ minLength: 8, example: 'password123' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  ownerPassword!: string;
}

export class LoginDto {
  @ApiProperty({ example: 'owner@spice.com' })
  @Transform(lower)
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  @MinLength(20)
  refreshToken!: string;
}

export class LogoutDto {
  @ApiPropertyOptional({ description: 'Revokes just this lineage; omit to log out everywhere.' })
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  currentPassword!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
