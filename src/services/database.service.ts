"use strict";

import { Collection, Db, MongoClient } from "mongodb";
import { envConfig } from "~/constants/config";
import { IToken } from "~/models/schemas/token.schema";
import { IUser } from "~/models/schemas/user.schema";
import { IResume } from "~/models/schemas/resume.schema";
import { ITemplate } from "~/models/schemas/template.schema";

const uri = `mongodb+srv://${envConfig.dbUsername}:${envConfig.dbPassword}@resumate.zodlwdf.mongodb.net/${envConfig.dbName}?retryWrites=true&w=majority&appName=${envConfig.appName}`;

class DatabaseServices {
  private client: MongoClient;
  private db: Db;

  public getClient() {
    return this.client;
  }

  constructor() {
    this.client = new MongoClient(uri);
    this.db = this.client.db(envConfig.dbName);
  }

  async connect() {
    try {
      await this.client.connect();
      await this.db.command({ ping: 1 });
      console.log(
        "Pinged your deployment. You successfully connected to MongoDB!"
      );
    } catch (error) {
      console.log("Error connecting to the database", error);
      throw error;
    }
  }

  get users(): Collection<IUser> {
    return this.db.collection(envConfig.dbUserCollection);
  }

  get tokens(): Collection<IToken> {
    return this.db.collection(envConfig.dbTokenCollection);
  }

  get resumes(): Collection<IResume> {
    return this.db.collection(envConfig.dbResumeCollection);
  }

  get resume_version(): Collection {
    return this.db.collection(envConfig.dbResumeVersionCollection)
  }

  get resume_draft(): Collection {
    return this.db.collection(envConfig.dbResumeDraftCollection)
  }

  get templates(): Collection<ITemplate> {
    return this.db.collection(envConfig.dbTemplateCollection);
  }
}

const databaseServices = new DatabaseServices();
export default databaseServices;
