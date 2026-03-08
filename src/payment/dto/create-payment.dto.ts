import {
  IsString,
  IsNotEmpty,
  IsNumberString,
  IsOptional,
} from 'class-validator';
export class CreatePaymentDto {}

// vnpay-return.dto.ts

export class VNPayReturnDto {
  @IsNumberString()
  @IsNotEmpty()
  vnp_Amount: string; // 64900000

  @IsString()
  @IsNotEmpty()
  vnp_BankCode: string; // VNPAY

  @IsString()
  @IsNotEmpty()
  vnp_CardType: string; // QRCODE

  @IsString()
  @IsNotEmpty()
  vnp_OrderInfo: string; // thanh toan don hang ...

  @IsNumberString()
  @IsNotEmpty()
  vnp_PayDate: string; // 20260307221055

  @IsString()
  @IsNotEmpty()
  vnp_ResponseCode: string; // 24 = user hủy, 00 = thành công

  @IsString()
  @IsNotEmpty()
  vnp_TmnCode: string;

  @IsString()
  @IsNotEmpty()
  vnp_TransactionNo: string; // 0 nếu thất bại

  @IsString()
  @IsNotEmpty()
  vnp_TransactionStatus: string; // 02 = thất bại, 00 = thành công

  @IsString()
  @IsNotEmpty()
  vnp_TxnRef: string; // order._id

  @IsString()
  @IsNotEmpty()
  vnp_SecureHash: string; // hash để verify

  @IsOptional()
  @IsString()
  vnp_BankTranNo?: string;
}
