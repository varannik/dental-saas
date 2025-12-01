import { UserRepository } from '../repositories/user.repository';

export class UserService {
  private userRepository: UserRepository;

  constructor() {
    this.userRepository = new UserRepository();
  }

  async list() {
    return this.userRepository.findAll();
  }

  async getById(id: string) {
    return this.userRepository.findById(id);
  }

  async update(id: string, data: Record<string, unknown>) {
    return this.userRepository.update(id, data);
  }

  async delete(id: string) {
    return this.userRepository.delete(id);
  }

  async getRoles(userId: string) {
    return this.userRepository.getRoles(userId);
  }

  async updateRoles(userId: string, roles: string[]) {
    return this.userRepository.updateRoles(userId, roles);
  }
}

