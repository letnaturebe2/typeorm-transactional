import { Module, Controller, Get } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NestJSSignupController } from './controller/signup.controller';
import { NestJSSignupService } from './service/signup.service';
import { NestJSOrganizationService } from './service/organization.service';
import { NestJSUserService } from './service/user.service';


export function createAppModuleConfig(dataSource: DataSource) {
  return {
    controllers: [NestJSSignupController],
    providers: [
      {
        provide: 'DATA_SOURCE',
        useValue: dataSource,
      },
      NestJSOrganizationService,
      NestJSUserService,
      NestJSSignupService,
    ],
    exports: [
      NestJSOrganizationService,
      NestJSUserService,
      NestJSSignupService,
    ],
  };
}