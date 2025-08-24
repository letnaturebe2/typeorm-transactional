import { testDataSource } from './test-db';
import {Organization} from "../../entity/organization.model";
import {User} from "../../entity/user.model";
import {OrganizationService} from "../../service/organization.service";
import {UserService} from "../../service/user.service";
import {SignupService} from "../../service/signup.service";

let isInitialized = false;

export async function ensureTestDatabaseInitialized(): Promise<void> {
  if (!isInitialized) {
    await testDataSource.initialize();
    isInitialized = true;
  }
}

export function getRepositories() {
  return {
    organizationRepository: testDataSource.getRepository(Organization),
    userRepository: testDataSource.getRepository(User),
  };
}

// Singleton instance variables for services
let organizationServiceInstance: OrganizationService;
let userServiceInstance: UserService;
let signupServiceInstance: SignupService;

export function getServices() {
  // Create instances if they don't exist, otherwise reuse existing ones
  if (!organizationServiceInstance) {
    organizationServiceInstance = new OrganizationService(testDataSource);
  }
  if (!userServiceInstance) {
    userServiceInstance = new UserService(testDataSource);
  }
  if (!signupServiceInstance) {
    signupServiceInstance = new SignupService(
      testDataSource, 
      organizationServiceInstance, 
      userServiceInstance
    );
  }

  return {
    organizationService: organizationServiceInstance,
    userService: userServiceInstance,
    signupService: signupServiceInstance,
  };
}

export async function clearAllTestData(): Promise<void> {
  const { userRepository, organizationRepository } = getRepositories();
  await userRepository.clear();
  await organizationRepository.clear();
}