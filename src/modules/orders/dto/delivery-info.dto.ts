import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DeliveryAddressDto } from './delivery-address.dto';

export class DeliveryInfoDto {
  @IsString()
  @IsNotEmpty()
  receiverName: string;

  @IsString()
  @IsNotEmpty()
  receiverPhone: string;

  @ValidateNested()
  @Type(() => DeliveryAddressDto)
  address: DeliveryAddressDto;

  @IsString()
  note?: string;
}
