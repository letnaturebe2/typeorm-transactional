import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource, Repository } from 'typeorm';
import {Organization} from "../entity/organization.model";
import {User} from "../entity/user.model";
import {
  ensureTestDatabaseInitialized,
  clearAllTestData,
  getRepositories
} from './config/test-utils';
import { testDataSource } from './config/test-db';
import {NestJSUserService} from "../example/nestjs/service/user.service";
import {createAppModuleConfig} from "../example/nestjs/app.module";

describe('NestJS Integration Test - @Transactional decorator with HTTP endpoints', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let organizationRepository: Repository<Organization>;
  let userRepository: Repository<User>;
  let userService: NestJSUserService;

  beforeAll(async () => {
    await ensureTestDatabaseInitialized();
    dataSource = testDataSource;
    
    const repositories = getRepositories();

    organizationRepository = repositories.organizationRepository;
    userRepository = repositories.userRepository;
  });

  beforeEach(async () => {
    await clearAllTestData();
    jest.restoreAllMocks();

    // Create fresh NestJS app for each test
    const moduleConfig = createAppModuleConfig(dataSource);
    
    const testModule: TestingModule = await Test.createTestingModule(moduleConfig).compile();
    
    app = testModule.createNestApplication();
    await app.init();

    // Get service instance for mocking
    userService = testModule.get<NestJSUserService>(NestJSUserService);
  });

  afterEach(async () => {
    if (app) {
      await app.close();
    }
  });

  describe('🔄 Transaction behavior comparison via NestJS HTTP endpoints', () => {
    describe('✅ With @Transactional (All-or-Nothing)', () => {
      test('should successfully complete all operations in single transaction', async () => {
        // Given
        const transactionSpy = jest.spyOn(dataSource, 'transaction');
        const signupData = {
          organizationId: 'nestjs-test-org-success',
          userId: 'nestjs-test-user-success',
          userName: 'NestJS Test User Success'
        };

        // When
        const response = await request(app.getHttpServer())
          .post('/signup')
          .send(signupData)
          .expect(201);

        // Then
        expect(response.body.success).toBe(true);
        expect(response.body.data.organization.organizationId).toBe(signupData.organizationId);
        expect(response.body.data.user.userId).toBe(signupData.userId);

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

        // ✅ Single transaction for ALL operations
        expect(transactionSpy).toHaveBeenCalledTimes(1);
        transactionSpy.mockRestore();
      });

      test('should rollback EVERYTHING when any operation fails', async () => {
        // Given
        const transactionSpy = jest.spyOn(dataSource, 'transaction');
        const signupData = {
          organizationId: 'nestjs-test-org-fail',
          userId: 'nestjs-test-user-fail',
          userName: 'NestJS Test User Fail'
        };

        // Mock UserService's createUser method to fail
        const createUserSpy = jest.spyOn(userService, 'createUser')
          .mockRejectedValue(new Error('NestJS User creation failed'));

        // When
        const response = await request(app.getHttpServer())
          .post('/signup')
          .send(signupData)
          .expect(500);

        // Then
        expect(response.body.error).toBe('Internal server error');
        expect(response.body.message).toBe('NestJS User creation failed');

        // ✅ Complete rollback - NO data exists in database
        const org = await organizationRepository.findOneBy({ 
          organizationId: signupData.organizationId 
        });
        const user = await userRepository.findOneBy({ 
          userId: signupData.userId 
        });
        
        expect(org).toBeNull(); // Organization ALSO rolled back ⬅️ KEY BENEFIT
        expect(user).toBeNull(); // User creation failed

        // ✅ Single transaction attempted
        expect(transactionSpy).toHaveBeenCalledTimes(1);
        expect(createUserSpy).toHaveBeenCalled();
        
        transactionSpy.mockRestore();
        createUserSpy.mockRestore();
      });
    });

    describe('⚠️ Without @Transactional (Partial Success/Failure Risk)', () => {
      test('should create PARTIAL data when operations fail (❌ DATA INCONSISTENCY)', async () => {
        // Given
        const transactionSpy = jest.spyOn(dataSource, 'transaction');
        const signupData = {
          organizationId: 'nestjs-test-org-partial',
          userId: 'nestjs-test-user-partial',
          userName: 'NestJS Test User Partial'
        };

        // Mock UserService's createUser method to fail
        const createUserSpy = jest.spyOn(userService, 'createUser')
          .mockRejectedValue(new Error('NestJS User creation failed without transaction'));

        // When
        const response = await request(app.getHttpServer())
          .post('/signup/without-transaction')
          .send(signupData)
          .expect(500);

        // Then
        expect(response.body.error).toBe('Internal server error');
        expect(response.body.message).toBe('NestJS User creation failed without transaction');

        // ❌ Partial success - Organization exists but User doesn't (DATA INCONSISTENCY!)
        const org = await organizationRepository.findOneBy({
          organizationId: signupData.organizationId 
        });
        const user = await userRepository.findOneBy({ 
          userId: signupData.userId 
        });
        
        expect(org).toBeDefined(); // ❌ Organization was created (not rolled back) ⬅️ PROBLEM
        expect(org?.organizationId).toBe(signupData.organizationId);
        expect(user).toBeNull(); // User creation failed

        // ⚠️ Each service method creates its own transaction
        expect(transactionSpy).toHaveBeenCalled();
        expect(transactionSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
        
        transactionSpy.mockRestore();
        createUserSpy.mockRestore();
      });

      test('should successfully complete when ALL operations succeed', async () => {
        // Given
        const transactionSpy = jest.spyOn(dataSource, 'transaction');
        const signupData = {
          organizationId: 'nestjs-test-org-success-separate',
          userId: 'nestjs-test-user-success-separate',
          userName: 'NestJS Test User Success Separate'
        };

        // When
        const response = await request(app.getHttpServer())
          .post('/signup/without-transaction')
          .send(signupData)
          .expect(201);

        // Then
        expect(response.body.success).toBe(true);
        expect(response.body.data.organization.organizationId).toBe(signupData.organizationId);

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

        // ⚠️ Multiple separate transactions (each service method)
        expect(transactionSpy).toHaveBeenCalled();
        expect(transactionSpy.mock.calls.length).toBe(2);
        
        transactionSpy.mockRestore();
      });
    });
  });
});