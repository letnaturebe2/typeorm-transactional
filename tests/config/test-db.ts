import { DataSource } from "typeorm";
import { SnakeNamingStrategy } from "typeorm-naming-strategies";
import { User } from "../../src/entity/user.model";
import { Organization } from "../../src/entity/organization.model";

export const testDataSource = new DataSource({
  type: "sqlite",
  database: ":memory:",
  entities: [User, Organization],
  synchronize: true,
  logging: false,
  namingStrategy: new SnakeNamingStrategy(),
}); 