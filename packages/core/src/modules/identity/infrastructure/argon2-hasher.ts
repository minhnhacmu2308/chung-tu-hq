import { hash, verify } from "@node-rs/argon2";
import type { PasswordHasher } from "../application/ports.js";

export class Argon2Hasher implements PasswordHasher {
  /** Hash argon2id thật của một chuỗi ngẫu nhiên – chỉ để so sánh "giả" khi email không tồn tại (xem PasswordHasher.dummyHash). */
  readonly dummyHash = "$argon2id$v=19$m=19456,t=2,p=1$8whGHvXh7xEXvg5HliqjMA$7VSM+wtJ39TpGBROiCXWvVn/lDrcfHGDdGmi/MrR3uo";
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
