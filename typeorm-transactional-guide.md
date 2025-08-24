# TypeORM에서 Spring의 @Transactional처럼 깔끔한 트랜잭션 관리하기

## 문제: 왜 TypeORM은 Spring이나 Django처럼 깔끔한 트랜잭션 관리가 안 될까?

Spring Data JPA나 Django를 사용해본 개발자라면 `@Transactional` 어노테이션의 편리함에 익숙할 것입니다. 서비스 메서드 위에 어노테이션 하나만 붙이면, 프레임워크가 알아서 데이터베이스 트랜잭션을 관리해줍니다. 코드는 깔끔해지고, 개발자는 비즈니스 로직에만 집중할 수 있습니다.

예를 들어 Spring과 Django에서는 다음과 같이 간단하게 처리됩니다.

```java
// Spring (Java)
@Transactional
public void signup(SignupDto signupDto) {
    organizationRepository.save(signupDto.getOrganization());
    userRepository.save(signupDto.getUser());
}
```

```python
# Django (Python)
from django.db import transaction

@transaction.atomic
def signup(signup_data):
    Organization.objects.create(...)
    User.objects.create(...)
```

하지만 TypeORM으로 넘어오면 답답함을 느끼기 쉽습니다. "왜 여기에는 그런 멋진 기능이 없을까?" 여러 서비스에 걸친 작업을 단일 트랜잭션으로 묶기 위해, 우리는 `EntityManager` 객체를 메서드마다 일일이 전달하는 방식을 흔히 사용합니다.

```typescript
// TypeORM의 일반적이고 번거로운 방식
export class SignupService {
  // 트랜잭션을 위해 manager를 계속 파라미터로 넘겨야 합니다.
  async signup(userDto: UserDto, manager?: EntityManager): Promise<void> {
    const em = manager || this.dataSource.manager;
    // 호출하는 모든 메서드에 em을 전달, 또 전달...
    await this.organizationService.create(userDto.organization, em);
    await this.userService.create(userDto, em);
  }
}
```

"왜 이렇게까지 해야 하지? 왜 TypeORM은 이걸 알아서 처리해주지 못할까?" 라는 의문이 들 수밖에 없습니다. 이렇게 `EntityManager`를 계속 넘겨주는 방식은 여러 문제를 낳습니다.

- **반복적인 코드**: 트랜잭션에 포함된 모든 메서드에 `manager?: EntityManager` 파라미터를 추가해야 합니다.
- **실수 유발**: 깊게 중첩된 호출에서 `EntityManager` 전달을 빠뜨리기 쉽고, 이는 트랜잭션의 원자성을 깨뜨립니다.
- **가독성 저하**: 비즈니스 로직이 트랜잭션 관리 코드로 인해 복잡해집니다.
- **추상화의 부재**: 다른 최신 프레임워크에서 제공하는 깔끔한 관심사 분리가 이루어지지 않습니다.

이 가이드는 바로 이런 답답함을 느껴본 개발자들을 위한 것입니다. 우리가 Spring에서 사랑했던 `@Transactional`처럼, TypeORM에서도 어노테이션 기반의 깔끔한 트랜잭션 관리 시스템을 만드는 방법을 알아봅니다.

## 해결책: AsyncLocalStorage 기반 @Transactional 데코레이터

Node.js v16부터 지원되는 **AsyncLocalStorage**를 사용하면 이 문제를 해결할 수 있습니다. AsyncLocalStorage는 비동기 호출이 이어지는 동안 실행 컨텍스트를 유지해주는 도구입니다.

이를 활용하면 `@Transactional` 데코레이터가 시작한 트랜잭션의 EntityManager를 컨텍스트에 저장하고, 하위의 어떤 비동기 함수에서도 파라미터 전달 없이 현재 트랜잭션을 꺼내 쓸 수 있습니다.

### 핵심 아이디어

```mermaid
graph TD
    A[@Transactional 메서드 호출] --> B[DataSource.transaction 시작]
    B --> C[AsyncLocalStorage에 EntityManager 저장]
    C --> D[비즈니스 로직 실행]
    D --> E[하위 서비스들이 getCurrentTransactionManager로 EntityManager 획득]
    E --> F[모든 작업이 같은 트랜잭션에서 실행]
    F --> G[성공시 커밋, 실패시 롤백]
```

## 구현 코드

### 1. 기본 트랜잭션 데코레이터와 유틸리티

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';
import { DataSource, EntityManager, Repository } from 'typeorm';

type IsolationLevel = 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

export interface TransactionalOptions {
  isolation?: IsolationLevel;
  propagation?: 'REQUIRED' | 'REQUIRES_NEW';
}

// Global transaction context using AsyncLocalStorage
const transactionContext = new AsyncLocalStorage<EntityManager>();

