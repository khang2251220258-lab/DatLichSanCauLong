import { defineConfig } from 'prisma/config';
import { getPrismaCliUrl } from './src/config/database.js';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: { url: getPrismaCliUrl() },
});
