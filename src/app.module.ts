import { Module } from '@nestjs/common';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { UsersModule } from '@/modules/users/users.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '@/auth/auth.module';
import { MailModule } from './mail/mail.module';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TransformInterceptor } from '@/core/transform.interceptor';
import { BrandsModule } from '@/modules/brands/brands.module';
import { CategoriesModule } from '@/modules/categories/categories.module';
import { SizesModule } from '@/modules/sizes/sizes.module';
import { CloudinaryModule } from '@/modules/cloudinary/cloudinary.module';
import { ProductsModule } from '@/modules/products/products.module';
import { CartsModule } from './modules/carts/carts.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentModule } from './payment/payment.module';
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    UsersModule,
    BrandsModule,
    CategoriesModule,
    SizesModule,
    CloudinaryModule,
    ProductsModule,
    CartsModule,

    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),

    AuthModule,
    MailModule,
    OrdersModule,
    PaymentModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: TransformInterceptor,
    },
  ],
})
export class AppModule {}
