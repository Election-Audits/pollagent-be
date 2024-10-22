import i18next from "i18next";
import * as english from "shared-lib/locales/en.json";
const debug = require('debug')('ea:utils-misc');
debug.log = console.log.bind(console);
import * as path from "path";
import { checkDatabaseConnected } from "../db/mongoose";
import { electoralLevelsModel } from "../db/models/others";


/* constants */
export const auditDbName = 'eaudit';

export const pollAgentCookieMaxAge = 183*24*3600*1000; // max age in milliseconds (183 days ~ 6 months)

export const pageLimit = 20;
export const verifyWindow = 30*60*1000; // ms. (30 minutes) 30*60*1000

// directory for temp upload of excel files for getting data from
export const filesDir = path.join(__dirname, '..','..','..', 'files', 'staff');

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

