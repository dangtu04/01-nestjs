import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class DeliveryAddressDto {
  @IsNumber()
  @IsNotEmpty()
  provinceCode: number;

  @IsString()
  @IsNotEmpty()
  provinceName: string;

  @IsNumber()
  @IsNotEmpty()
  wardCode: number;

  @IsString()
  @IsNotEmpty()
  wardName: string;

  @IsString()
  @IsOptional()
  detail?: string;
}
