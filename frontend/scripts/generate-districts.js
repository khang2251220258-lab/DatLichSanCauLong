import { writeFile, mkdir } from 'node:fs/promises';
import { supportedDistricts } from '../../backend/src/modules/facilities/districts.js';
const directory = new URL('../src/generated/', import.meta.url);
await mkdir(directory, { recursive: true });
await writeFile(new URL('districts.json', directory), JSON.stringify(supportedDistricts, null, 2) + '\n');
