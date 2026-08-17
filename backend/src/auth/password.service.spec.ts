import { ConfigService } from '@nestjs/config';
import { PasswordService } from './password.service';
import type { AppConfig } from '../config/configuration';

/** Lowest legal Argon2id cost — this suite tests behaviour, not hardness. */
const config = {
  get: (key: string) =>
    ({ 'argon2.memoryCost': 8192, 'argon2.timeCost': 1, 'argon2.parallelism': 1 })[key],
} as unknown as ConfigService<AppConfig, true>;

describe('PasswordService', () => {
  const service = new PasswordService(config);

  it('verifies a password it hashed', async () => {
    const hash = await service.hash('password123');
    await expect(service.verify(hash, 'password123')).resolves.toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await service.hash('password123');
    await expect(service.verify(hash, 'password124')).resolves.toBe(false);
  });

  it('salts every hash, so the same input never produces the same output', async () => {
    const [a, b] = await Promise.all([service.hash('password123'), service.hash('password123')]);
    expect(a).not.toBe(b);
    expect(a.startsWith('$argon2id$')).toBe(true);
  });

  it('returns false instead of throwing on a malformed stored hash', async () => {
    await expect(service.verify('not-a-hash', 'password123')).resolves.toBe(false);
  });
});
