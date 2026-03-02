import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Order } from '@/modules/orders/schemas/order.schema';
import { PaymentMethod, PaymentStatus } from '@/enum/order.enum';
import dayjs from 'dayjs';
import { createHmac } from 'crypto';
import { OrdersService } from '@/modules/orders/orders.service';
import { CreateOrderDto } from '@/modules/orders/dto/create-order.dto';
@Injectable()
export class PaymentService {
  private readonly tmnCode: string;
  private readonly hashSecret: string;
  private readonly vnpUrl: string;
  private readonly returnUrl: string;

  constructor(
    private readonly configService: ConfigService,
    @InjectModel(Order.name) private orderModel: Model<Order>,
    private readonly ordersService: OrdersService,
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
      vnp_TxnRef: order._id,
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

    const order = await this.orderModel.findById(vnp_TxnRef);

    if (!order) {
      return { RspCode: '01', Message: 'Order not found' };
    }

    if (order.totalAmount * 100 !== Number(vnp_Amount)) {
      return { RspCode: '04', Message: 'Invalid amount' };
    }
    if (order.payment.status !== PaymentStatus.UNPAID) {
      return { RspCode: '02', Message: 'Order already confirmed' };
    }
    const paymentStatus =
      vnp_ResponseCode === '00' ? PaymentStatus.PAID : PaymentStatus.FAILED;
    await this.updatePaymentStatus(
      vnp_TxnRef,
      paymentStatus,
      vnp_TransactionNo,
    );

    return { RspCode: '00', Message: 'Confirm Success' };
  }
  //  Nhận params từ VNPay gửi lên (query string)
  // Verify chữ ký vnp_SecureHash — quan trọng nhất, tránh giả mạo
  // Kiểm tra vnp_ResponseCode — '00' là thành công
  // Tìm order theo vnp_TxnRef (chính là order._id)
  // Kiểm tra số tiền vnp_Amount / 100 khớp với order.totalAmount
  // Cập nhật payment.status → PAID hoặc FAILED
  // Trả về { RspCode: '00', Message: 'Confirm Success' } cho VNPay (bắt buộc, VNPay cần response này)
}
