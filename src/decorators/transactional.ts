import { AsyncLocalStorage } from 'node:async_hooks';
import { DataSource, EntityManager, Repository } from 'typeorm';

type IsolationLevel = 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

export interface TransactionalOptions {
  isolation?: IsolationLevel;
  propagation?: 'REQUIRED' | 'REQUIRES_NEW';
}

interface TransactionContextData {
  manager: EntityManager;
  dataSource: DataSource;
}

// Transaction context per DataSource to avoid conflicts
const transactionContexts = new WeakMap<DataSource, AsyncLocalStorage<TransactionContextData>>();

function getTransactionContext(dataSource: DataSource): AsyncLocalStorage<TransactionContextData> {
  let context = transactionContexts.get(dataSource);
  if (!context) {
    context = new AsyncLocalStorage<TransactionContextData>();
    transactionContexts.set(dataSource, context);
  }
  return context;
}

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

      // Check for existing transaction in the context for this DataSource
      const context = getTransactionContext(dataSource);
      const existingContext = context.getStore();

      if (existingContext && options.propagation !== 'REQUIRES_NEW') {
        // If there is an existing transaction and propagation is not REQUIRES_NEW, join the existing transaction
        return await originalMethod.apply(this, args);
      }

      const isolationLevel = getSupportedIsolationLevel(dataSource, options.isolation);

      return await dataSource.transaction(isolationLevel, async (manager: EntityManager) => {
        // Set the transaction context using AsyncLocalStorage per DataSource
        const contextData: TransactionContextData = { manager, dataSource };
        return await context.run(contextData, async () => {
          return await originalMethod.apply(this, args);
        });
      });
    };

    return descriptor;
  };
}

export function getCurrentTransactionManager(dataSource?: DataSource): EntityManager | null {
  if (!dataSource) {
    // If no dataSource provided, return null - user should provide dataSource
    // for proper context isolation
    return null;
  }
  
  const context = getTransactionContext(dataSource);
  const contextData = context.getStore();
  return contextData ? contextData.manager : null;
}

export abstract class BaseTransactionalService {
  protected constructor(protected readonly dataSource: DataSource) {}

  protected getRepository<T extends object>(entity: new () => T): Repository<T> {
    const manager = getCurrentTransactionManager(this.dataSource);
    return manager ? manager.getRepository(entity) : this.dataSource.getRepository(entity);
  }
}