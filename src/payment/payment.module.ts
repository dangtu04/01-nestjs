import { Module } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { PaymentController } from './payment.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Order, OrderSchema } from '@/modules/orders/schemas/order.schema';
import { User, UserSchema } from '@/modules/users/schemas/user.schema';
import { Cart, CartSchema } from '@/modules/carts/schemas/cart.schema';
import {
  Product,
  ProductSchema,
} from '@/modules/products/schemas/product.schema';
import { Size, SizeSchema } from '@/modules/sizes/schemas/size.schema';
import { CartsModule } from '@/modules/carts/carts.module';
import { OrdersService } from '@/modules/orders/orders.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Order.name, schema: OrderSchema },
      { name: User.name, schema: UserSchema },
      { name: Cart.name, schema: CartSchema },
      { name: Product.name, schema: ProductSchema },
      { name: Size.name, schema: SizeSchema },
    ]),
    CartsModule,
  ],
  controllers: [PaymentController],
  providers: [PaymentService, OrdersService],
  exports: [PaymentService],
})
export class PaymentModule {}