function getSupportedIsolationLevel(dataSource: DataSource, requestedLevel?: IsolationLevel): IsolationLevel {
  const dbType = dataSource.options.type;

  if (dbType === 'sqlite') {
    // SQLite only supports SERIALIZABLE and READ UNCOMMITTED
    if (requestedLevel === 'READ UNCOMMITTED') {
      return 'READ UNCOMMITTED';
    }
    return 'SERIALIZABLE'; // Default for SQLite
  }

  // For other databases (MySQL, PostgreSQL, etc.), use requested level or default
  return requestedLevel || 'READ COMMITTED';
}

export function Transactional(options: TransactionalOptions = {}) {
  return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const dataSource: DataSource = (this as any).dataSource;

      if (!dataSource) {
        throw new Error(
          `DataSource not found in ${target.constructor.name}. Make sure your service has a 'dataSource' property.`
        );
      }

      // Check for existing transaction in the global context
      const existingManager = getCurrentTransactionManager();

      if (existingManager && options.propagation !== 'REQUIRES_NEW') {
        // If there is an existing transaction and propagation is not REQUIRES_NEW, join the existing transaction
        return await originalMethod.apply(this, args);
      }

      const isolationLevel = getSupportedIsolationLevel(dataSource, options.isolation);

      return await dataSource.transaction(isolationLevel, async (manager: EntityManager) => {
        // Set the transaction context using AsyncLocalStorage
        return await transactionContext.run(manager, async () => {
          return await originalMethod.apply(this, args);
        });
      });
    };

    return descriptor;
  };
}

export function getCurrentTransactionManager(): EntityManager | null {
  return transactionContext.getStore() || null;
}

export abstract class BaseTransactionalService {
  protected constructor(protected readonly dataSource: DataSource) {}

  protected getRepository<T extends object>(entity: new () => T): Repository<T> {
    const manager = getCurrentTransactionManager();
    return manager ? manager.getRepository(entity) : this.dataSource.getRepository(entity);
  }
}
```

### 2. 핵심 기능 설명

#### AsyncLocalStorage를 통한 컨텍스트 관리
```typescript
const transactionContext = new AsyncLocalStorage<EntityManager>();
```
- Node.js의 AsyncLocalStorage로 비동기 호출 체인 전체에서 EntityManager 공유
- 스레드 로컬 변수와 유사하지만 비동기 환경에서 동작

#### 트랜잭션 전파 정책 (Propagation)
```typescript
if (existingManager && options.propagation !== 'REQUIRES_NEW') {
  // 기존 트랜잭션 재사용
  return await originalMethod.apply(this, args);
}
```
- **REQUIRED** (기본값): 기존 트랜잭션이 있으면 참여, 없으면 새로 생성
- **REQUIRES_NEW**: 항상 새로운 트랜잭션 생성

#### 격리 수준 (Isolation Level) 지원
```typescript
function getSupportedIsolationLevel(dataSource: DataSource, requestedLevel?: IsolationLevel): IsolationLevel {
  const dbType = dataSource.options.type;
  
  if (dbType === 'sqlite') {
    // SQLite는 SERIALIZABLE과 READ UNCOMMITTED만 지원
    return requestedLevel === 'READ UNCOMMITTED' ? 'READ UNCOMMITTED' : 'SERIALIZABLE';
  }
  
  return requestedLevel || 'READ COMMITTED';
}
```

## 개선된 사용 예시

실제 애플리케이션에서는 비즈니스 로직을 별도의 private 메서드로 분리하여 재사용성과 테스트 용이성을 높이는 패턴이 유용합니다. 다음은 개선된 `SignupService` 예시입니다.

### 서비스 구현

핵심 로직은 `performSignup`이라는 private 메서드에 구현합니다. `@Transactional` 데코레이터가 붙은 public 메서드와 붙지 않은 메서드 양쪽에서 이 로직을 호출하여 트랜잭션 동작을 명확하게 제어하고 비교할 수 있습니다.

```typescript
// src/service/signup.service.ts
import { DataSource } from 'typeorm';
import { OrganizationService } from './organization.service';
import { UserService } from './user.service';
import {BaseTransactionalService, Transactional} from "@/decorators/transactional";
import {SignupDto} from "@/types/dto";
import {Organization} from "@/entity/organization.model";
import {User} from "@/entity/user.model";

export class SignupService extends BaseTransactionalService {
  constructor(
    dataSource: DataSource,
    protected readonly organizationService: OrganizationService,
    protected readonly userService: UserService
  ) {
    super(dataSource);
  }

  // @Transactional을 통해 performSignup이 단일 트랜잭션으로 실행됨
  @Transactional()
  async signup(signupData: SignupDto): Promise<{ organization: Organization; user: User }> {
    return await this.performSignup(signupData);
  }

