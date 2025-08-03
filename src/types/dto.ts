export interface CreateUserDto {
  userId: string;
  name: string;
  isAdmin?: boolean;
  organizationId?: string;
}

export interface CreateOrganizationDto {
  organizationId: string;
  isEnterprise: boolean;
  installation?: any;
}

export interface SignupDto {
  organizationId: string;
  userId: string;
  userName: string;
} 