import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateProfileDto, UpdateUserDto } from './dto/update-user.dto';
import { InjectModel } from '@nestjs/mongoose';
import { User } from './schemas/user.schema';
import { Model, Types } from 'mongoose';
import { hashPasswordHelper } from '@/helpers/utils';
import aqp from 'api-query-params';
import { CreateAuthDto, VerifyAccountDto } from '@/auth/dto/create-auth.dto';
import { v4 as uuidv4 } from 'uuid';
import dayjs from 'dayjs';
import { ResetPasswordAuthDto } from '@/auth/dto/update-auth.dto';
import { ConfigService } from '@nestjs/config';
import { AccountType } from '@/enum/user.enum';
import { SendgridService } from '@/mail/sendgrid.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    private sendgridService: SendgridService,
    private configService: ConfigService,
  ) {}

  async isEmailExist(email: string) {
    const user = await this.userModel.exists({ email });
    if (user) {
      return true;
    } else {
      return false;
    }
  }
  async create(createUserDto: CreateUserDto) {
    const { name, email, password } = createUserDto;
    const isExist = await this.isEmailExist(email);
    if (isExist) {
      throw new BadRequestException('Email existed');
    }
    const hashPassword = await hashPasswordHelper(password);
    const user = await this.userModel.create({
      name,
      email,
      password: hashPassword,
    });
    return { _id: user._id };
  }

  findOne(id: number) {
    return `This action returns a #${id} user`;
  }

  async findAll(query: string, current: number, pageSize: number) {
    const { filter, sort } = aqp(query);
    if (filter.current) delete filter.current;
    if (filter.pageSize) delete filter.pageSize;
    if (!current) current = 1;
    if (!pageSize) pageSize = 10;

    const totalItems = await this.userModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / pageSize);
    const skip = (+current - 1) * +pageSize;

    const results = await this.userModel
      .find(filter)
      .limit(pageSize)
      .skip(skip)
      .select('-password')
      .sort(sort as any);
    return {
      meta: {
        current: current, // trang hiện tại
        pageSize: pageSize, // số lượng bản ghi đã lấy
        pages: totalPages, //tổng số trang với đk query
        totals: totalItems, // tổng số bản ghi
      },
      results,
    };
  }

  async findOneById(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user id');
    }
    const user = await this.userModel
      .findById(id)
      .select('_id name email phone address');
    if (!user) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return user;
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user id');
    }
    const updatedUser = await this.userModel.findByIdAndUpdate(
      id,
      updateUserDto,
      { new: true },
    );
    if (!updatedUser) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return {
      message: 'Update user successfully!',
    };
  }

  async remove(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user id');
    }
    const dateleUser = await this.userModel.findByIdAndDelete(id);
    if (!dateleUser) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return {
      message: 'Delete user successfully!',
    };
  }
  async findByEmail(email: string) {
    return await this.userModel.findOne({ email });
  }

  async handleRegister(registerDto: CreateAuthDto) {
    const { name, email, password } = registerDto;

    // check email tồn tại
    const isExist = await this.isEmailExist(email);
    if (isExist) {
      throw new BadRequestException('Email existed');
    }

    // hash password
    const hashPassword = await hashPasswordHelper(password);

    // tạo code kích hoạt
    const codeId = uuidv4();

    // tạo user
    const user = await this.userModel.create({
      name,
      email,
      password: hashPassword,
      isActive: false,
      codeId: codeId,
      codeExpired: dayjs().add(5, 'minute'),
    });

    // lấy biến từ .env
    const appName = this.configService.get<string>('APP_NAME');
    const supportEmail = this.configService.get<string>('SUPPORT_EMAIL');

    // gửi email kích hoạt
    await this.sendgridService.sendMail({
      to: user.email,
      subject: `Kích hoạt tài khoản - ${appName}`,
      template: 'register.hbs',
      context: {
        name: user.name || user.email,
        activationCode: codeId,
        appName: appName,
        supportEmail: supportEmail,
      },
    });

    return { _id: user._id };
  }

  async handleReactivate(email: string) {
    const user = await this.userModel.findOne({ email });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.isActive) {
      throw new BadRequestException('Account has been activated');
    }

    const codeId = uuidv4();
    await user.updateOne({
      codeId: codeId,
      codeExpired: dayjs().add(5, 'minute'),
    });

    const appName = this.configService.get<string>('APP_NAME');
    const supportEmail = this.configService.get<string>('SUPPORT_EMAIL');

    await this.sendgridService.sendMail({
      to: user.email,
      subject: `Kích hoạt tài khoản - ${appName}`,
      template: 'reactivate.hbs',
      context: {
        name: user.name || user.email,
        activationCode: codeId,
        appName: appName,
        supportEmail: supportEmail,
      },
    });

    return { _id: user._id };
  }
  // xác thực tài khoản
  async handleVerifyAccount(verifyAccountDto: VerifyAccountDto) {
    // tìm user theo _id và codeId
    const user = await this.userModel.findOne({
      _id: verifyAccountDto._id,
      codeId: verifyAccountDto.code,
    });
    if (!user) {
      throw new BadRequestException('The code is invalid or expired.');
    }

    const isBeforeCheck = dayjs().isBefore(user.codeExpired);
    // kiểm tra hạn code
    if (isBeforeCheck) {
      await this.userModel.updateOne(
        { _id: verifyAccountDto._id },
        {
          isActive: true,
        },
      );
      return isBeforeCheck;
    } else {
      throw new BadRequestException('The code is invalid or expired.');
    }
  }
  async handleForgotPassword(email: string) {
    // console.log(">>> email from FE: ", email);
    // return

    const user = await this.userModel.findOne({ email });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    const codeId = uuidv4();
    await user.updateOne({
      codeId: codeId,
      codeExpired: dayjs().add(5, 'minute'),
    });
    const appName = this.configService.get<string>('APP_NAME');
    const supportEmail = this.configService.get<string>('SUPPORT_EMAIL');

    await this.sendgridService.sendMail({
      to: user.email,
      subject: `Đổi mật khẩu - ${appName}`,
      template: 'change-password.hbs',
      context: {
        name: user.name || user.email,
        activationCode: codeId,
        appName: appName,
        supportEmail: supportEmail,
      },
    });
    return { _id: user._id, email: user.email };
  }

  async handleResetPassword(resetPasswordAuthDto: ResetPasswordAuthDto) {
    const { email, password, confirmPassword, code } = resetPasswordAuthDto;

    if (password !== confirmPassword) {
      throw new BadRequestException(
        'Password and confirm password are incorrect.',
      );
    }

    const user = await this.userModel.findOne({ email });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (code !== user.codeId) {
      throw new BadRequestException('The code is invalid');
    }

    const isBeforeCheck = dayjs().isBefore(user.codeExpired);
    if (isBeforeCheck) {
      const newPassword = await hashPasswordHelper(password);

      await user.updateOne({
        password: newPassword,
      });
      return { isBeforeCheck };
    } else {
      throw new BadRequestException('The code is invalid or expired.');
    }
    // return { _id: user._id, email: user.email };
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid user id');
    }
    const updatedUser = await this.userModel
      .findByIdAndUpdate(id, dto, { new: true })
      .select('-password');
    if (!updatedUser) {
      throw new NotFoundException(`User with id ${id} not found`);
    }
    return updatedUser;
  }
  async findOrCreateGoogleUser(data: {
    email: string;
    googleId: string;
    name?: string;
  }) {
    const { email, googleId, name } = data;

    // trường hợp 1: user đã từng đăng nhập bằng google trước đó
    // tìm theo googleId vì đây là định danh duy nhất và bất biến từ google
    let user = await this.userModel.findOne({ googleId });

    if (user) return user;

    // trường hợp 2: user đã có tài khoản đăng ký bằng email thủ công
    // ghép googleId vào tài khoản cũ để hợp nhất hai phương thức đăng nhập
    user = await this.userModel.findOne({ email });

    if (user) {
      // chỉ gán googleId nếu chưa có, tránh ghi đè nếu đã liên kết trước đó
      if (!user.googleId) {
        user.googleId = googleId;
      }
      await user.save();
      return user;
    }

    // trường hợp 3: user hoàn toàn mới, tạo tài khoản với accountType là google
    return this.userModel.create({
      email,
      googleId,
      name,
      accountType: AccountType.GOOGLE,
    });
  }
}
