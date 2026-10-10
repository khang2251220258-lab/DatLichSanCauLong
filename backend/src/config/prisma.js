import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { getPostgresConfig } from './database.js';

const adapter = new PrismaPg(getPostgresConfig());

export const prisma = new PrismaClient({ adapter, log: [] });
