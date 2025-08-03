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
        throw new TransactionError(
          `DataSource not found in ${target.constructor.name}. Make sure your service has a 'dataSource' property.`,
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
          try {
            return await originalMethod.apply(this, args);
          } catch (error) {
            console.error(`Transaction rolled back in ${target.constructor.name}.${propertyName}:`, {
              error: error instanceof Error ? error.message : String(error),
              isolation: isolationLevel,
              propagation: options.propagation || 'REQUIRED',
            });

            throw error;
          }
        });
      });
    };

    return descriptor;
  };
}

export function getCurrentTransactionManager(): EntityManager | null {
  return transactionContext.getStore() || null;
}

export class TransactionError extends Error {
  constructor(
    message: string,
    public readonly originalError?: Error,
    public readonly context?: any,
  ) {
    super(message);
    this.name = 'TransactionError';

    if (originalError?.stack) {
      this.stack = originalError.stack;
    }
  }
}

export abstract class BaseTransactionalService {
  protected constructor(protected readonly dataSource: DataSource) {}

  protected getRepository<T extends object>(entity: new () => T): Repository<T> {
    const manager = getCurrentTransactionManager();
    return manager ? manager.getRepository(entity) : this.dataSource.getRepository(entity);
  }

  public isInTransaction(): boolean {
    return getCurrentTransactionManager() !== null;
  }
}