import "reflect-metadata";
import { DataSource, EntityTarget, ObjectLiteral, Repository } from "typeorm";
import { User } from "./database/entity/User";
import { Contract } from "./database/entity/Contract";

import path from "path";
import dotenv from "dotenv";
dotenv.config();

export const AppDataSource = new DataSource({
  type: process.env.DB_TYPE as any || "postgres",
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432", 10),
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  // Le schéma est porté par les migrations (migrationsRun auto au boot) — jamais de synchronize.
  migrations: [path.join(__dirname, "./migrations/*{.ts,.js}")],
  migrationsRun: true,
  logging: process.env.NODE_ENV === "production" ? ["error", "migration"] : true,
  entities: [User, Contract],
});

export function getRepo<T extends ObjectLiteral>(entity: EntityTarget<T>): Repository<T> {
  return AppDataSource.getRepository<T>(entity);
}
