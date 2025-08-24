import { Injectable, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from '../../../entity/user.model';
import { Organization } from '../../../entity/organization.model';
import {BaseTransactionalService, Transactional} from "../../../../src";

export interface CreateUserDto {
  userId: string;
  name: string;
  organizationId?: string;
  isAdmin?: boolean;
}

@Injectable()
export class NestJSUserService extends BaseTransactionalService {
  constructor(@Inject('DATA_SOURCE') protected readonly dataSource: DataSource) {
    super(dataSource);
  }

  @Transactional()
  async createUser(userData: CreateUserDto): Promise<User> {
    const userRepository = this.getRepository(User);
    
    const user = userRepository.create({
      userId: userData.userId,
      name: userData.name,
      isAdmin: userData.isAdmin || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // If organizationId is provided, link to organization
    if (userData.organizationId) {
      const orgRepository = this.getRepository(Organization);
      const organization = await orgRepository.findOneBy({ 
        organizationId: userData.organizationId 
      });
      
      if (organization) {
        user.organization = organization;
      }
    }

    return await userRepository.save(user);
  }

  @Transactional({ propagation: 'REQUIRES_NEW' })
  async createUserWithRequiresNew(userData: CreateUserDto): Promise<User> {
    return await this.createUser(userData);
  }
}