/*
NB: Do not put secrets in this file. Instead use a secrets manager like Infisical
Only load config variables here
*/

import { BUILD_TYPES } from "shared-lib/constants";

export const BUILD = process.env.BUILD; // one of constants.BUILD_TYPES
export const NODE_ENV = process.env.NODE_ENV;
export const DBS = process.env.DBS; // mongo dbs to connect to
export const COOKIE_SECRET = process.env.COOKIE_SECRET;

export const INFISICAL_ID = process.env.INFISICAL_ID;
export const INFISICAL_SECRET = process.env.INFISICAL_SECRET;
export const INFISICAL_PROJECT_ID = process.env.INFISICAL_PROJECT_ID;

export const S3_ENDPOINT = process.env.S3_ENDPOINT;
export const S3_REGION = process.env.S3_REGION;
export const RESULT_BUCKET = process.env.RESULT_BUCKET; // bucket for election results

//------ environment variables only set in local build
export const EMAIL_USER = process.env.EMAIL_USER;
export const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
export const MONGO_LOCAL_CREDS = process.env.MONGO_LOCAL_CREDS; // pass Mongo credentials for local build

export const S3_KEY_ID = process.env.S3_KEY_ID; // s3 access key id
export const S3_KEY_SECRET = process.env.S3_KEY_SECRET;


// alert user if environment variables not set
if (!BUILD) throw new Error("Must set environment variable BUILD");
if (!NODE_ENV) throw new Error("Must set environment variable NODE_ENV");
if (!DBS) throw new Error("Must set environment variable DBS, name(s) of database(s) to connect to");

// Errors to be thrown when running in cloud
if (BUILD == BUILD_TYPES.cloud) {
    if (!INFISICAL_ID) throw new Error("Must set environment variable INFISICAL_ID");
    if (!INFISICAL_SECRET) throw new Error("Must set environment variable INFISICAL_SECRET");
    if (!INFISICAL_PROJECT_ID) throw new Error("Must set environment variable INFISICAL_PROJECT_ID");
    if (!RESULT_BUCKET) throw new Error("Must set environment variable RESULT_BUCKET");
}


/*
Other envs not checked here
DOTENV_CONFIG_PATH
*/
