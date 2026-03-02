import { PaymentMethod, PaymentStatus } from '@/enum/order.enum';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ _id: false })
export class PaymentInfo {
  @Prop({ type: String, enum: PaymentMethod, required: true })
  method: PaymentMethod;

  @Prop({
    type: String,
    enum: PaymentStatus,
    default: PaymentStatus.UNPAID,
  })
  status: PaymentStatus;

  @Prop({ default: null })
  transactionId?: string;

  @Prop()
  paidAt?: Date;
}

export const PaymentInfoSchema = SchemaFactory.createForClass(PaymentInfo);
