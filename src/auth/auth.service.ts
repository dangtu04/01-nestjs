import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '@/modules/users/users.service';
import { comparePasswordHelper } from '@/helpers/utils';
import { JwtService } from '@nestjs/jwt';
import { CreateAuthDto, VerifyAccountDto } from './dto/create-auth.dto';
import { ResetPasswordAuthDto } from './dto/update-auth.dto';
import { OAuth2Client } from 'google-auth-library';
import { ConfigService } from '@nestjs/config';

interface IUser {
  _id: string;
  email: string;
  name: string;
  role: string;
}
@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);

    // Kiểm tra nếu user không tồn tại
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }
    // User chưa kích hoạt
    if (!user.isActive) {
      throw new ForbiddenException('Tài khoản chưa được kích hoạt');
    }

    // Kiểm tra password
    const isValid = await comparePasswordHelper(pass, user.password);

    if (!isValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return user;
  }

  async login(user: IUser) {
    const payload = { email: user.email, _id: user._id, role: user.role };
    return {
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      access_token: this.jwtService.sign(payload),
    };
  }
  // xác thực id_token
  async verifyGoogleToken(idToken: string) {
    const client = new OAuth2Client(
      this.configService.get<string>('AUTH_GOOGLE_ID'),
    );

    // kiểm tra tính hợp lệ và lấy thông tin user
    const ticket = await client.verifyIdToken({
      idToken,
      audience: this.configService.get<string>('AUTH_GOOGLE_ID'),
    });

    const payload = ticket.getPayload();

    // nếu google không trả về payload thì token không hợp lệ
    if (!payload) {
      throw new UnauthorizedException('Invalid token');
    }

    // chỉ cho phép những tài khoản google đã xác minh email
    if (!payload.email_verified) {
      throw new UnauthorizedException('Email chưa xác thực');
    }

    return {
      email: payload.email,
      googleId: payload.sub, // sub là id duy nhất của user trên google
      name: payload.name,
      // image: payload.picture,
    };
  }

  async loginGoogle(id_token: string) {
    // xác thực id_token với google và lấy thông tin profile
    const googleData = await this.verifyGoogleToken(id_token);

    // tìm user trong db hoặc tạo mới nếu chưa tồn tại
    const user = await this.usersService.findOrCreateGoogleUser(googleData);

    // tạo jwt token nội bộ để trả về cho frontend
    const payload = { email: user.email, _id: user._id, role: user.role };
    return {
      user: {
        _id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      access_token: this.jwtService.sign(payload),
    };
  }

  async register(registerDto: CreateAuthDto) {
    return await this.usersService.handleRegister(registerDto);
  }

  async verifyAccount(verifyAccountDto: VerifyAccountDto) {
    return await this.usersService.handleVerifyAccount(verifyAccountDto);
  }

  async reactivate(email: string) {
    return this.usersService.handleReactivate(email);
  }

  async forgotPassword(email: string) {
    return this.usersService.handleForgotPassword(email);
  }

  async resetPassword(resetPasswordAuthDto: ResetPasswordAuthDto) {
    return this.usersService.handleResetPassword(resetPasswordAuthDto);
  }
}