  // @Transactional이 없으므로, 하위 서비스 호출은 각각 별도의 트랜잭션으로 실행됨
  async signupWithoutTransaction(signupData: SignupDto): Promise<{ organization: Organization; user: User }> {
    return await this.performSignup(signupData);
  }

  /**
   * 실제 회원가입 로직을 수행하는 private 메서드
   * 호출하는 메서드에 @Transactional이 있는지에 따라 트랜잭션 여부가 결정됩니다.
   */
  private async performSignup(signupData: SignupDto): Promise<{ organization: Organization; user: User }> {
    // 1. 조직 생성
    const organization = await this.organizationService.createOrganization({
      organizationId: signupData.organizationId,
      isEnterprise: false,
    });

    // 2. 사용자 생성
    const user = await this.userService.createUser({
      userId: signupData.userId,
      name: signupData.userName,
    });

    // 3. 사용자와 조직 연결
    const userRepo = this.getRepository(User);
    user.organization = organization;
    await userRepo.save(user);

    return { organization, user };
  }
}
```

### 하위 서비스

하위 서비스인 `OrganizationService`와 `UserService`의 메서드에도 `@Transactional`을 붙여주면, 이미 시작된 트랜잭션에 자동으로 참여하게 됩니다.

```typescript
// OrganizationService.ts
export class OrganizationService extends BaseTransactionalService {
  @Transactional() // 부모 트랜잭션에 참여
  async createOrganization(orgData: { organizationId: string }): Promise<Organization> {
    const repository = this.getRepository(Organization);
    // ... 로직 ...
    return repository.save(repository.create(orgData));
  }
}

// UserService.ts
export class UserService extends BaseTransactionalService {
  @Transactional() // 부모 트랜잭션에 참여
  async createUser(userData: { userId: string; name: string }): Promise<User> {
    const repository = this.getRepository(User);
    // ... 로직 ...
    return repository.save(repository.create(userData));
  }
}
```
이 구조를 통해 `signupService.signup()`을 호출하면 모든 DB 작업이 하나의 트랜잭션으로 묶이지만, `signupWithoutTransaction()`을 호출하면 `createOrganization`과 `createUser`가 각각의 트랜잭션으로 실행되어 데이터 일관성을 보장할 수 없게 됩니다.

## 테스트를 통한 동작 검증

데코레이터의 동작을 가장 명확하게 확인하는 방법은 테스트 코드를 작성하는 것입니다. `jest.spyOn`을 사용해 `dataSource.transaction`이 몇 번 호출되는지 감시하면, 트랜잭션이 의도대로 동작하는지 정확히 검증할 수 있습니다.

### 성공 시나리오: 단일 트랜잭션 커밋

`signup` 메서드가 성공하면, 모든 작업이 하나의 트랜잭션으로 묶여 커밋되어야 합니다. `dataSource.transaction`은 단 한 번만 호출되어야 합니다.

```typescript
// tests/signup.service.test.ts
test('should commit successfully when all operations succeed', async () => {
  // Given
  const transactionSpy = jest.spyOn(dataSource, 'transaction');
  const signupData = {
    organizationId: 'test-org-success',
    userId: 'test-user-success',
    userName: 'Test User Success'
  };

  // When
  await signupService.signup(signupData);

  // Then: DB에 데이터가 정상적으로 저장되었는지 확인
  const org = await organizationRepository.findOneBy({ organizationId: signupData.organizationId });
  const user = await userRepository.findOneBy({ userId: signupData.userId });
  expect(org).toBeDefined();
  expect(user).toBeDefined();

  // 트랜잭션이 정확히 1번만 호출되었는지 확인
  expect(transactionSpy).toHaveBeenCalledTimes(1);
});
```

### 실패 시나리오: 전체 롤백

`signup` 실행 중 하위 서비스에서 에러가 발생하면, 이전에 실행된 모든 DB 작업이 롤백되어야 합니다. 예를 들어 `createUser`가 실패하면, 이미 생성된 `organization`도 DB에서 사라져야 합니다.

```typescript
// tests/signup.service.test.ts
test('should rollback entire transaction when user creation fails', async () => {
  // Given: userService.createUser가 실패하도록 Mock
  jest.spyOn(userService, 'createUser').mockRejectedValue(new Error('User creation failed'));
  const signupData = {
    organizationId: 'test-org-fail',
    userId: 'test-user-fail',
    userName: 'Test User'
  };

  // When & Then: signup이 실패할 것을 예상
  await expect(signupService.signup(signupData)).rejects.toThrow('User creation failed');

  // Then: 전체 롤백 확인 - 조직도 생성되지 않았어야 함
  const org = await organizationRepository.findOneBy({ organizationId: signupData.organizationId });
  expect(org).toBeNull(); // 조직도 롤백됨!
});
```

### 트랜잭션 없는 경우와 비교

`@Transactional`이 없는 `signupWithoutTransaction`을 테스트하면 데이터 일관성이 어떻게 깨지는지 명확히 볼 수 있습니다. `createUser`가 실패해도 `organization`은 롤백되지 않고 DB에 그대로 남게 됩니다.

```typescript
// tests/signup.service.test.ts
test('should NOT rollback organization when user creation fails (without transaction)', async () => {
  // Given: userService.createUser가 실패하도록 Mock
  jest.spyOn(userService, 'createUser').mockRejectedValue(new Error('User creation failed'));
  const signupData = {
    organizationId: 'test-org-no-rollback',
    userId: 'test-user-no-rollback',
    userName: 'Test User No Rollback'
  };

  // When & Then
  await expect(signupService.signupWithoutTransaction(signupData)).rejects.toThrow('User creation failed');

  // Then: 조직은 롤백되지 않음
  const org = await organizationRepository.findOneBy({ organizationId: signupData.organizationId });
  expect(org).toBeDefined(); // 조직은 생성됨 (롤백 안됨!)
});
```

## 고급 기능

### 격리 수준 설정
```typescript
@Transactional({ isolation: 'REPEATABLE READ' })
async criticalOperation() {
  // 반복 가능한 읽기 격리 수준에서 실행
}

