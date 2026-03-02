import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { Order, OrderSchema } from './schemas/order.schema';
import { MongooseModule } from '@nestjs/mongoose';
import { User, UserSchema } from '@/modules/users/schemas/user.schema';
import { Cart, CartSchema } from '@/modules/carts/schemas/cart.schema';
import {
  Product,
  ProductSchema,
} from '@/modules/products/schemas/product.schema';
import { Size, SizeSchema } from '@/modules/sizes/schemas/size.schema';
import { CartsModule } from '@/modules/carts/carts.module';

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
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
