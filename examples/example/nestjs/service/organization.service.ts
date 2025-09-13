import { Injectable, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Organization } from '../../../entity/organization.model';
import {BaseTransactionalService, Transactional} from "../../../../src";

export interface CreateOrganizationDto {
  organizationId: string;
  isEnterprise?: boolean;
}

@Injectable()
export class NestJSOrganizationService extends BaseTransactionalService {
  constructor(@Inject('DATA_SOURCE') protected readonly dataSource: DataSource) {
    super(dataSource);
  }

  @Transactional()
  async createOrganization(orgData: CreateOrganizationDto): Promise<Organization> {
    const repository = this.getRepository(Organization);
    
    const organization = repository.create({
      organizationId: orgData.organizationId,
      isEnterprise: orgData.isEnterprise || false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return await repository.save(organization);
  }
}