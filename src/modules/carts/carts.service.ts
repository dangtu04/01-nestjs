import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { CreateCartDto } from './dto/create-cart.dto';
import { ClientSession, Model, Types } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Product } from '../products/schemas/product.schema';
import { User } from '../users/schemas/user.schema';
import { Cart } from './schemas/cart.schema';
import { CartLimits } from '@/enum/cart.enum.';
import { ProductStatus } from '@/enum/product.enum';
import { UpdateCartItemDto } from './dto/update-cart.dto';

@Injectable()
export class CartsService {
  constructor(
    @InjectModel(Cart.name) private cartModel: Model<Cart>,
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Product.name) private productModel: Model<Product>,
  ) {}
  async addToCart(userId: string, dto: CreateCartDto) {
    const { productId, sizeId } = dto;
    const quantity = Number(dto.quantity);
    // validate dto
    if (
      !Types.ObjectId.isValid(userId) ||
      !Types.ObjectId.isValid(productId) ||
      !Types.ObjectId.isValid(sizeId)
    ) {
      throw new BadRequestException('Id không hợp lệ');
    }

    if (quantity < 1 || quantity > CartLimits.MAX_QUANTITY_PER_ITEM) {
      throw new BadRequestException(
        `Số lượng phải từ 1 đến ${CartLimits.MAX_QUANTITY_PER_ITEM}`,
      );
    }

    // check user
    const user = await this.userModel.findById(userId);
    if (!user) throw new NotFoundException('Không tìm thấy người dùng');

    // check product
    const product = await this.productModel.findById(productId);
    if (!product) throw new NotFoundException('Không tìm thấy sản phẩm');

    // check product active
    if (product.status !== ProductStatus.Active) {
      throw new BadRequestException('Sản phẩm không khả dụng');
    }

    // check size dựa theo size của product đã check trước
    const variant = product.variants.find((v) => v.sizeId.equals(sizeId));
    if (!variant || !variant.isAvailable) {
      throw new BadRequestException('Kích thước không khả dụng');
    }
    // check không quá số lượng trong variant
    if (variant.quantity < quantity) {
      throw new BadRequestException('Số lượng vượt quá tồn kho');
    }

    // get cart, nếu chưa có thì tạo rỗng items
    const cart = await this.cartModel.findOneAndUpdate(
      { userId },
      { $setOnInsert: { userId, items: [], totalItems: 0 } },
      { new: true, upsert: true },
    );

    // check xem có trùng với sản phẩm có trong cart không
    const existingItem = cart.items.find(
      (item) => item.productId.equals(productId) && item.sizeId.equals(sizeId),
    );

    // đã có sản phẩm trong cart
    if (existingItem) {
      const newQty = existingItem.quantity + quantity;
      if (newQty > CartLimits.MAX_QUANTITY_PER_ITEM) {
        throw new BadRequestException(
          `Số lượng tối đa cho mỗi sản phẩm là ${CartLimits.MAX_QUANTITY_PER_ITEM}`,
        );
      }
      existingItem.quantity = newQty;
    } else {
      if (cart.items.length >= CartLimits.MAX_ITEMS) {
        throw new BadRequestException(
          `Giỏ hàng chỉ được phép tối đa ${CartLimits.MAX_ITEMS} sản phẩm`,
        );
      }
      cart.items.push({
        productId: new Types.ObjectId(productId),
        sizeId: new Types.ObjectId(sizeId),
        quantity,
      });

      cart.totalItems += 1;
    }

    await cart.save();

    return {
      message: 'Thêm sản phẩm vào giỏ hàng thành công',
      // cart,
    };
  }

  async getCartByUserId(userId: string, current: number, pageSize: number) {
    // validate đầu vào
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Id không hợp lệ');
    }
    current = +current || 1;
    pageSize = +pageSize || 10;

    if (current < 1) current = 1;
    if (pageSize < 1 || pageSize > CartLimits.MAX_ITEMS) pageSize = 10;

    // tìm cart và populate data liên quan
    const cart = await this.cartModel
      .findOne({ userId })
      .populate({
        path: 'items.productId',
        select: 'name price thumbnail status variants',
      })
      .populate({
        path: 'items.sizeId',
        select: 'name code',
      })
      .lean();

    // cart không hợp lệ hoặc rỗng
    if (!cart || !cart.items || cart.items.length === 0) {
      return {
        meta: {
          current,
          pageSize,
          pages: 0,
          totals: 0,
        },
        results: [],
        totalPrice: 0,
      };
    }

    // enrich items với thông tin variant
    const enrichedItems = cart.items.map((item: any) => {
      const product = item.productId;
      const size = item.sizeId;

      // tìm variant khớp với sizeId
      const variant = product?.variants?.find(
        (v: any) => v.sizeId.toString() === size?._id.toString(),
      );

      return {
        _id: item._id,
        productId: {
          _id: product?._id,
          name: product?.name,
          price: product?.price,
          thumbnail: product?.thumbnail,
          status: product?.status,
        },
        sizeId: {
          _id: size?._id,
          name: size?.name,
          code: size?.code,
        },
        quantity: item.quantity,
        // thông tin variant
        variant: {
          isAvailable: variant?.isAvailable ?? false,
          stock: variant?.quantity ?? 0,
        },

        subtotal: (product?.price ?? 0) * item.quantity,
      };
    });

    //tổng tiền toàn bộ giỏ hàng
    const totalPrice = enrichedItems.reduce(
      (sum, item) => sum + item.subtotal,
      0,
    );

    // tính toán pagination
    const totalItems = enrichedItems.length;
    const totalPages = Math.ceil(totalItems / pageSize);
    const skip = (current - 1) * pageSize;
    const pagedItems = enrichedItems.slice(skip, skip + pageSize);

    return {
      meta: {
        current,
        pageSize,
        pages: totalPages,
        totals: totalItems,
      },
      results: pagedItems,
      totalPrice,
    };
  }

  async updateCartItem(userId: string, dto: UpdateCartItemDto) {
    const { id, newQuantity } = dto;

    // validate newQuantity
    if (newQuantity < 1 || newQuantity > CartLimits.MAX_QUANTITY_PER_ITEM) {
      throw new BadRequestException(
        `Số lượng phải từ 1 đến ${CartLimits.MAX_QUANTITY_PER_ITEM}`,
      );
    }

    // validate userId và id
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Id không hợp lệ');
    }

    // tìm cart và populate product để lấy variants
    const cart = await this.cartModel
      .findOne({ userId })
      .populate({
        path: 'items.productId',
        select: 'status variants',
      })
      .lean();

    if (!cart) {
      throw new NotFoundException('Không tìm thấy giỏ hàng');
    }

    // tìm cart item cần update
    const item = cart.items.find((i: any) => i._id.toString() === id);
    // console.log('>>>>> item: ', item);
    if (!item) {
      throw new NotFoundException('Không tìm thấy sản phẩm trong giỏ hàng');
    }

    // Type casting để access được properties
    const product = item.productId as any;

    // check product status
    if (product.status !== ProductStatus.Active) {
      throw new BadRequestException('Sản phẩm không còn khả dụng');
    }

    // tìm variant tương ứng với sizeId của item
    const variant = product.variants.find(
      (v: any) => v.sizeId.toString() === item.sizeId.toString(),
    );
    // console.log('>>>> variant: ', variant);
    if (!variant) {
      throw new BadRequestException('Kích thước không còn tồn tại');
    }

    // check variant availability
    if (!variant.isAvailable) {
      throw new BadRequestException('Kích thước này hiện không khả dụng');
    }

    // check stock
    if (newQuantity > variant.quantity) {
      throw new BadRequestException(
        `Số lượng vượt quá tồn kho. Chỉ còn ${variant.quantity} sản phẩm`,
      );
    }

    // update quantity trong database
    const updatedCart = await this.cartModel.findOneAndUpdate(
      {
        userId: userId,
        'items._id': new Types.ObjectId(id),
      },
      {
        $set: {
          'items.$.quantity': newQuantity,
        },
      },
      // { new: true },
    );

    if (!updatedCart) {
      throw new BadRequestException('Cập nhật giỏ hàng thất bại');
    }

    return {
      message: 'Cập nhật số lượng thành công',
      // updatedItem: {
      //   id,
      //   newQuantity,
      //   maxStock: variant.quantity,
      // },
    };
  }

  async deleteCartItem(userId: string, id: string) {
    // validate định dạng ObjectId trước khi query
    if (!Types.ObjectId.isValid(userId) || !Types.ObjectId.isValid(id)) {
      throw new BadRequestException(
        'Định dạng Id người dùng hoặc sản phẩm không hợp lệ',
      );
    }

    try {
      const res = await this.cartModel.findOneAndUpdate(
        {
          userId: userId,
          'items._id': new Types.ObjectId(id),
        },
        {
          $pull: {
            items: { _id: new Types.ObjectId(id) },
          },
        },
        // { new: true },
      );

      if (!res) {
        throw new NotFoundException(
          'Không tìm thấy sản phẩm trong giỏ hàng để xóa',
        );
      }

      return {
        statusCode: 200,
        message: 'Xoá sản phẩm khỏi giỏ hàng thành công',
        // data: res,
      };
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      console.error('Lỗi deleteCartItem:', error);

      // trả về lỗi chung
      throw new InternalServerErrorException(
        'Đã có lỗi xảy ra trong quá trình xử lý',
      );
    }
  }

  async clearCartByUserId(userId: string, session: ClientSession) {
    const result = await this.cartModel.findOneAndUpdate(
      { userId: userId },
      {
        $set: {
          items: [],
          totalItems: 0,
        },
      },
      { session },
    );
    if (!result) {
      throw new BadRequestException(
        'Khong tìm thấy giỏ hàng của người dùng này',
      );
    }
  }
}
