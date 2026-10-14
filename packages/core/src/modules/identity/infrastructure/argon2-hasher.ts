import { hash, verify } from "@node-rs/argon2";
import type { PasswordHasher } from "../application/ports.js";

export class Argon2Hasher implements PasswordHasher {
  hash(password: string) {
    return hash(password);
  }
  async verify(hashed: string, password: string) {
    try {
      return await verify(hashed, password);
    } catch {
      return false;
    }
  }
}
