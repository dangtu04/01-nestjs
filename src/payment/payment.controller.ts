import { Body, Controller, Get, Post, Query, Request } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { UserRole } from '@/enum/user.enum';
import { CreateOrderDto } from '@/modules/orders/dto/create-order.dto';
import { Public, Roles } from '@/decorator/customize';
import { VNPayReturnDto } from './dto/create-payment.dto';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * ==========================================
   * luồng thanh toán VNPay
   * ==========================================
   *
   * bước 1: TẠO ĐƠN HÀNG
   *
   * [FE] User nhấn "Đặt hàng" với phương thức VNPay
   *   -> Gọi handleCreateVNPayOrderAction()
   *
   * [BE] POST /payment/vnpay
   *   -> createOrderVNPay():
   *      1. Tạo đơn hàng trong DB với trạng thái UNPAID
   *         - shouldValidateStock = false (chưa kiểm tra tồn kho)
   *         - shouldClearCart    = false (chưa xóa giỏ hàng)
   *         -> Lý do: chưa chắc user sẽ thanh toán thành công
   *      2. Tạo paymentUrl theo chuẩn VNPay và trả về FE
   *
   * [FE] Nhận được paymentUrl -> redirect sang VNPay
   *
   *
   * bước 2: XỬ LÝ KẾT QUẢ TỪ VNPAY (2 LUỒNG SONG SONG)
   *
   * Sau khi user thanh toán xong, VNPay gọi đồng thời 2 endpoint:
   *
   * LUỒNG A: IPN (server-to-server, backend nhận trước)
   *
   * [VNPay] GET /payment/vnpay-ipn (public, không cần auth)
   *   -> handleVNPayIpn():
   *      1. Verify chữ ký HMAC-SHA512
   *      2. Mở MongoDB Transaction để đảm bảo toàn vẹn dữ liệu
   *      3. Tìm order theo vnp_TxnRef (= orderId)
   *      4. Kiểm tra số tiền khớp với DB
   *      5. Kiểm tra order chưa được xử lý (status = UNPAID)
   *         - Nếu đã xử lý -> trả về RspCode 02, bỏ qua (idempotent)
   *      6. Nếu vnp_ResponseCode = '00' (thanh toán thành công):
   *         - Validate tồn kho và giảm stock
   *         - Xóa giỏ hàng của user
   *         - Cập nhật order: status = PAID, lưu transactionId
   *         -> Nếu cart đã bị xóa trước đó:
   *            + log warning nhưng vẫn cập nhật PAID
   *            + tránh VNPay retry vô hạn
   *      7. Nếu thanh toán thất bại -> status = FAILED
   *      8. Trả về RspCode '00' để VNPay biết đã nhận IPN thành công
   *
   *
   * LUỒNG B: RETURN URL (redirect về FE)
   *
   * [VNPay] Redirect user về FE kèm query params
   *
   * [FE] page.tsx nhận params -> gọi GET /payment/vnpay/return
   *
   * [BE] GET /payment/vnpay/return (auth required)
   *   -> handleReturnUrl():
   *      1. Verify chữ ký HMAC-SHA512
   *      2. Tìm order theo vnp_TxnRef
   *      3. Retry tối đa 3 lần (mỗi lần cách 800ms)
   *         -> chờ IPN cập nhật xong trước khi đọc trạng thái
   *         -> vì IPN và Return URL chạy gần như đồng thời
   *      4. Trả về { success, orderId, status } cho FE
   *
   * [FE] Render <VNPayReturn /> với kết quả
   *
   */

  @Post('vnpay')
  @Roles(UserRole.ADMIN, UserRole.USER)
  createOrderVNPay(@Request() req, @Body() createOrderDto: CreateOrderDto) {
    // console.log('>>>>> check call api');
    const userId = req.user._id;
    return this.paymentService.createOrderVNPay(userId, createOrderDto);
  }
  @Get('vnpay-ipn')
  @Public()
  handleVNPayIpn(@Request() req) {
    return this.paymentService.handleVNPayIpn(req.query);
  }

  @Get('vnpay/return')
  @Roles(UserRole.ADMIN, UserRole.USER)
  handleReturn(@Query() query: VNPayReturnDto) {
    return this.paymentService.handleReturnUrl(query);
  }
}
