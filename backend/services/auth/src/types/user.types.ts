export enum Role {
  ADMIN = 'admin',
  DENTIST = 'dentist',
  ASSISTANT = 'assistant',
  RECEPTIONIST = 'receptionist'
}

export interface User {
  id: string;
  tenantId: string;
  email: string;
  passwordHash?: string;
  role: Role;
  firstName?: string;
  lastName?: string;
  isActive: boolean;
  emailVerified: boolean;
  socialProvider?: string;
  socialId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  role: Role;
  firstName?: string;
  lastName?: string;
}

export interface UpdateUserRequest {
  role?: Role;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
}

export interface UserResponse {
  id: string;
  email: string;
  role: Role;
  firstName?: string;
  lastName?: string;
  emailVerified: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
} 