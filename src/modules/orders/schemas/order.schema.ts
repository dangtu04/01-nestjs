import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { OrderItem, OrderItemSchema } from './order.item.schema';
import { DeliveryInfo, DeliveryInfoSchema } from './delivery.schema';
import { OrderStatus } from '@/enum/order.enum';
import { PaymentInfo, PaymentInfoSchema } from './payment.schema';

@Schema({ timestamps: true })
export class Order {
  // user
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true })
  userEmail: string;

  // items
  @Prop({ type: [OrderItemSchema], required: true })
  items: OrderItem[];

  // delivery
  @Prop({ type: DeliveryInfoSchema, required: true })
  delivery: DeliveryInfo;

  // pricing
  @Prop({ required: true })
  subtotal: number;

  @Prop({ default: 0 })
  discountAmount: number;

  @Prop({ required: true })
  totalAmount: number;

  // status
  @Prop({
    type: String,
    enum: OrderStatus,
    default: OrderStatus.PENDING,
    index: true,
  })
  status: OrderStatus;

  // payment
  @Prop({ type: PaymentInfoSchema, required: true })
  payment: PaymentInfo;

  // timeline
  //   @Prop({ type: [OrderStatusHistorySchema], default: [] })
  //   statusHistory: OrderStatusHistory[];

  // ddmin
  @Prop({ trim: true })
  adminNote?: string;

  @Prop({ required: true })
  shippingFee: number;

  @Prop({ default: false })
  isDeleted: boolean;
}

export const OrderSchema = SchemaFactory.createForClass(Order);
