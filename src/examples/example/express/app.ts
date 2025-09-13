import express from 'express';
import type { DataSource } from 'typeorm';
import { OrganizationService } from '../../service/organization.service';
import { SignupService } from '../../service/signup.service';
import { UserService } from '../../service/user.service';
import { SignupController } from './controller/signup.controller';

export interface AppServices {
  organizationService?: OrganizationService;
  userService?: UserService;
  signupService?: SignupService;
}

export function createApp(
  dataSource: DataSource,
  services?: AppServices,
): express.Application {
  const app = express();

  // Middleware
  app.use(express.json());

  // Create or use provided services
  const organizationService =
    services?.organizationService || new OrganizationService(dataSource);
  const userService = services?.userService || new UserService(dataSource);
  const signupService =
    services?.signupService ||
    new SignupService(dataSource, organizationService, userService);

  // Create controller
  const signupController = new SignupController(signupService);

  // Routes
  app.post('/signup', signupController.signup.bind(signupController));
  app.post(
    '/signup-without-transaction',
    signupController.signupWithoutTransaction.bind(signupController),
  );

  return app;
}
