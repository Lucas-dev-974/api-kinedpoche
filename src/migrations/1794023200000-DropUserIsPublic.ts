import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Retire la colonne morte "user"."isPublic" : jamais lue ni écrite par le code
 * (seul "contract"."isPublic" l'est). Cf. audit propreté A6 du 07/11/2026.
 */
export class DropUserIsPublic1794023200000 implements MigrationInterface {
    name = 'DropUserIsPublic1794023200000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "isPublic"`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "user" ADD "isPublic" boolean NOT NULL DEFAULT false`);
    }
}