@Transactional({ isolation: 'SERIALIZABLE' })  
async highConsistencyOperation() {
  // 최고 격리 수준에서 실행 (성능은 떨어질 수 있음)
}
```

### 트랜잭션 전파 정책 활용
```typescript
@Transactional({ propagation: 'REQUIRES_NEW' })
async auditLog(data: any) {
  // 메인 트랜잭션과 독립적으로 감사 로그 저장
  // 메인 작업이 실패해도 로그는 저장됨
}

@Transactional()
async mainBusinessLogic() {
  // 메인 비즈니스 로직
  await this.processData();
  
  // 독립적인 트랜잭션으로 로그 저장
  await this.auditLog({ action: 'process_data' });
}
```

## 주의사항 및 베스트 프랙티스

### 1. DataSource 주입 확인
```typescript
// ❌ 잘못된 예시
export class MyService {
  // dataSource 프로퍼티가 없음
  @Transactional()
  async myMethod() { /* ... */ }
}

// ✅ 올바른 예시
export class MyService extends BaseTransactionalService {
  constructor(protected readonly dataSource: DataSource) {
    super(dataSource);
  }
  
  @Transactional()
  async myMethod() { /* ... */ }
}
```

### 2. 에러 처리
```typescript
@Transactional()
async complexOperation() {
  try {
    await this.step1();
    await this.step2();
    await this.step3();
  } catch (error) {
    // 에러 로깅은 가능하지만, 트랜잭션 롤백을 위해 다시 throw 필요
    console.error('Operation failed:', error);
    throw error; // 중요: 에러를 다시 던져서 롤백 발생시켜야 함
  }
}
```

### 3. 성능 고려사항
- 트랜잭션 범위를 너무 크게 잡지 말 것
- 네트워크 호출이나 파일 I/O는 트랜잭션 외부에서 처리
- 격리 수준이 높을수록 성능은 떨어짐

## 결론

`@Transactional` 데코레이터를 사용하면:

1. **코드 간소화**: EntityManager 파라미터 전달 불필요
2. **실수 방지**: 트랜잭션 범위 누락 방지  
3. **가독성 향상**: 비즈니스 로직에 집중 가능
4. **데이터 일관성**: All or Nothing 보장
5. **Spring 친화적**: 기존 Spring 개발자들에게 친숙한 API

복잡한 비즈니스 로직에서도 EntityManager를 직접 전달할 필요 없이, 여러 DB 작업을 하나의 논리적 단위로 묶어 데이터 일관성을 손쉽게 보장할 수 있습니다.

## 전체 코드 및 테스트 예제

이 문서에서 설명한 모든 코드와 실제 동작하는 테스트 코드는 아래 GitHub 저장소에서 확인하실 수 있습니다.

**GitHub Repository**: [typeorm-transactional](https://github.com/your-username/typeorm-transactional)

### 주요 파일 구조
```
src/
├── decorators/
│   └── transactional.ts          # @Transactional 데코레이터 구현
├── service/
│   ├── organization.service.ts   # 조직 서비스
│   ├── user.service.ts          # 사용자 서비스  
│   └── signup.service.ts        # 회원가입 서비스 (통합)
└── entity/
    ├── organization.model.ts     # 조직 엔티티
    └── user.model.ts            # 사용자 엔티티

tests/
├── signup.service.test.ts        # 통합 테스트
└── config/
    ├── test-db.ts               # 테스트 DB 설정
    └── test-utils.ts            # 테스트 유틸리티
```