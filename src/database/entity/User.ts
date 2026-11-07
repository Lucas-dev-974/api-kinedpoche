import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from "typeorm";
import { Contract } from "./Contract";

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  @Column()
  fullname: string;

  @Column({ nullable: true, unique: true })
  orderNumber: string;

  @Column({ nullable: true })
  department: string;

  @Column({ nullable: true })
  birthday: Date;

  @Column({ nullable: true })
  bornLocation: string;

  @Column()
  password: string;

  @Column({ nullable: true })
  personalAdress: string;

  @Column({ nullable: true })
  officeAdress: string;

  @Column({ nullable: true })
  phoneNumber: string;


  @Column({ type: "enum", enum: ["male", "female"], nullable: true })
  gender: "male" | "female";

  @OneToMany(() => Contract, (contract) => contract.user)
  contracts: Contract[];
}
