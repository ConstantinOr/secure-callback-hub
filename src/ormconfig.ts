import 'dotenv/config';

import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';

const postgresPort = Number(process.env.POSTGRES_PORT ?? 5432);

export const dataSourceOptions: DataSourceOptions = {
  type: 'postgres',
  host: process.env.POSTGRES_HOST ?? 'localhost',
  port: postgresPort,
  username: process.env.POSTGRES_USER ?? 'callback_hub_user',
  password: process.env.POSTGRES_PASSWORD ?? 'callback_hub_password',
  database: process.env.POSTGRES_DB ?? 'callback_hub',
  entities: [__dirname + '/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/persistence/migrations/*{.ts,.js}'],
  synchronize: false,
};

const ormConfig: TypeOrmModuleOptions = dataSourceOptions;

export default ormConfig;
