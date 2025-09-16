# TypeORM Transactional Service

A clean transaction management library for TypeORM, inspired by Spring's `@Transactional` decorator.

## Quick Start
1. **Extend `BaseTransactionalService`** - Inject TypeORM `DataSource` in constructor
2. **Use `getRepository()` or `getManager()`** - Access repositories within transaction context
3. **Decorate with `@Transactional()`** - Methods execute in a single transaction

```typescript
import { DataSource } from 'typeorm';
import { BaseTransactionalService, Transactional } from 'typeorm-transactional-service';

export class UserService extends BaseTransactionalService {
  constructor(dataSource: DataSource) {
    super(dataSource);  // 1. Extend and inject DataSource
  }

  @Transactional()  // 3. Use @Transactional decorator
  async createUser(userData: CreateUserDto) {
    const userRepo = this.getRepository(User);  // 2. Use getRepository()
    return await userRepo.save(userRepo.create(userData));
  }
}
```

**Key Benefits:**
- 🔄 **Transaction Propagation** - Nested service calls share the same transaction
- 🛡️ **Automatic Rollback** - Any error rolls back the entire transaction
- 🎯 **Zero Configuration** - Works out of the box with any TypeORM setup

## Installation

```bash
npm install typeorm-transactional-service
```

## Core Concepts

### 1. Service Implementation

See the Quick Start `UserService` example above for a minimal template. Key points:

- Extend `BaseTransactionalService` and inject `DataSource` in the constructor.
- Use `this.getRepository(Entity)` inside transactions; `this.getManager()` for direct manager access when needed.
- Decorate write methods with `@Transactional(options?)` to define transaction boundaries and propagation.

### 2. Multi-Service Transactions

```typescript
// Both services also use @Transactional on their write methods
export class OrganizationService extends BaseTransactionalService {
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  @Transactional()
  async createOrganization(orgData: { organizationId: string }) {
    const orgRepo = this.getRepository(Organization);
    const organization = new Organization();
    organization.organizationId = orgData.organizationId;
    return await orgRepo.save(organization);
  }
}

export class UserService extends BaseTransactionalService {
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  @Transactional()
  async createUser(userData: { userId: string; name: string }) {
    const userRepo = this.getRepository(User);
    const user = new User();
    user.userId = userData.userId;
    user.name = userData.name;
    return await userRepo.save(user);
  }

  // Example: start a new independent transaction
  // @Transactional({ propagation: 'REQUIRES_NEW' })
  // async createUserWithRequiresNew(dto: ...) { /* ... */ }
}

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
    // 1. Create organization (uses same transaction)
    const organization = await this.organizationService.createOrganization({
      organizationId: signupData.organizationId,
    });

    // 2. Create user (uses same transaction)
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

## Express.js Integration

Create services that extend `BaseTransactionalService`, then wire them into your Express app. Methods with `@Transactional()` execute within a single transaction and automatically propagate across nested service calls.

```typescript
import express from 'express';
import { DataSource } from 'typeorm';
import { BaseTransactionalService, Transactional } from 'typeorm-transactional-service';

// Define your services
class OrganizationService extends BaseTransactionalService {
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  @Transactional()
  async createOrganization(dto: { organizationId: string }) {
    const orgRepo = this.getRepository(Organization);
    return await orgRepo.save(orgRepo.create(dto));
  }
}

class UserService extends BaseTransactionalService {
  constructor(dataSource: DataSource) {
    super(dataSource);
  }

  @Transactional()
  async createUser(dto: { userId: string; name: string }) {
    const userRepo = this.getRepository(User);
    return await userRepo.save(userRepo.create(dto));
  }
}

class SignupService extends BaseTransactionalService {
  constructor(
    dataSource: DataSource,
    private readonly orgService: OrganizationService,
    private readonly userService: UserService,
  ) {
    super(dataSource);
  }

  // All nested service calls share the same transaction
  @Transactional()
  async signup(dto: { organizationId: string; userId: string; userName: string }) {
    const organization = await this.orgService.createOrganization({
      organizationId: dto.organizationId,
    });

    const user = await this.userService.createUser({
      userId: dto.userId,
      name: dto.userName,
    });

    // Link user to organization using getRepository()
    const userRepo = this.getRepository(User);
    user.organization = organization;
    await userRepo.save(user);

    return { organization, user };
  }
}

// Express app setup
const app = express();
app.use(express.json());

// Initialize services
const dataSource = new DataSource(/* your config */);
const organizationService = new OrganizationService(dataSource);
const userService = new UserService(dataSource);
const signupService = new SignupService(dataSource, organizationService, userService);

