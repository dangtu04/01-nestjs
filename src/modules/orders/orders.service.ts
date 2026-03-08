import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { ClientSession, Connection, Model, Types } from 'mongoose';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { User } from '@/modules/users/schemas/user.schema';
import { Cart } from '@/modules/carts/schemas/cart.schema';
import { Product } from '@/modules/products/schemas/product.schema';
import { Size } from '@/modules/sizes/schemas/size.schema';
import { OrderItem } from './schemas/order.item.schema';
import {
  PaymentMethod,
  PaymentStatus,
  ShippingConfig,
} from '@/enum/order.enum';
import { Order } from './schemas/order.schema';
import { CartsService } from '@/modules/carts/carts.service';

@Injectable()
export class OrdersService {
  constructor(
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Cart.name) private cartModel: Model<Cart>,
    @InjectModel(Product.name) private productModel: Model<Product>,
    @InjectModel(Size.name) private sizeModel: Model<Size>,
    private readonly cartsService: CartsService,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async validateAndDecreaseStock(
    cart: Cart,
    session: ClientSession,
  ): Promise<void> {
    for (const item of cart.items) {
      const result = await this.productModel
        .findOneAndUpdate(
          {
            _id: item.productId,
            variants: {
              $elemMatch: {
                sizeId: item.sizeId,
                quantity: { $gte: item.quantity }, // qty phải >= qty của product
              },
            },
          }, // tìm theo productId, variants phải khớp 2 đk
          {
            $inc: { 'variants.$.quantity': -item.quantity }, // trừ quantity
          },
          { session },
        )
        .exec();
      if (!result) {
        throw new BadRequestException(
          `Sản phẩm ${item.productId} không đủ hàng hoặc thông tin không đúng.`,
        );
      }
    }
  }

  async prepareAndCreateOrder(
    userId: string,
    createOrderDto: CreateOrderDto,
    paymentMethod: PaymentMethod,
    shouldValidateStock: boolean = true,
    shouldClearCart: boolean = true,
  ) {
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      if (!Types.ObjectId.isValid(userId)) {
        throw new BadRequestException('Id không hợp lệ');
      }
      const user = await this.userModel
        .findById(userId)
        .select('email')
        .session(session);
      if (!user) throw new NotFoundException('Không tìm thấy người dùng');

      const cart = await this.cartModel.findOne({ userId }).session(session);
      if (!cart || cart.items.length === 0) {
        throw new BadRequestException('Giỏ hàng trống');
      }

      // validate và giảm stock nếu cần
      if (shouldValidateStock) {
        await this.validateAndDecreaseStock(cart, session);
      }

      // chuẩn bị items cho order
      const items: OrderItem[] = await Promise.all(
        cart.items.map(async (item) => {
          const product = await this.productModel
            .findById(item.productId)
            .select('name slug price');
          const size = await this.sizeModel
            .findById(item.sizeId)
            .select('code name');
          return {
            productId: product._id,
            productName: product.name,
            productSlug: product.slug,
            price: product.price,
            sizeId: size._id,
            sizeCode: size.code,
            sizeName: size.name,
            quantity: item.quantity,
            totalPrice: product.price * item.quantity,
          };
        }),
      );

      // chuẩn bị delivery
      const delivery = {
        receiverName: createOrderDto.delivery.receiverName,
        receiverPhone: createOrderDto.delivery.receiverPhone,
        address: createOrderDto.delivery.address,
        note: createOrderDto.delivery.note,
      };

      // tính giá
      const subtotal = items.reduce((acc, item) => acc + item.totalPrice, 0);
      const shippingFee =
        subtotal >= ShippingConfig.FREE_SHIPPING_THRESHOLD
          ? 0
          : ShippingConfig.DEFAULT_FEE;
      const totalAmount = subtotal + shippingFee;

      // chuẩn bị payment
      const payment = {
        method: paymentMethod,
        status: PaymentStatus.UNPAID,
      };

      // tạo order
      const [createdOrder] = await this.orderModel.create(
        [
          {
            userId: user._id,
            userEmail: user.email,
            items,
            delivery,
            payment,
            subtotal,
            shippingFee,
            totalAmount,
          },
        ],
        { session },
      );

      // xóa cart nếu cần
      if (shouldClearCart) {
        await this.cartsService.clearCartByUserId(userId, session);
      }

      await session.commitTransaction();
      return createdOrder;
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }

  async createOrder(userId: string, createOrderDto: CreateOrderDto) {
    const order = await this.prepareAndCreateOrder(
      userId,
      createOrderDto,
      PaymentMethod.COD,
      true, // shouldValidateStock
      true, // shouldClearCart
    );
    return order.items.map((i) => i.productSlug);
  }
}
