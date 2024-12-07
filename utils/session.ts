// User session store in mongodb

const debug = require('debug')('ea:session');
debug.log = console.log.bind(console);
import session from "express-session";
import MongoStore from "connect-mongo";
import { COOKIE_SECRET as cookieSecretEnv, BUILD } from "./env";
import { BUILD_TYPES } from "shared-lib/constants";
import { eAuditMongoUrl } from "../db/mongoose";
import { pollAgentCookieMaxAge } from "./misc";
import { secrets, checkSecretsReturned } from "./infisical";


// merge new fields (email, phone) into SessionData
declare module 'express-session' {
    interface SessionData {
        email: string,
        phone: string
    }
}


// initialize session to set type
export let pollAgentSession = session({
    secret: cookieSecretEnv+''
});


/*
Obtain cookie secret from Infisical in cloud builds
*/
async function setup() {
    await checkSecretsReturned(); // ensure secrets returned from Infisical
    let cookieSecret = (BUILD == BUILD_TYPES.local) ? cookieSecretEnv+'' : secrets.COOKIE_SECRET+'';
    // create store with updated eAuditMongoUrl
    /// debug(`eAuditMongoUrl: ${eAuditMongoUrl}, cookieSecret: ${cookieSecret}, cookieMaxAge: ${pollAgentCookieMaxAge}`);
    const store = MongoStore.create({
        mongoUrl: eAuditMongoUrl,
        // NB: dbName set in connection string
        stringify: false,
        collectionName: 'sessionsPollAgent'
    });
    // session
    pollAgentSession = session({
        name: 'pollagent',
        secret: cookieSecret,
        cookie: {
            maxAge: pollAgentCookieMaxAge
        },
        store,
        resave: false, // don't resave session unless modified.
        saveUninitialized: false // don't save empty sessions.
    });
}

setup();


