import type { DataSource } from 'typeorm';
import {
  BaseTransactionalService,
  Transactional,
} from '@/decorators/transactional';
import { User } from '../entity/user.model';
import type { CreateUserDto } from '../types/dto';

export class UserService extends BaseTransactionalService {
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  @Transactional()
  async createUser(userData: CreateUserDto): Promise<User> {
    const userRepo = this.getRepository(User);

    const user = new User();
    user.userId = userData.userId;
    user.name = userData.name;
    user.isAdmin = userData.isAdmin || false;

    return await userRepo.save(user);
  }

  @Transactional({ propagation: 'REQUIRES_NEW' })
  async createUserWithRequiresNew(userData: CreateUserDto): Promise<User> {
    return await this.createUser(userData);
  }
}
