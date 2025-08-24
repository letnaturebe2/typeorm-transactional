import { Injectable, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { User } from '../../../entity/user.model';
import { Organization } from '../../../entity/organization.model';
import { NestJSOrganizationService } from './organization.service';
import { NestJSUserService } from './user.service';
import {BaseTransactionalService, SignupDto, Transactional} from "../../../../src";

@Injectable()
export class NestJSSignupService extends BaseTransactionalService {
  constructor(
    @Inject('DATA_SOURCE') protected readonly dataSource: DataSource,
    private readonly organizationService: NestJSOrganizationService,
    private readonly userService: NestJSUserService,
  ) {
    super(dataSource);
  }

  @Transactional()
  async signup(signupData: SignupDto): Promise<{ organization: Organization; user: User }> {
    return await this.performSignup(signupData);
  }

  async signupWithoutTransaction(signupData: SignupDto): Promise<{ organization: Organization; user: User }> {
    return await this.performSignup(signupData);
  }

  /**
   * Performs the actual signup logic in a private method
   * Transaction handling depends on whether the calling method has @Transactional decorator
   */
  private async performSignup(signupData: SignupDto): Promise<{ organization: Organization; user: User }> {
    // 1. Create organization
    const organization = await this.organizationService.createOrganization({
      organizationId: signupData.organizationId,
      isEnterprise: false,
    });

    // 2. Create user
    const user = await this.userService.createUser({
      userId: signupData.userId,
      name: signupData.userName,
    });

    // 3. Link user to organization
    const userRepo = this.getRepository(User);
    user.organization = organization;
    await userRepo.save(user);

    return { organization, user };
  }
}