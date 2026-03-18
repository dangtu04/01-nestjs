import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import aqp from 'api-query-params';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category } from './schemas/category.schema';
import { generateUniqueSlug } from '@/helpers/utils';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel(Category.name) private categoryModel: Model<Category>,
  ) {}

  async create(createCategoryDto: CreateCategoryDto) {
    const { name, parentId } = createCategoryDto;
    let level = 0;
    if (parentId) {
      if (!Types.ObjectId.isValid(parentId)) {
        throw new BadRequestException('Invalid parent category id');
      }
      const category = await this.categoryModel
        .findById(parentId, 'level')
        .lean();
      level = category ? category.level + 1 : 0;
    }
    // Generate unique slug
    const slug = await generateUniqueSlug(name, this.categoryModel);

    try {
      const category = await this.categoryModel.create({
        ...createCategoryDto,
        level,
        slug,
      });

      return { _id: category._id };
    } catch (error) {
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

    const totalItems = await this.categoryModel.countDocuments(filter);
    const totalPages = Math.ceil(totalItems / pageSize);
    const skip = (+current - 1) * +pageSize;

    const results = await this.categoryModel
      .find(filter)
      .limit(pageSize)
      .skip(skip)
      .sort(sort as any)
      .populate('parentId', 'name')
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
      throw new BadRequestException('Invalid category id');
    }
    const category = await this.categoryModel.findById(id);
    if (!category) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }
    return category;
  }

  async update(id: string, updateCategoryDto: UpdateCategoryDto) {
    // 1. Validate id
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid category id');
    }

    // 2. Lấy category hiện tại
    const existingCategory = await this.categoryModel.findById(id).lean();
    if (!existingCategory) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }

    const updateData: any = {};
    let needUpdateChildren = false; // flag để biết có cần update children không

    // 3. Xử lý parentId và level
    const { parentId } = updateCategoryDto;

    if (parentId !== undefined) {
      if (parentId === null) {
        // Chuyển thành category gốc
        updateData.parentId = null;
        updateData.level = 0;
        needUpdateChildren = true; // Level thay đổi → cần update children
      } else {
        // Validate parentId
        if (!Types.ObjectId.isValid(parentId)) {
          throw new BadRequestException('Invalid parent category id');
        }

        // Prevent circular reference
        if (parentId === id) {
          throw new BadRequestException('Category cannot be its own parent');
        }

        // Kiểm tra parent có tồn tại không
        const parentCategory = await this.categoryModel
          .findById(parentId)
          .lean();

        if (!parentCategory) {
          throw new NotFoundException(`Parent category not found`);
        }

        const newLevel = parentCategory.level + 1;
        updateData.parentId = parentId;
        updateData.level = newLevel;

        // Nếu level thay đổi → cần update children
        if (newLevel !== existingCategory.level) {
          needUpdateChildren = true;
        }
      }
    }

    // 4. Xử lý name và slug
    if (
      updateCategoryDto.name &&
      updateCategoryDto.name !== existingCategory.name
    ) {
      updateData.name = updateCategoryDto.name;
      updateData.slug = await generateUniqueSlug(
        updateCategoryDto.name,
        this.categoryModel,
      );
    }

    // 5. Copy các field còn lại
    if (updateCategoryDto.order !== undefined) {
      updateData.order = updateCategoryDto.order;
    }
    if (updateCategoryDto.isActive !== undefined) {
      updateData.isActive = updateCategoryDto.isActive;
    }

    // 6. Update category hiện tại
    const updatedCategory = await this.categoryModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true },
    );

    // 7. nếu level thay đổi thì update level cho tất cả children
    if (needUpdateChildren) {
      await this.updateChildrenLevelsRecursive(id, updatedCategory.level);
    }

    return {
      message: 'Update category successfully!',
      data: updatedCategory,
    };
  }

  // Hàm đệ quy cập nhật level cho tất cả children
  private async updateChildrenLevelsRecursive(
    parentId: string,
    parentLevel: number,
  ): Promise<void> {
    const children = await this.categoryModel
      .find({ parentId: parentId })
      .lean();

    if (children.length === 0) return;

    const newChildLevel = parentLevel + 1;

    // Update tất cả children trực tiếp
    await this.categoryModel.updateMany(
      { parentId: parentId },
      { level: newChildLevel },
    );

    // Đệ quy update children của children
    for (const child of children) {
      await this.updateChildrenLevelsRecursive(
        child._id.toString(),
        newChildLevel,
      );
    }
  }

  async remove(id: string) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid category id');
    }
    const deletedCategory = await this.categoryModel.findByIdAndDelete(id);
    if (!deletedCategory) {
      throw new NotFoundException(`Category with id ${id} not found`);
    }
    return {
      message: 'Delete category successfully!',
    };
  }

  async getAllCategoriesForSelect() {
    const results = await this.categoryModel
      .find()
      .select('_id name')
      .lean()
      .exec();
    return {
      results,
    };
  }

  async getAllCategoriesForUser() {
    const results = await this.categoryModel
      .find({ isActive: true }, '_id name')
      .lean()
      .exec();
    return {
      results,
    };
  }
}
