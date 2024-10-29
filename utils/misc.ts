import i18next from "i18next";
import * as english from "shared-lib/locales/en.json";
const debug = require('debug')('ea:utils-misc');
debug.log = console.log.bind(console);
import * as path from "path";
import { checkDatabaseConnected } from "../db/mongoose";
import { electoralLevelsModel } from "../db/models/others";
import * as fs from "fs";
import { secrets, checkSecretsReturned } from "./infisical";
import { S3_ENDPOINT, S3_REGION, S3_KEY_ID, S3_KEY_SECRET } from "./env";
import { S3Client } from "@aws-sdk/client-s3";
import { BUILD_TYPES } from "shared-lib/constants";
import { BUILD } from "./env";


/* constants */
export const pollAgentCookieMaxAge = 183*24*3600*1000; // max age in milliseconds (183 days ~ 6 months)

export const pageLimit = 20;
export const verifyWindow = 30*60*1000; // ms. (30 minutes) 30*60*1000

// directory for upload of result files
export const filesDir = path.join(__dirname, '..','..','..', 'files', 'results');


// setup
async function setup() {
    await checkSecretsReturned();
    if (BUILD == BUILD_TYPES.cloud) {
        setS3ClientCloud();
    }
}

setup();


// initialize i18next
i18next.init({
    lng: 'en', // define only when not using language detector
    //debug: true,
    resources: {
        en: {
            translation: english
        }
    }
});
//.then(()=>{});


/**
 * Ensure that a query parameter yields a number, even when undefined
 * @param queryIn a query parameter
 * @returns 
 */
export function getQueryNumberWithDefault(queryIn: unknown) : number {
    let queryAsNumber = parseInt(queryIn+'');
    if (Number.isFinite(queryAsNumber)) return queryAsNumber;
    else return 1; // start from page 1
}


// get electoral levels from db and make it available to other files
export let electoralLevels: string[] = [];

async function getDataFromDatabase() {
    await checkDatabaseConnected(); // wait for database connection
    let findRet = await electoralLevelsModel.findOne();
    electoralLevels = findRet?.levels.map((x)=> x.name || '') || [];
}

getDataFromDatabase();


/**
 * Ensure that a directory exists on a filesystem before writing a file to it
 * @param dirPath 
 * @returns 
 */
export function ensureDirExists(dirPath: string) : Promise<void> {
    let options = {recursive: true};
    return new Promise((resolve, reject)=>{
        fs.mkdir(dirPath, options, (err)=>{
            if (!err || err.code === 'EEXIST') resolve();
            else {
                debug('mkdir err: \n', err);
                reject(err);
            }
        });
    });
}


// create s3 client
export let s3client = new S3Client({
    endpoint: S3_ENDPOINT,
    region: S3_REGION,
    credentials: {
        accessKeyId: S3_KEY_ID+'',
        secretAccessKey: S3_KEY_SECRET+''
    }
});

///debug('s3 client: ', s3Client);

// setup s3 client in the cloud (after awaiting Infisical secrets)
function setS3ClientCloud() {
    s3client = new S3Client({
        endpoint: S3_ENDPOINT,
        region: S3_REGION,
        credentials: {
            accessKeyId: secrets.S3_KEY_ID,
            secretAccessKey: secrets.S3_KEY_SECRET
        }
    });
}
