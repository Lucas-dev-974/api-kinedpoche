import { MigrationInterface, QueryRunner } from "typeorm";

export class InitSchema1793946206176 implements MigrationInterface {
    name = 'InitSchema1793946206176'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."contract_replacedgender_enum" AS ENUM('male', 'female')`);
        await queryRunner.query(`CREATE TYPE "public"."contract_substitutegender_enum" AS ENUM('male', 'female')`);
        await queryRunner.query(`CREATE TABLE "contract" ("id" SERIAL NOT NULL, "startDate" character varying, "endDate" character varying, "percentReturnToSubstitute" integer, "percentReturnToSubstituteBeforeDate" character varying, "nonInstallationRadius" integer, "conciliationCDOMK" character varying, "doneAtLocation" character varying, "doneAt" character varying, "replacedGender" "public"."contract_replacedgender_enum", "replacedEmail" character varying, "replacedName" character varying, "replacedBirthday" TIMESTAMP, "replacedBirthdayLocation" character varying, "replacedOrderDepartement" character varying, "replacedOrderDepartmentNumber" integer, "replacedProfessionnalAddress" character varying, "substituteGender" "public"."contract_substitutegender_enum", "substituteEmail" character varying, "substituteName" character varying, "substituteBirthday" TIMESTAMP, "substituteBirthdayLocation" character varying, "substituteOrderDepartement" character varying, "substituteOrderDepartmentNumber" integer, "substituteAdress" character varying, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "isPublic" boolean NOT NULL DEFAULT true, "replacedSignatureDataUrl" character varying, "substituteSignatureDataUrl" character varying, "token" character varying, "userId" integer, CONSTRAINT "PK_17c3a89f58a2997276084e706e8" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."user_gender_enum" AS ENUM('male', 'female')`);
        await queryRunner.query(`CREATE TABLE "user" ("id" SERIAL NOT NULL, "email" character varying NOT NULL, "fullname" character varying NOT NULL, "orderNumber" character varying, "department" character varying, "birthday" TIMESTAMP, "bornLocation" character varying, "password" character varying NOT NULL, "personalAdress" character varying, "officeAdress" character varying, "phoneNumber" character varying, "gender" "public"."user_gender_enum", "isPublic" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_e12875dfb3b1d92d7d7c5377e22" UNIQUE ("email"), CONSTRAINT "UQ_83f3c8a19a5621e6697d0639544" UNIQUE ("orderNumber"), CONSTRAINT "PK_cace4a159ff9f2512dd42373760" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "contract" ADD CONSTRAINT "FK_a837a077c734b8f4106c6923685" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "contract" DROP CONSTRAINT "FK_a837a077c734b8f4106c6923685"`);
        await queryRunner.query(`DROP TABLE "user"`);
        await queryRunner.query(`DROP TYPE "public"."user_gender_enum"`);
        await queryRunner.query(`DROP TABLE "contract"`);
        await queryRunner.query(`DROP TYPE "public"."contract_substitutegender_enum"`);
        await queryRunner.query(`DROP TYPE "public"."contract_replacedgender_enum"`);
    }

}
