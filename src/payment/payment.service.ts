import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Connection, Model } from 'mongoose';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Order } from '@/modules/orders/schemas/order.schema';
import { PaymentMethod, PaymentStatus } from '@/enum/order.enum';
import dayjs from 'dayjs';
import { createHmac } from 'crypto';
import { OrdersService } from '@/modules/orders/orders.service';
import { CreateOrderDto } from '@/modules/orders/dto/create-order.dto';
import { Cart } from '@/modules/carts/schemas/cart.schema';
import { CartsService } from '@/modules/carts/carts.service';
import { VNPayReturnDto } from './dto/create-payment.dto';
@Injectable()
export class PaymentService {
  private readonly tmnCode: string;
  private readonly hashSecret: string;
  private readonly vnpUrl: string;
  private readonly returnUrl: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    @InjectModel(Cart.name) private cartModel: Model<Cart>,
    private readonly ordersService: OrdersService,

    private readonly cartsService: CartsService,
    @InjectConnection() private readonly connection: Connection,
  ) {
    this.tmnCode = this.configService.get<string>('VNPAY_TMN_CODE');
    this.hashSecret = this.configService.get<string>('VNPAY_HASH_SECRET');
    this.vnpUrl = this.configService.get<string>('VNPAY_URL');
    this.returnUrl = this.configService.get<string>('VNPAY_RETURN_URL');
  }
  private sortObject(obj: Record<string, string>): Record<string, string> {
    return Object.keys(obj)
      .sort()
      .reduce(
        (acc, key) => {
          acc[key] = obj[key];
          return acc;
        },
        {} as Record<string, string>,
      );
  }
  async createPaymentUrl(order: any) {
    const date = dayjs().format('YYYYMMDDHHmmss');

    const vnp_Params: any = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay', // sài pay cho tạo mới
      vnp_TmnCode: this.tmnCode,
      vnp_Amount: order.totalAmount * 100,
      vnp_CurrCode: 'VND', // đơn vị tiền tệ
      vnp_TxnRef: order._id.toString(), // order id
      vnp_OrderInfo: `Thanh toan don hang ${order._id}`,
      vnp_OrderType: 'other', // loại hàng hoá
      vnp_Locale: 'vn', // ngôn ngữ gd thanh toán
      vnp_ReturnUrl: this.returnUrl,
      vnp_IpAddr: '127.0.0.1',
      vnp_CreateDate: date,
    };

    const sortedParams = this.sortObject(vnp_Params);
    const signData = new URLSearchParams(sortedParams).toString();

    const hmac = createHmac('sha512', this.hashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    sortedParams['vnp_SecureHash'] = signed;

    return this.vnpUrl + '?' + new URLSearchParams(sortedParams).toString();
  }

  async createOrderVNPay(userId: string, createOrderDto: CreateOrderDto) {
    const order = await this.ordersService.prepareAndCreateOrder(
      userId,
      createOrderDto,
      PaymentMethod.VNPAY,
      false, // shouldValidateStock - không kiểm tra stock cho VNPAY
      false, // shouldClearCart - không xóa cart cho VNPAY
    );
    const paymentUrl = await this.createPaymentUrl(order);
    return { paymentUrl };
  }

  async updatePaymentStatus(
    orderId: string,
    status: PaymentStatus,
    transactionId: string,
  ): Promise<void> {
    // console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>> id: ', transactionId);
    await this.orderModel.findByIdAndUpdate(orderId, {
      'payment.status': status,
      'payment.transactionId': transactionId,
    });
  }
  async handleVNPayIpn(query: Record<string, string>) {
    // console.log('>>>>> check call ipn, query: ', query);
    const { vnp_SecureHash, ...rest } = query;

    const vnp_TxnRef = query.vnp_TxnRef;
    const vnp_ResponseCode = query.vnp_ResponseCode;
    const vnp_Amount = query.vnp_Amount;
    const vnp_TransactionNo = query.vnp_TransactionNo;

    // verify chữ ký
    const sortedParams = this.sortObject(rest);
    const signData = new URLSearchParams(sortedParams).toString();
    const hmac = createHmac('sha512', this.hashSecret);
    const signed = hmac.update(Buffer.from(signData, 'utf-8')).digest('hex');

    if (signed !== vnp_SecureHash) {
      return { RspCode: '97', Message: 'Invalid signature' };
    }

    const session = await this.connection.startSession();
    session.startTransaction();

    try {
      const order = await this.orderModel.findById(vnp_TxnRef).session(session);

      if (!order) {
        throw new Error('Order not found');
      }

      if (order.totalAmount * 100 !== Number(vnp_Amount)) {
        throw new Error('Invalid amount');
      }

      if (order.payment.status !== PaymentStatus.UNPAID) {
        await session.commitTransaction();
        return { RspCode: '02', Message: 'Order already confirmed' };
      }

      // chỈ xử lý khi thanh toán thành công
      if (vnp_ResponseCode === '00') {
        const userId = order.userId.toString();

        const cart = await this.cartModel.findOne({ userId }).session(session);

        if (!cart || cart.items.length === 0) {
          // log warning nhưng vẫn update PAID để VNPay không retry
          console.warn('Cart already cleared for order:', vnp_TxnRef);
        } else {
          await this.ordersService.validateAndDecreaseStock(cart, session);
          await this.cartsService.clearCartByUserId(userId, session);
        }

        order.payment.status = PaymentStatus.PAID;
        order.payment.transactionId = vnp_TransactionNo;
      } else {
        order.payment.status = PaymentStatus.FAILED;
      }

      await order.save({ session });

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      console.error('IPN error:', error);
      return { RspCode: '99', Message: 'Unknown error' };
    } finally {
      session.endSession();
    }

    return { RspCode: '00', Message: 'Confirm Success' };
  }

  async handleReturnUrl(query: VNPayReturnDto) {
    const { vnp_SecureHash, ...rest } = query;

    console.log('>>>>> check call return url, query: ', query);
    // verify chữ ký
    const sortedParams = this.sortObject(rest);
    const signData = new URLSearchParams(sortedParams).toString();
    const signed = createHmac('sha512', this.hashSecret)
      .update(Buffer.from(signData, 'utf-8'))
      .digest('hex');

    if (signed !== vnp_SecureHash) {
      return { success: false, message: 'Chữ ký không hợp lệ' };
    }

    const order = await this.orderModel.findById(query.vnp_TxnRef);
    if (!order) {
      return { success: false, message: 'Không tìm thấy đơn hàng' };
    }

    // chờ IPN cập nhật trạng thái
    let currentOrder = order;
    let retries = 0;
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 800;

    while (
      currentOrder.payment.status === PaymentStatus.UNPAID &&
      retries < MAX_RETRIES
    ) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      currentOrder = await this.orderModel.findOne({
        orderCode: query.vnp_TxnRef,
      });
      retries++;
    }

    return {
      success: order.payment.status === PaymentStatus.PAID,
      orderId: order._id,
      status: order.payment.status, // trạng thái thanh toán
    };
  }
}
