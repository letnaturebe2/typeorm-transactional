import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { BaseEntity } from './base';
import { Organization } from './organization.model';

@Entity()
export class User extends BaseEntity {
  @Column({ unique: true })
  userId: string;

  @ManyToOne(
    () => Organization,
    (organization: Organization) => organization.users,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'organization_id' })
  organization: Organization;

  @Column({ default: false })
  isAdmin: boolean;

  @Column({ type: 'varchar', nullable: true, length: 255 })
  name: string | null;
}
