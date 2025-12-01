import { db } from '../db';
import { users } from '../db/schema';
import { eq } from 'drizzle-orm';

interface CreateUserDto {
  email: string;
  password: string;
  name: string;
  emailVerificationToken?: string;
}

export class UserRepository {
  async create(dto: CreateUserDto) {
    const [user] = await db
      .insert(users)
      .values({
        email: dto.email,
        password: dto.password,
        name: dto.name,
        emailVerificationToken: dto.emailVerificationToken,
      })
      .returning();
    return user;
  }

  async findById(id: string) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async findByEmail(email: string) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async findByPasswordResetToken(token: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.passwordResetToken, token));
    return user;
  }

  async findByEmailVerificationToken(token: string) {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.emailVerificationToken, token));
    return user;
  }

  async setPasswordResetToken(userId: string, token: string) {
    await db
      .update(users)
      .set({ 
        passwordResetToken: token,
        passwordResetExpires: new Date(Date.now() + 3600000), // 1 hour
      })
      .where(eq(users.id, userId));
  }

  async updatePassword(userId: string, hashedPassword: string) {
    await db
      .update(users)
      .set({ 
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetExpires: null,
      })
      .where(eq(users.id, userId));
  }

  async markEmailVerified(userId: string) {
    await db
      .update(users)
      .set({ 
        emailVerified: true,
        emailVerificationToken: null,
      })
      .where(eq(users.id, userId));
  }
}

