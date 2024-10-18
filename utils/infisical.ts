const debug = require('debug')('ea:infisical');
debug.log = console.log.bind(console);
import { INFISICAL_ID, INFISICAL_SECRET, INFISICAL_PROJECT_ID, BUILD, NODE_ENV } from "../utils/env";
import { BUILD_TYPES } from "shared-lib/constants";
import { InfisicalSDK } from "@infisical/sdk";


if (BUILD == BUILD_TYPES.local) {
    debug(`in local build. won't check Infisical secrets`);
}


const client = new InfisicalSDK();

export let secrets: {[key: string]: string} = {}; // store secrets to object keyed by secretKey values

// connect to Infisical, get secrets
async function setup() {
    if (BUILD == BUILD_TYPES.local) {
        // in local build, using environment variables for secrets
        return;
    }
    // Authenticate with Infisical
    await client.auth().universalAuth.login({
        clientId: INFISICAL_ID +'',
        clientSecret: INFISICAL_SECRET +''
    });
    //
    let secretsRet = await client.secrets().listSecrets({
        projectId: INFISICAL_PROJECT_ID +'',
        environment: getInfisicalEnvSlug(NODE_ENV +'')
    });
    debug('secrets ret: ', secretsRet);
    for (let secretEl of secretsRet.secrets) {
        secrets[secretEl.secretKey] = secretEl.secretValue;
    }
    // debug('secrets: ', secrets);
    secretsReadyBool = true; // indicate that secrets returned
}

setup();



/**
 * From the environment variable, generate the environment slug for accessing
 * Infisical secrets. e.g. f(development) -> dev
 * @param environment 
 * @returns environment slug
 */
function getInfisicalEnvSlug(environment: string) {
    let map : { [key: string]: string; } = {
        development: 'dev',
        production: 'prod',
        staging: 'staging'
    };
    return map[environment];
}


let secretsReadyBool: boolean = false;
/**
 * checks if a database connection has been established
 * @returns a Promise which resolves when database connection is established
 */
export function checkSecretsReturned() : Promise<void> {
    return new Promise((resolve, reject)=>{
        // in local build, not using Infisical, resolve trivially
        if (BUILD == BUILD_TYPES.local) {
            return resolve();
        }
        // timeout and fail if secrets not returned after a while
        const timeout = 10000; // max time to wait for returned secrets
        let start = Date.now();
        let interval = setInterval(()=>{
            if (!secretsReadyBool) {
                let curTime = Date.now();
                let deltaT = curTime - start;
                if (deltaT > timeout) {
                    clearInterval(interval);
                    reject(`timeout elapsed while awaiting secrets from Infisical`);
                }
                return;
            }
            // secrets ready
            clearInterval(interval);
            return resolve();
        }, 1000); // retry every second until resolved/rejected
    });
}
