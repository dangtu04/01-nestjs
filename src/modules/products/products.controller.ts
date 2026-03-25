import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UploadedFile,
  UseInterceptors,
  Query,
  Put,
  UploadedFiles,
} from '@nestjs/common';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto, UpdateVariantsDto } from './dto/update-product.dto';
import { Public, Roles } from '@/decorator/customize';
import { UserRole } from '@/enum/user.enum';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('thumbnail'))
  create(
    @Body() createProductDto: CreateProductDto,
    @UploadedFile() file: Express.Multer.File, // Optional file
  ) {
    return this.productsService.create(createProductDto, file);
  }

  @Get()
  findAll(
    @Query() query: string,
    @Query('current') current: string,
    @Query('pageSize') pageSize: string,
  ) {
    return this.productsService.findAll(query, +current, +pageSize);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN)
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FileInterceptor('thumbnail'))
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.productsService.update(id, updateProductDto, file);
  }

  @Put(':id/variants')
  @Roles(UserRole.ADMIN)
  async updateVariants(
    @Param('id') id: string,
    @Body() updateVariantsDto: UpdateVariantsDto,
  ) {
    return this.productsService.updateVariants(id, updateVariantsDto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }

  @Post(':id/images-detail')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FilesInterceptor('images'))
  bulkAddImages(
    @Param('id') id: string,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.productsService.bulkAddImages(id, files);
  }

  @Get(':id/images-detail')
  @Public()
  findAllImages(@Param('id') id: string) {
    return this.productsService.findAllImages(id);
  }

  @Patch(':id/images-detail')
  @Roles(UserRole.ADMIN)
  @UseInterceptors(FilesInterceptor('images'))
  bulkUpdateImages(
    @Param('id') id: string,
    @UploadedFiles() files?: Express.Multer.File[],
    @Body('publicIdsToKeep') publicIdsToKeep?: string[],
  ) {
    return this.productsService.bulkUpdateImages(id, files, publicIdsToKeep);
  }

  @Get('list/new')
  @Public()
  findNewProducts(
    @Query() query: string,
    @Query('current') current: string,
    @Query('pageSize') pageSize: string,
  ) {
    return this.productsService.findNewProducts(query, +current, +pageSize);
  }

  @Get('detail/:slug')
  @Public()
  getProductDetail(@Param('slug') slug: string) {
    return this.productsService.getProductDetail(slug);
  }

  // tìm kiếm sản phẩm theo từ khóa
  @Get('search/keyword')
  @Public()
  searchByKeyword(
    @Query('keyword') keyword: string,
    @Query('current') current: string,
    @Query('pageSize') pageSize: string,
  ) {
    // console.log('>>>>>>>> keyword: ', keyword);
    return this.productsService.searchByKeyword(keyword, +current, +pageSize);
  }

  // get danh sách sản phẩm public
  @Get('public/all')
  @Public()
  getAllProductsForUser(
    @Query() query: string,
    @Query('current') current: string,
    @Query('pageSize') pageSize: string,
  ) {
    return this.productsService.getAllProductsForUser(
      query,
      +current,
      +pageSize,
    );
  }

  @Get('category/:categoryId')
  @Public()
  findByCategoryId(
    @Param('categoryId') categoryId: string,
    @Query('current') current: string,
    @Query('pageSize') pageSize: string,
  ) {
    return this.productsService.findByCategoryId(
      categoryId,
      +current,
      +pageSize,
    );
  }
}
