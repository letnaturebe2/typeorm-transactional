import { DataSource, Repository } from 'typeorm';
import {
  ensureTestDatabaseInitialized,
  clearAllTestData,
  getRepositories,
  getServices
} from './config/test-utils';
import { testDataSource } from './config/test-db';
import {Organization} from "../entity/organization.model";
import {User} from "../entity/user.model";
import {UserService} from "../service/user.service";
import {SignupService} from "../service/signup.service";

describe('@Transactional decorator nested test using existing services', () => {
  let dataSource: DataSource;
  let organizationRepository: Repository<Organization>;
  let userRepository: Repository<User>;
  let userService: UserService;
  let signupService: SignupService;

  beforeAll(async () => {
    await ensureTestDatabaseInitialized();
    dataSource = testDataSource;
    
    const repositories = getRepositories();
    const services = getServices();
    
    organizationRepository = repositories.organizationRepository;
    userRepository = repositories.userRepository;
    userService = services.userService;
    signupService = services.signupService;
  });

  beforeEach(async () => {
    await clearAllTestData();
    jest.restoreAllMocks(); // Reset all mocks before each test
  });

  describe('SignupService @Transactional tests', () => {
    test('should commit successfully when all operations succeed (REQUIRED + REQUIRED)', async () => {
      // Given
      const transactionSpy = jest.spyOn(dataSource, 'transaction');

      const signupData = {
        organizationId: 'test-org-success',
        userId: 'test-user-success',
        userName: 'Test User Success'
      };

      // When
      const result = await signupService.signup(signupData);

      // Then
      expect(result.organization.organizationId).toBe(signupData.organizationId);
      expect(result.user.userId).toBe(signupData.userId);
      expect(result.user.name).toBe(signupData.userName);

      // Verify data exists in database
      const org = await organizationRepository.findOneBy({
        organizationId: signupData.organizationId
      });
      const user = await userRepository.findOne({
        where: { userId: signupData.userId },
        relations: ['organization']
      });

      expect(org).toBeDefined();
      expect(user).toBeDefined();
      expect(user?.organization?.organizationId).toBe(signupData.organizationId);

      // Verify transaction was called
      expect(transactionSpy).toHaveBeenCalled();
      expect(transactionSpy.mock.calls.length).toEqual(1)
      transactionSpy.mockRestore();
    });

    test('should rollback entire transaction when user creation fails (REQUIRED + REQUIRED)', async () => {
      // Given
      const transactionSpy = jest.spyOn(dataSource, 'transaction');

      const signupData = {
        organizationId: 'test-org-fail',
        userId: 'test-user-fail',
        userName: 'Test User'
      };

      // Mock UserService's createUser method to fail
      const createUserSpy = jest.spyOn(userService, 'createUser')
        .mockRejectedValue(new Error('User creation failed'));

      // When & Then
      await expect(
        signupService.signup(signupData)
      ).rejects.toThrow('User creation failed');

      // Verify mock was called
      expect(createUserSpy).toHaveBeenCalledWith({
        userId: signupData.userId,
        name: signupData.userName,
      });

      // Verify complete rollback - no organization should exist
      const org = await organizationRepository.findOneBy({ 
        organizationId: signupData.organizationId 
      });
      const user = await userRepository.findOneBy({ 
        userId: signupData.userId 
      });
      
      expect(org).toBeNull(); // Organization also rolled back
      expect(user).toBeNull(); // User creation failed

      // Verify transaction was called
      expect(transactionSpy).toHaveBeenCalled();
      expect(transactionSpy.mock.calls.length).toEqual(1)
      transactionSpy.mockRestore();
    });
  });

  describe('SignupService without @Transactional tests', () => {
    test('should NOT rollback organization when user creation fails (independent transactions)', async () => {
      // Given
      const signupData = {
        organizationId: 'test-org-no-rollback',
        userId: 'test-user-no-rollback',
        userName: 'Test User No Rollback'
      };

      // Mock UserService's createUser method to fail
      const createUserSpy = jest.spyOn(userService, 'createUser')
        .mockRejectedValue(new Error('User creation failed without transaction'));

      // When & Then
      await expect(
        signupService.signupWithoutTransaction(signupData)
      ).rejects.toThrow('User creation failed without transaction');

      // Verify mock was called
      expect(createUserSpy).toHaveBeenCalledWith({
        userId: signupData.userId,
        name: signupData.userName,
      });

      // Verify organization WAS created (no rollback without transaction)
      const org = await organizationRepository.findOneBy({
        organizationId: signupData.organizationId 
      });
      const user = await userRepository.findOneBy({ 
        userId: signupData.userId 
      });
      
      expect(org).toBeDefined(); // Organization was created (no rollback)
      expect(org?.organizationId).toBe(signupData.organizationId);
      expect(user).toBeNull(); // User creation failed
    });

    test('should commit successfully when all operations succeed (success without transaction)', async () => {
      // Given
      const transactionSpy = jest.spyOn(dataSource, 'transaction');

      const signupData = {
        organizationId: 'test-org-no-trans-success',
        userId: 'test-user-no-trans-success',
        userName: 'Test User No Trans Success'
      };

      // When
      const result = await signupService.signupWithoutTransaction(signupData);

      // Then
      expect(result.organization.organizationId).toBe(signupData.organizationId);
      expect(result.user.userId).toBe(signupData.userId);
      expect(result.user.name).toBe(signupData.userName);

      // Verify data exists in database
      const org = await organizationRepository.findOneBy({ 
        organizationId: signupData.organizationId 
      });
      const user = await userRepository.findOne({
        where: { userId: signupData.userId },
        relations: ['organization']
      });
      
      expect(org).toBeDefined();
      expect(user).toBeDefined();
      expect(user?.organization?.organizationId).toBe(signupData.organizationId);

      // Verify transaction was called
      expect(transactionSpy).toHaveBeenCalled();
      expect(transactionSpy.mock.calls.length).toEqual(2)
      transactionSpy.mockRestore();
    });
  });

  describe('SignupService REQUIRES_NEW tests', () => {
    test('should use separate transaction for REQUIRES_NEW propagation', async () => {
      // Given
      const transactionSpy = jest.spyOn(dataSource, 'transaction');
      const signupData = {
        organizationId: 'test-org-requires-new',
        userId: 'test-user-requires-new',
        userName: 'Test User REQUIRES_NEW'
      };

      // When - using signupWithSeparateTransaction (REQUIRES_NEW)
      await signupService.signupWithSeparateTransactions(signupData);

      // Then - REQUIRES_NEW creates separate transactions
      // Transaction count may vary depending on actual implementation
      expect(transactionSpy).toHaveBeenCalled();
      expect(transactionSpy.mock.calls.length).toEqual(2)
      transactionSpy.mockRestore();
    });
  });
});