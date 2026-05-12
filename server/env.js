import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(here, '../.env');
dotenv.config({ path: envPath });
