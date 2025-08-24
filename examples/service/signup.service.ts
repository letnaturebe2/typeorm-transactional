import { DataSource } from 'typeorm';
import { OrganizationService } from './organization.service';
import { UserService } from './user.service';
import {BaseTransactionalService, Transactional} from "@/decorators/transactional";
import {User} from "../entity/user.model";
import {Organization} from "../entity/organization.model";
import {SignupDto} from "../types/dto";

export class SignupService extends BaseTransactionalService {
  constructor(
    dataSource: DataSource,
    protected readonly organizationService: OrganizationService,
    protected readonly userService: UserService
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

  /**
   * Method that calls each operation in separate REQUIRES_NEW transactions
   * If user creation fails after organization creation succeeds, organization won't be rolled back
   */
  @Transactional()
  async signupWithSeparateTransactions(signupData: SignupDto): Promise<{ organization: Organization; user: User }> {
    // 1. Create organization - separate REQUIRES_NEW transaction
    const organization = await this.organizationService.createOrganization({
      organizationId: signupData.organizationId,
      isEnterprise: false,
    });

    // 2. Create user - separate REQUIRES_NEW transaction
    const user = await this.userService.createUserWithRequiresNew({
      userId: signupData.userId,
      name: signupData.userName,
    });

    // 3. Link user to organization - another transaction
    const userRepo = this.getRepository(User);
    user.organization = organization;
    await userRepo.save(user);

    return { organization, user };
  }
}
