# TypeORM Transactional Service

A clean transaction management library for TypeORM, inspired by Spring's `@Transactional` decorator.

## Installation

```bash
npm install typeorm-transactional-service
```

## Basic Usage

### 1. Extend BaseTransactionalService

```typescript
import { DataSource } from 'typeorm';
import { BaseTransactionalService, Transactional } from 'typeorm-transactional-service';
import { User } from './entity/user.model';
import { Organization } from './entity/organization.model';

export class UserService extends BaseTransactionalService {
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  @Transactional()
  async createUser(userData: CreateUserDto) {
    const userRepo = this.getRepository(User);
    const user = await userRepo.save(userRepo.create(userData));
    return user;
  }
}
```

### 2. Multi-Service Transaction

```typescript
export class SignupService extends BaseTransactionalService {
  constructor(
    dataSource: DataSource,
    private readonly organizationService: OrganizationService,
    private readonly userService: UserService
  ) {
    super(dataSource);
  }

  // All operations in a single transaction
  @Transactional()
  async signup(signupData: SignupDto) {
    // 1. Create organization
    const organization = await this.organizationService.createOrganization({
      organizationId: signupData.organizationId,
      isEnterprise: false,
    });

    // 2. Create user
    const user = await this.userService.createUser({
      userId: signupData.userId,
      name: signupData.userName,
    });

    // 3. Link user to organization
    const userRepo = this.getRepository(User);
    user.organization = organization;
    await userRepo.save(user);

    return { organization, user };
  }

  // Each operation in separate transactions
  async signupWithoutTransaction(signupData: SignupDto) {
    // If user creation fails, organization won't be rolled back
    const organization = await this.organizationService.createOrganization({
      organizationId: signupData.organizationId,
      isEnterprise: false,
    });

    const user = await this.userService.createUser({
      userId: signupData.userId,
      name: signupData.userName,
    });

    const userRepo = this.getRepository(User);
    user.organization = organization;
    await userRepo.save(user);

    return { organization, user };
  }
}
```

### 3. Transaction Options

```typescript
// Custom isolation level
@Transactional({ isolation: 'REPEATABLE READ' })
async criticalOperation() {
  // Operations with repeatable read isolation
}

// Always create new transaction (independent of existing transaction)
@Transactional({ propagation: 'REQUIRES_NEW' })
async independentOperation() {
  // Runs in separate transaction
}
```

### 4. Using Outside Services

```typescript
import { getCurrentTransactionManager } from 'typeorm-transactional-service';

// Get current transaction manager
const manager = getCurrentTransactionManager(dataSource);
if (manager) {
  // Use transaction manager directly
  await manager.save(entity);
} else {
  // No active transaction, use default manager
  await dataSource.manager.save(entity);
}
```

## Features

- **AsyncLocalStorage based**: Node.js v16+ support
- **Transaction propagation**: `REQUIRED` (default), `REQUIRES_NEW`
- **Isolation levels**: All standard isolation levels supported
- **Database-specific optimization**: SQLite, MySQL, PostgreSQL, etc.
- **Type safe**: Full TypeScript support
- **Per-DataSource context**: Prevents context conflicts in multi-database setups

## Transaction Propagation

- **`REQUIRED`** (default): Join existing transaction if present, create new one if not
- **`REQUIRES_NEW`**: Always create new independent transaction

## Rollback Examples

### Success Case: All Committed
```typescript
@Transactional()
async signup(data: SignupDto) {
  await this.orgService.create(data.org);   // ✅ Success
  await this.userService.create(data.user); // ✅ Success
  // All operations committed
}
```

### Failure Case: All Rolled Back
```typescript
@Transactional()
async signup(data: SignupDto) {
  await this.orgService.create(data.org);   // ✅ Success
  await this.userService.create(data.user); // ❌ Fails
  // Organization creation is also rolled back
}
```

### Without Transaction: Partial Success
```typescript
// No @Transactional decorator
async signupWithoutTransaction(data: SignupDto) {
  await this.orgService.create(data.org);   // ✅ Success (committed)
  await this.userService.create(data.user); // ❌ Fails
  // Organization remains in database (no rollback)
}
```

## Testing

The library includes comprehensive tests demonstrating transaction behavior:

```typescript
// Test transaction rollback
test('should rollback entire transaction when user creation fails', async () => {
  // Mock user service to fail
  jest.spyOn(userService, 'createUser')
    .mockRejectedValue(new Error('User creation failed'));

  // Signup should fail
  await expect(signupService.signup(signupData))
    .rejects.toThrow('User creation failed');

  // Organization should also be rolled back
  const org = await organizationRepository.findOneBy({ 
    organizationId: signupData.organizationId 
  });
  expect(org).toBeNull(); // ✅ Rolled back
});
```

## Requirements

- Node.js 16+
- TypeORM 0.3+
- TypeScript 4.5+

## License

MIT

## Inspired by

https://github.com/Aliheym/typeorm-transactional