import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';

@Schema({ _id: false })
export class OrderItem {
  @Prop({ type: Types.ObjectId, ref: 'Product', required: true })
  productId: Types.ObjectId;

  @Prop({ required: true })
  productName: string;

  @Prop({ required: true })
  productSlug: string;

  @Prop({ required: true })
  price: number; // giá tại thời điểm mua

  // size snapshot
  @Prop({ type: Types.ObjectId, required: true })
  sizeId: Types.ObjectId;

  @Prop({ required: true })
  sizeCode: string; // "M"

  @Prop({ required: true })
  sizeName: string; // "Size M"

  @Prop({ required: true, min: 1 })
  quantity: number;

  @Prop({ required: true })
  totalPrice: number; // price * quantity
}

export const OrderItemSchema = SchemaFactory.createForClass(OrderItem);
