import { Controller, Get, Module } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { NestJSSignupController } from './controller/signup.controller';
import { NestJSOrganizationService } from './service/organization.service';
import { NestJSSignupService } from './service/signup.service';
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
