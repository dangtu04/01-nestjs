import { IsEnum, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DeliveryInfoDto } from './delivery-info.dto';
import { PaymentMethod } from '@/enum/order.enum';

export class CreateOrderDto {
  @ValidateNested()
  @Type(() => DeliveryInfoDto)
  @IsNotEmpty()
  delivery: DeliveryInfoDto;

  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  paymentMethod: PaymentMethod;
}
