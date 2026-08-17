import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Algorithm, hash, verify } from '@node-rs/argon2';
import type { AppConfig } from '../config/configuration';

/**
 * The only hashing dependency in the codebase — Argon2id for both user
 * passwords and refresh tokens. Cost parameters come from env so they can be
 * raised on bigger production hardware without a code change.
 */
@Injectable()
export class PasswordService {
  private readonly opts: {
    algorithm: Algorithm;
    memoryCost: number;
    timeCost: number;
    parallelism: number;
  };

  /** A real Argon2id hash of a random string, used to burn time on unknown emails. */
  private dummyHash?: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.opts = {
      algorithm: Algorithm.Argon2id,
      memoryCost: this.config.get('argon2.memoryCost', { infer: true }),
      timeCost: this.config.get('argon2.timeCost', { infer: true }),
      parallelism: this.config.get('argon2.parallelism', { infer: true }),
    };
  }

  hash(plain: string): Promise<string> {
    return hash(plain, this.opts);
  }

  async verify(hashed: string, plain: string): Promise<boolean> {
    try {
      return await verify(hashed, plain, this.opts);
    } catch {
      return false; // malformed hash in the database is a failed verify, not a 500
    }
  }

  /**
   * Timing-safe login: run a real verify even when the email is unknown, so the
   * response time cannot be used to enumerate registered addresses.
   */
  async burnTime(plain: string): Promise<void> {
    this.dummyHash ??= await this.hash('argon2id-timing-equalizer');
    await this.verify(this.dummyHash, plain);
  }
}
