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

  private async validateAndDecreaseStock(
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
  async createOrder(userId: string, createOrderDto: CreateOrderDto) {
    // start session
    const session = await this.connection.startSession();
    // start transaction
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

      // giảm số stock trong product theo cart item
      await this.validateAndDecreaseStock(cart, session);
      // chuẩn bị items cho order trong schema
      const items: OrderItem[] = await Promise.all(
        cart.items.map(async (item) => {
          const product = await this.productModel
            .findById(item.productId)
            .select('name slug price');
          // console.log('>>>>> product: ', product);
          const size = await this.sizeModel
            .findById(item.sizeId)
            .select('code name');
          // console.log('>>>>> size: ', size);
          const result = {
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
          return result;
        }),
      );

      // chuẩn bị cho delivery trong schema
      const delivery = {
        receiverName: createOrderDto.delivery.receiverName,
        receiverPhone: createOrderDto.delivery.receiverPhone,
        address: createOrderDto.delivery.address,
        note: createOrderDto.delivery.note,
      };

      // giá tạm tính
      const subtotal = items.reduce((acc, item) => acc + item.totalPrice, 0);

      // phí ship
      const shippingFee =
        subtotal >= ShippingConfig.FREE_SHIPPING_THRESHOLD
          ? 0
          : ShippingConfig.DEFAULT_FEE;

      // tổng tiền
      const totalAmount = subtotal + shippingFee;

      // chuẩn bị cho payment trong schema
      const payment = {
        method: PaymentMethod.COD,
        status: PaymentStatus.UNPAID,
      };

      await this.orderModel.create(
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

      // clear cart
      await this.cartsService.clearCartByUserId(userId, session);

      // console.log('>>>>>>>>> Before commit');
      // commit transaction
      await session.commitTransaction();
      // console.log('>>>>>>>>> After commit');
      return items.map((i) => i.productSlug);
    } catch (error) {
      // rollback nếu bị lỗi
      await session.abortTransaction();
      throw error;
    } finally {
      // end session
      session.endSession();
    }
  }
}
