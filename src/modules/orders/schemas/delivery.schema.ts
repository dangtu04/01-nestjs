import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class DeliveryAddress {
  @Prop({ required: true })
  provinceCode: number;

  @Prop({ required: true })
  provinceName: string;

  @Prop({ required: true })
  wardCode: number;

  @Prop({ required: true })
  wardName: string;

  @Prop({ trim: true })
  detail?: string;
}

export const DeliveryAddressSchema =
  SchemaFactory.createForClass(DeliveryAddress);

@Schema({ _id: false })
export class DeliveryInfo {
  @Prop({ required: true })
  receiverName: string;

  @Prop({ required: true })
  receiverPhone: string;

  @Prop({ type: DeliveryAddressSchema, required: true })
  address: DeliveryAddress;

  @Prop({ trim: true })
  note?: string;
}

export const DeliveryInfoSchema = SchemaFactory.createForClass(DeliveryInfo);