// Routes
app.post('/signup', async (req, res) => {
  try {
    const result = await signupService.signup(req.body);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
```

**See complete examples:**
- `src/examples/example/express/app.ts`
- `src/examples/example/express/controller/signup.controller.ts`
- `src/examples/service/*`

## NestJS Integration

Register services with `@Injectable()` and inject the `DataSource`. Methods with `@Transactional()` define transaction boundaries that propagate across service calls.

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SignupController } from './controller/signup.controller';
import { OrganizationService } from './service/organization.service';
import { UserService } from './service/user.service';
import { SignupService } from './service/signup.service';

@Module({
  controllers: [SignupController],
  providers: [
    {
      provide: 'DATA_SOURCE',
      useFactory: async () => {
        const dataSource = new DataSource(/* your config */);
        return await dataSource.initialize();
      },
    },
    OrganizationService,
    UserService,
    SignupService,
  ],
})
export class AppModule {}
```

```typescript
// user.service.ts
import { Injectable, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { BaseTransactionalService, Transactional } from 'typeorm-transactional-service';
import { User } from '../entity/user.entity';

@Injectable()
export class UserService extends BaseTransactionalService {
  constructor(@Inject('DATA_SOURCE') protected readonly dataSource: DataSource) {
    super(dataSource);
  }

  @Transactional()
  async createUser(dto: { userId: string; name: string }) {
    const userRepo = this.getRepository(User);
    return await userRepo.save(userRepo.create(dto));
  }
}

// organization.service.ts
@Injectable()
export class OrganizationService extends BaseTransactionalService {
  constructor(@Inject('DATA_SOURCE') protected readonly dataSource: DataSource) {
    super(dataSource);
  }

  @Transactional()
  async createOrganization(dto: { organizationId: string }) {
    const orgRepo = this.getRepository(Organization);
    return await orgRepo.save(orgRepo.create(dto));
  }
}

// signup.service.ts
@Injectable()
export class SignupService extends BaseTransactionalService {
  constructor(
    @Inject('DATA_SOURCE') protected readonly dataSource: DataSource,
    private readonly organizationService: OrganizationService,
    private readonly userService: UserService,
  ) {
    super(dataSource);
  }

  // All service calls share the same transaction
  @Transactional()
  async signup(dto: { organizationId: string; userId: string; userName: string }) {
    const organization = await this.organizationService.createOrganization({
      organizationId: dto.organizationId,
    });

    const user = await this.userService.createUser({
      userId: dto.userId,
      name: dto.userName,
    });

    // Link entities using getRepository()
    const userRepo = this.getRepository(User);
    user.organization = organization;
    await userRepo.save(user);

    return { organization, user };
  }
}
```

```typescript
// signup.controller.ts
import { Body, Controller, Post } from '@nestjs/common';
import { SignupService } from '../service/signup.service';

@Controller('signup')
export class SignupController {
  constructor(private readonly signupService: SignupService) {}

  @Post()
  async signup(@Body() body: { organizationId: string; userId: string; userName: string }) {
    const result = await this.signupService.signup(body);
    return { success: true, data: result };
  }
}
```

**See complete examples:**
- `src/examples/example/nestjs/app.module.ts`
- `src/examples/example/nestjs/service/*.ts`
- `src/examples/example/nestjs/controller/signup.controller.ts`

## How It Works

This library uses **Node.js AsyncLocalStorage** to maintain transaction context across asynchronous operations:

1. **Context Creation**: When `@Transactional()` is called, it creates or joins a transaction and stores the `EntityManager` in AsyncLocalStorage
2. **Context Propagation**: All nested service calls within the same async context automatically share the same transaction
3. **Smart Repository Access**: `getRepository()` and `getManager()` check AsyncLocalStorage first, falling back to default DataSource if no transaction exists
4. **Per-DataSource Isolation**: Each DataSource has its own AsyncLocalStorage context, preventing conflicts in multi-database setups

```typescript
// Simplified flow:
class SignupService extends BaseTransactionalService {
  @Transactional()
  async signup() {
    // 1. Transaction starts, EntityManager stored in AsyncLocalStorage
    await this.orgService.createOrg();     // 2. Uses same transaction context
    await this.userService.createUser();   // 3. Uses same transaction context
    // 4. Transaction commits (or rolls back on error)
  }
}
```

**Why AsyncLocalStorage?**
- ✅ No need to pass transaction objects through method parameters
- ✅ Works seamlessly with existing TypeORM code
- ✅ Maintains context across `await` boundaries
- ✅ Zero performance impact when not in transaction

## Requirements

- Node.js 16+
- TypeORM 0.3+
- TypeScript 4.5+

## License

MIT

## Inspired by

https://github.com/Aliheym/typeorm-transactional
