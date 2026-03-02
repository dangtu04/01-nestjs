import {
  Controller,
  // Get,
  Post,
  Body,
  // Patch,
  // Param,
  // Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { JwtAuthGuard } from '@/auth/guard/jwt-auth.guard';
import { Roles } from '@/decorator/customize';
import { UserRole } from '@/enum/user.enum';

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.USER)
  createOrder(@Request() req, @Body() createOrderDto: CreateOrderDto) {
    const userId = req.user._id;

    return this.ordersService.createOrder(userId, createOrderDto);
  }
}
