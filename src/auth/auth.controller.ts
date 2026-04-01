import {
  Controller,
  Post,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  Body,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { Public } from '@/decorator/customize';
import { LocalAuthGuard } from './guard/local-auth.guard';
import { CreateAuthDto, VerifyAccountDto } from './dto/create-auth.dto';
import { ResetPasswordAuthDto } from './dto/update-auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('login')
  @UseGuards(LocalAuthGuard)
  handleLogin(@Request() req) {
    return this.authService.login(req.user);
  }

  @Post('register')
  @Public()
  register(@Body() registerDto: CreateAuthDto) {
    return this.authService.register(registerDto);
  }

  /*  
  - FE
    người dùng nhấn "đăng nhập bằng google"
      next-auth chuyển hướng đến trang xác thực của google 
      người dùng chọn tài khoản và đồng ý cấp quyền
      google trả về id_token cho next-auth
  
  - next-auth callback jwt
    phát hiện account.provider === "google"
      lấy id_token từ account và gửi lên BE
  
  - BE - verifyGoogleToken
    dùng google-auth-library để xác minh id_token trực tiếp với google
      google xác nhận token hợp lệ và trả về thông tin profile
      kiểm tra email đã được verify chưa
  
  - BE - findOrCreateGoogleUser
    tìm user theo googleId trong db
      nếu có: trả về user luôn
      nếu không có nhưng email đã tồn tại: gắn googleId vào tài khoản cũ rồi trả về
      nếu hoàn toàn mới: tạo tài khoản mới với accountType = google
  
  - BE - loginGoogle
    ký jwt token nội bộ với thông tin user
      trả về { user, access_token } cho next-auth
  
  - next-auth callback jwt tiếp tục
    lưu user và access_token vào jwt token
  
  - next-auth callback session
    đưa thông tin user từ token vào session
  */
  @HttpCode(HttpStatus.OK)
  @Public()
  @Post('login/google')
  handleLoginGoogle(@Body('id_token') id_token: string) {
    return this.authService.loginGoogle(id_token);
  }

  @Post('verify-account')
  @Public()
  verifyAccount(@Body() verifyAccountDto: VerifyAccountDto) {
    return this.authService.verifyAccount(verifyAccountDto);
  }

  @Post('reactivate')
  @Public()
  reactivate(@Body('email') email: string) {
    return this.authService.reactivate(email);
  }

  @Post('forgot-password')
  @Public()
  forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  @Post('reset-password')
  @Public()
  resetPassword(@Body() resetPasswordAuthDto: ResetPasswordAuthDto) {
    return this.authService.resetPassword(resetPasswordAuthDto);
  }
}
