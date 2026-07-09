import { DataSource } from 'typeorm';
import { dataSourceOptions } from './ormconfig';

export default new DataSource(dataSourceOptions);
