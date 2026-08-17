import { Module } from '@nestjs/common';
import { TablesController } from './tables.controller';
import { TablesService } from './tables.service';
import { TableAccessGuard } from '../../common/guards/table-access.guard';

@Module({
  controllers: [TablesController],
  providers: [TablesService, TableAccessGuard],
  exports: [TablesService],
})
export class TablesModule {}
