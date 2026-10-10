import argon2 from 'argon2';
import { authConfig } from './config.js';
export const passwordOptions = Object.freeze({ ...authConfig.hash, type: argon2.argon2id });
