import { Column, Entity, Index, OneToMany } from 'typeorm';
import { BaseEntity } from './base';
import { User } from './user.model';

@Entity()
export class Organization extends BaseEntity {
  @Index()
  @Column({ unique: true })
  organizationId: string;

  @Column({ default: false })
  isEnterprise: boolean;

  @OneToMany(
    () => User,
    (user: User) => user.organization,
  )
  users: User[];
}
