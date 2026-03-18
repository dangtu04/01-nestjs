import { Product } from './schemas/product.schema';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto, UpdateVariantsDto } from './dto/update-product.dto';
import mongoose, { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { generateUniqueSlug } from '@/helpers/utils';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import aqp from 'api-query-params';
import { Types } from 'mongoose';
import { Size } from '../sizes/schemas/size.schema';
import { ProductImage } from './schemas/product.image.schema';
import { ProductStatus } from '@/enum/product.enum';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel(Product.name) private productModel: Model<Product>,
    @InjectModel(Size.name) private sizeModel: Model<Size>,
    @InjectModel(ProductImage.name)
    private productImageModel: Model<ProductImage>,
    private readonly cloudinaryService: CloudinaryService,
  ) {}

  async create(createProductDto: CreateProductDto, file?: Express.Multer.File) {
    // 1. Upload ảnh nếu có
    let thumbnail = null;
    if (file) {
      thumbnail = await this.cloudinaryService.uploadImage(file, 'products');
    }

    // 2. Generate slug
    const slug = await generateUniqueSlug(
      createProductDto.name,
      this.productModel,
    );

    // 3. Tạo product
    const newProduct = await this.productModel.create({
      ...createProductDto,
      slug,
      thumbnail,
      status: ProductStatus.Draft,
      variants: [],
    });

    return newProduct;
  }

  async findAll(query: string, current: number, pageSize: number) {
    const { filter, sort } = aqp(query);
    if (filter.current) delete filter.current;
    if (filter.pageSize) delete filter.pageSize;
    if (!current || current < 1) current = 1;
    if (!pageSize || pageSize > 100) pageSize = 10;

    const totalItems = await this.productModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / pageSize);
    const skip = (+current - 1) * +pageSize;

    const results = await this.productModel
      .find(filter)
      .select('_id name price thumbnail status categoryIds brandId')
      .limit(pageSize)
      .skip(skip)
      .sort(sort as any)
      .populate('categoryIds', 'name')
      .populate('brandId', 'name')
      .exec();

    return {
      meta: {
        current: current,
        pageSize: pageSize,
        pages: totalPages,
        totals: totalItems,
      },
      results,
    };
  }

  async findOne(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid product id');
    }
    const product = await this.productModel.findById(id);
    if (!product) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }
    return product;
  }

  async update(
    id: string,
    updateProductDto: UpdateProductDto,
    file?: Express.Multer.File,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid product id');
    }

    const product = await this.productModel.findById(id);
    if (!product) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }

    const updateData: any = { ...updateProductDto };

    // If name changed, regenerate slug
    if (
      updateProductDto.name &&
      updateProductDto.name.trim() &&
      updateProductDto.name !== product.name
    ) {
      updateData.slug = await generateUniqueSlug(
        updateProductDto.name,
        this.productModel,
      );
    }

    // If a file is provided, replace the image on Cloudinary (delete old, upload new)
    if (file) {
      try {
        const uploaded = await this.cloudinaryService.replaceImage(
          product.thumbnail?.publicId,
          file,
          'products',
        );
        updateData.thumbnail = uploaded;
      } catch (error) {
        console.error('Failed to replace thumbnail', error);
        // If upload failed, don't block other updates — rethrow if you prefer
      }
    } else if (
      Object.prototype.hasOwnProperty.call(updateProductDto, 'thumbnail')
    ) {
      // If client explicitly set thumbnail null or provided a thumbnail object in body
      const newThumb = (updateProductDto as any).thumbnail;
      if (newThumb === null) {
        if (product.thumbnail && product.thumbnail.publicId) {
          try {
            await this.cloudinaryService.deleteImage(
              product.thumbnail.publicId,
            );
          } catch (error) {
            console.error('Failed to delete old thumbnail', error);
          }
        }
        updateData.thumbnail = null;
      }
    }

    await this.productModel
      .findByIdAndUpdate(id, updateData, { new: true })
      .populate('categoryIds', 'name')
      .populate('brandId', 'name')
      .exec();

    return {
      message: 'Update product successfully!',
    };
  }

  async remove(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid product id');
    }

    const deleted = await this.productModel.findByIdAndDelete(id as any);
    if (!deleted) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }

    // Nếu có thumbnail, xóa ảnh trên Cloudinary
    try {
      if (deleted.thumbnail && deleted.thumbnail.publicId) {
        await this.cloudinaryService.deleteImage(deleted.thumbnail.publicId);
      }
    } catch (error) {
      // Không block việc xóa product nếu xóa ảnh thất bại
      console.error(
        'Failed to delete product thumbnail from cloudinary',
        error,
      );
    }

    return { message: 'Delete product successfully!' };
  }

  // async updateVariants(id: string, updateVariantsDto: UpdateVariantsDto) {
  //   if (!Types.ObjectId.isValid(id)) {
  //     throw new BadRequestException('Invalid product id');
  //   }

  //   const product = await this.productModel.findById(id);
  //   if (!product) {
  //     throw new NotFoundException(`Product with id ${id} not found`);
  //   }
  //   await this.productModel
  //     .updateOne(
  //       { _id: id },
  //       { $set: { variants: updateVariantsDto.variants } },
  //     )
  //     .exec();
  //   return {
  //     message: 'Update variants successfully!',
  //   };
  // }
  async updateVariants(id: string, updateVariantsDto: UpdateVariantsDto) {
    // validate product ID
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid product id');
    }

    // kiểm tra product tồn tại
    const product = await this.productModel.findById(id);
    if (!product) {
      throw new NotFoundException(`Product with id ${id} not found`);
    }

    // lấy tất cả sizeIds từ request
    const sizeIds = updateVariantsDto.variants.map((v) => v.sizeId);

    // validate tất cả sizeIds hợp lệ
    const validSizeIds = sizeIds.filter((id) => Types.ObjectId.isValid(id));
    if (validSizeIds.length !== sizeIds.length) {
      throw new BadRequestException('One or more sizeIds are invalid');
    }

    // query tất cả sizes từ database
    const sizes = await this.sizeModel
      .find({
        _id: { $in: sizeIds },
        isActive: true, // chỉ cho phép sizes đang active
      })
      .exec();

    // kiểm tra xem tất cả sizes có tồn tại không
    if (sizes.length !== sizeIds.length) {
      const foundSizeIds = sizes.map((s) => s._id.toString());
      const missingSizeIds = sizeIds.filter((id) => !foundSizeIds.includes(id));
      throw new BadRequestException(
        `Sizes not found or inactive: ${missingSizeIds.join(', ')}`,
      );
    }

    // tạo Map để lookup nhanh
    const sizeMap = new Map(sizes.map((s) => [s._id.toString(), s]));

    // build variants với đầy đủ thông tin
    const variants = updateVariantsDto.variants.map((v) => {
      const size = sizeMap.get(v.sizeId);

      return {
        sizeId: new Types.ObjectId(v.sizeId),
        sizeCode: size.code,
        sizeName: size.name,
        quantity: v.quantity,
        isAvailable: v.quantity > 0,
      };
    });

    // update product
    await this.productModel
      .updateOne({ _id: id }, { $set: { variants } })
      .exec();

    // lấy product mới để trả về
    const updatedProduct = await this.productModel.findById(id).exec();

    return {
      message: 'Update variants successfully!',
      data: updatedProduct,
    };
  }

  async bulkAddImages(id: string, files?: Express.Multer.File[]) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid product id');
    }

    if (!files || files.length === 0) {
      throw new BadRequestException('No images provided');
    }

    const images = await this.cloudinaryService.uploadMultipleImages(
      files,
      'details',
    );

    await Promise.all(
      images.map((img) =>
        this.productImageModel.create({
          productId: id,
          publicId: img.publicId,
          secureUrl: img.secureUrl,
        }),
      ),
    );
    return {
      message: 'Add images successfully!',
    };
  }

  async findAllImages(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid product id');
    }

    const images = await this.productImageModel
      .find({ productId: id })
      .select('publicId secureUrl')
      .exec();
    return {
      results: images,
    };
  }

  async bulkUpdateImages(
    id: string,
    files?: Express.Multer.File[],
    publicIdsToKeep?: string | string[],
  ) {
    // Validate product ID
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid product id');
    }

    // Lấy tất cả publicId cũ của product
    const oldImages = await this.productImageModel
      .find({ productId: id })
      .select('publicId')
      .exec();

    const oldPublicIds = oldImages.map((img) => img.publicId);

    // ép sang mảng
    const keepIds: string[] = Array.isArray(publicIdsToKeep)
      ? publicIdsToKeep
      : publicIdsToKeep
        ? [publicIdsToKeep]
        : [];

    // Gọi Cloudinary service
    const updatedImages = await this.cloudinaryService.replaceMultipleImages(
      oldPublicIds,
      files ?? [],
      keepIds,
      'details',
    );

    // Xoá toàn bộ document ảnh cũ
    await this.productImageModel.deleteMany({ productId: id });

    // Insert lại ảnh (ảnh giữ + ảnh mới)
    await this.productImageModel.insertMany(
      updatedImages.map((img) => ({
        productId: id,
        publicId: img.publicId,
        secureUrl: img.secureUrl,
      })),
    );

    return {
      message: 'Bulk update images successfully!',
    };
  }

  async findNewProducts(query: string, current: number, pageSize: number) {
    const { filter } = aqp(query);

    // xoá param phân trang khỏi filter
    if (filter.current) delete filter.current;
    if (filter.pageSize) delete filter.pageSize;

    // chỉ lấy sản phẩm active
    filter.status = ProductStatus.Active;

    // default pagination
    if (!current || current < 1) current = 1;
    if (!pageSize || pageSize > 100) pageSize = 10;

    const totalItems = await this.productModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / pageSize);
    const skip = (current - 1) * pageSize;

    const results = await this.productModel
      .find(filter)
      .select('_id name slug price thumbnail')
      .sort({ createdAt: -1 })
      .limit(pageSize)
      .skip(skip)
      // .populate('categoryIds', 'name')
      // .populate('brandId', 'name')
      .exec();

    return {
      meta: {
        current,
        pageSize,
        pages: totalPages,
        totals: totalItems,
      },
      results,
    };
  }

  async getProductDetail(slug: string) {
    const product = await this.productModel
      .findOne({ slug, status: ProductStatus.Active })
      .select('-createdAt -updatedAt -__v')
      .populate('categoryIds', 'name')
      .populate('brandId', 'name')
      .lean()
      .exec();

    if (!product) {
      throw new NotFoundException(
        `Product with slug ${slug} not found or not active`,
      );
    }

    let images: string[] = [];
    try {
      const imagesResult = await this.findAllImages(product._id.toString());
      images = imagesResult?.results?.map((img) => img.secureUrl) || [];
    } catch (error) {
      images = [];
    }

    return {
      product,
      images,
    };
  }

  async getAllProductsForUser(
    query: string,
    current: number,
    pageSize: number,
  ) {
    const { filter, sort } = aqp(query);
    if (filter.current) delete filter.current;
    if (filter.pageSize) delete filter.pageSize;
    if (!current || current < 1) current = 1;
    if (!pageSize || pageSize > 100) pageSize = 10;
    filter.status = ProductStatus.Active;

    const extractFilter = (key: string) => {
      const val = filter[key];
      delete filter[key];
      return val;
    };
    const categoryId = extractFilter('categoryId');
    const brandId = extractFilter('brandId');
    const minPrice = extractFilter('minPrice');
    const maxPrice = extractFilter('maxPrice');

    if (categoryId && mongoose.Types.ObjectId.isValid(categoryId)) {
      filter.categoryIds = categoryId;
    }

    if (brandId && mongoose.Types.ObjectId.isValid(brandId)) {
      filter.brandId = brandId;
    }

    if (minPrice || maxPrice) {
      filter.price = {
        ...(minPrice && { $gte: Number(minPrice) }),
        ...(maxPrice && { $lte: Number(maxPrice) }),
      };
    }
    const totalItems = await this.productModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / pageSize);
    const skip = (+current - 1) * +pageSize;

    const results = await this.productModel
      .find(filter)
      .select('_id name slug price thumbnail.secureUrl')
      .limit(pageSize)
      .skip(skip)
      .sort(sort as any)
      // .populate('categoryIds', 'name')
      // .populate('brandId', 'name')
      .exec();
    return {
      meta: {
        current: current,
        pageSize: pageSize,
        pages: totalPages,
        totals: totalItems,
      },
      results,
    };
  }
}
