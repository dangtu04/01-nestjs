import { Body, Controller, Get, Post, Request } from '@nestjs/common';
import { PaymentService } from './payment.service';
import { UserRole } from '@/enum/user.enum';
import { CreateOrderDto } from '@/modules/orders/dto/create-order.dto';
import { Public, Roles } from '@/decorator/customize';

@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  @Post('vnpay')
  @Roles(UserRole.ADMIN, UserRole.USER)
  createOrderVNPay(@Request() req, @Body() createOrderDto: CreateOrderDto) {
    const userId = req.user._id;
    return this.paymentService.createOrderVNPay(userId, createOrderDto);
  }
  @Get('vnpay-ipn')
  @Public()
  handleVNPayIpn(@Request() req) {
    return this.paymentService.handleVNPayIpn(req.query);
  }
}
