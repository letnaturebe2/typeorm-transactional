import {DataSource} from 'typeorm';
import {BaseTransactionalService, Transactional} from "@/decorators/transactional";
import {CreateOrganizationDto} from "@/types/dto";
import {Organization} from "@/entity/organization.model";

export class OrganizationService extends BaseTransactionalService {
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  @Transactional()
  async createOrganization(orgData: CreateOrganizationDto): Promise<Organization> {
    const orgRepo = this.getRepository(Organization);
    
    const organization = new Organization();
    organization.organizationId = orgData.organizationId;
    organization.isEnterprise = orgData.isEnterprise;

    return await orgRepo.save(organization);
  }
} 