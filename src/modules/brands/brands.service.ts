import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateBrandDto } from './dto/create-brand.dto';
import { UpdateBrandDto } from './dto/update-brand.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Brand } from './schemas/brand.schema';
import { Model, Types } from 'mongoose';
import aqp from 'api-query-params';
import { generateUniqueSlug } from '@/helpers/utils';

@Injectable()
export class BrandsService {
  constructor(@InjectModel(Brand.name) private brandModel: Model<Brand>) {}

  async create(createBrandDto: CreateBrandDto) {
    const { name } = createBrandDto;

    // tạo slug unique
    const slug = await generateUniqueSlug(name, this.brandModel);

    try {
      // create brand
      const brand = await this.brandModel.create({
        ...createBrandDto,
        slug,
      });

      return { _id: brand._id };
    } catch (error) {
      // fallback nếu trùng slug do race condition
      if (error.code === 400) {
        throw new BadRequestException('Slug already exists');
      }
      throw error;
    }
  }

  async findAll(query: string, current: number, pageSize: number) {
    const { filter, sort } = aqp(query);
    if (filter.current) delete filter.current;
    if (filter.pageSize) delete filter.pageSize;
    if (!current) current = 1;
    if (!pageSize) pageSize = 10;

    const totalItems = await this.brandModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / pageSize);
    const skip = (+current - 1) * +pageSize;

    const results = await this.brandModel
      .find(filter)
      .limit(pageSize)
      .skip(skip)
      .sort(sort as any);
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
      throw new BadRequestException('Invalid brand id');
    }
    const brand = await this.brandModel.findById(id);
    if (!brand) {
      throw new NotFoundException(`Brand with id ${id} not found`);
    }
    return brand;
  }

  async update(id: string, updateBrandDto: UpdateBrandDto) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid brand id');
    }

    const updateData: any = { ...updateBrandDto };

    // chỉ gen slug khi có name
    if (updateBrandDto.name) {
      // Chỉ query field name
      const oldBrand = await this.brandModel.findById(id, 'name').lean(); // .clean để plain object

      if (!oldBrand) {
        throw new NotFoundException(`Brand with id ${id} not found`);
      }

      // Chỉ gen slug nếu name thay đổi
      if (updateBrandDto.name !== oldBrand.name) {
        updateData.slug = await generateUniqueSlug(
          updateBrandDto.name,
          this.brandModel,
        );
      }
    }
    const updatedBrand = await this.brandModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true },
    );

    // double check
    if (!updatedBrand) {
      throw new NotFoundException(`Brand with id ${id} not found`);
    }

    return {
      message: 'Update brand successfully!',
    };
  }

  async remove(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid brand id');
    }
    const deletedBrand = await this.brandModel.findByIdAndDelete(id);
    if (!deletedBrand) {
      throw new NotFoundException(`Brand with id ${id} not found`);
    }
    return {
      message: 'Delete brand successfully!',
    };
  }

  async getAllBrandsForSelect() {
    const results = await this.brandModel
      .find()
      .select('_id name')
      .lean()
      .exec();
    return {
      results,
    };
  }

  async getAllBrandsForUser() {
    const results = await this.brandModel
      .find({ isActive: true }, '_id name')
      .lean()
      .exec();
    return {
      results,
    };
  }
}
