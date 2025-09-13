import { AsyncLocalStorage } from 'node:async_hooks';
import type { DataSource, EntityManager, Repository } from 'typeorm';

type IsolationLevel =
  | 'READ UNCOMMITTED'
  | 'READ COMMITTED'
  | 'REPEATABLE READ'
  | 'SERIALIZABLE';

export interface TransactionalOptions {
  isolation?: IsolationLevel;
  propagation?: 'REQUIRED' | 'REQUIRES_NEW';
}

interface TransactionContextData {
  manager: EntityManager;
  dataSource: DataSource;
}

// Transaction context per DataSource to avoid conflicts
const transactionContexts = new WeakMap<
  DataSource,
  AsyncLocalStorage<TransactionContextData>
>();

function getOrCreateTransactionContext(
  dataSource: DataSource,
): AsyncLocalStorage<TransactionContextData> {
  let context = transactionContexts.get(dataSource);
  if (!context) {
    context = new AsyncLocalStorage<TransactionContextData>();
    transactionContexts.set(dataSource, context);
  }
  return context;
}

function getSupportedIsolationLevel(
  dataSource: DataSource,
  requestedLevel?: IsolationLevel,
): IsolationLevel | undefined {
  if (!requestedLevel) {
    // Use database default when no level is requested
    return undefined;
  }

  const dbType = dataSource.options.type;

  if (dbType === 'sqlite') {
    // SQLite only supports SERIALIZABLE and READ UNCOMMITTED
    if (
      requestedLevel === 'READ UNCOMMITTED' ||
      requestedLevel === 'SERIALIZABLE'
    ) {
      return requestedLevel;
    }
    // Fall back to SERIALIZABLE for unsupported levels
    return 'SERIALIZABLE';
  }

  // For other databases, return the requested level as-is
  return requestedLevel;
}

export function Transactional(options: TransactionalOptions = {}) {
  return (
    // biome-ignore lint/suspicious/noExplicitAny: Decorator target type is inherently any
    target: any,
    propertyName: string,
    descriptor: PropertyDescriptor,
  ) => {
    const originalMethod = descriptor.value;

    // biome-ignore lint/suspicious/noExplicitAny: Function arguments are generic
    descriptor.value = async function (...args: any[]) {
      // biome-ignore lint/suspicious/noExplicitAny: Service instance type is unknown at decorator level
      const dataSource: DataSource = (this as any).dataSource;

      if (!dataSource) {
        throw new Error(
          `DataSource not found in ${target.constructor.name}. Make sure your service has a 'dataSource' property.`,
        );
      }

      // Check for existing transaction in the context for this DataSource
      const context = getOrCreateTransactionContext(dataSource);
      const existingContext = context.getStore();

      if (existingContext && options.propagation !== 'REQUIRES_NEW') {
        // If there is an existing transaction and propagation is not REQUIRES_NEW, join the existing transaction
        return await originalMethod.apply(this, args);
      }

      const isolationLevel = getSupportedIsolationLevel(
        dataSource,
        options.isolation,
      );

      const executeTransaction = async (manager: EntityManager) => {
        // Set the transaction context using AsyncLocalStorage per DataSource
        const contextData: TransactionContextData = { manager, dataSource };
        return await context.run(contextData, async () => {
          return await originalMethod.apply(this, args);
        });
      };

      return isolationLevel
        ? await dataSource.transaction(isolationLevel, executeTransaction)
        : await dataSource.transaction(executeTransaction);
    };

    return descriptor;
  };
}

export function getCurrentTransactionManager(
  dataSource?: DataSource,
): EntityManager | null {
  if (!dataSource) {
    // If no dataSource provided, return null - user should provide dataSource
    // for proper context isolation
    return null;
  }

  const context = getOrCreateTransactionContext(dataSource);
  const contextData = context.getStore();
  return contextData ? contextData.manager : null;
}

export abstract class BaseTransactionalService {
  protected constructor(protected readonly dataSource: DataSource) {}

  protected getRepository<T extends object>(
    entity: new () => T,
  ): Repository<T> {
    const manager = this.getManager();
    return manager.getRepository(entity);
  }

  protected getManager(): EntityManager {
    const manager = getCurrentTransactionManager(this.dataSource);
    return manager ? manager : this.dataSource.manager;
  }
}
