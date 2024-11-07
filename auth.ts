// Passport authentication strategies

const debug = require('debug')('ea:auth');
debug.log = console.log.bind(console);

import passport from "passport";
import { Strategy as CookieStrategy } from "passport-cookie";
import { pollAgentModel } from "./db/models/poll-agent";
import * as express from "express";
import i18next from "i18next";
import { getElectoralLevels } from "./utils/misc";


// Auth for subAgent, supervisor, and all pollAgents
const cookieName = 'pollagent';

/*
Supervisor cookie. TODO: use electoral levels instead of email/phone
*/
passport.use('supervisor-cookie',
new CookieStrategy({
    cookieName,
    passReqToCallback: true,
    signed: true
},
async (req: express.Request, token: string | undefined, cb: Function)=>{
    try {
        debug('cookie strategy cb. email: ', req.session.email);
        let email = req.session.email;
        if (!email) {
            debug('unauthorized. no cookie or email/phone');
            return cb(null, false, 'unauthorized. no cookie or email/phone');
        }
        let pollAgent = await pollAgentModel.findOne({email}, {password: 0});
        
        // ensure user has completed signup
        if (!pollAgent?.emailConfirmed) { //  NB: supervisor signup by email only
            debug("account doesn't exist, email not confirmed");
            return cb(null, false, {errMsg: i18next.t("account_not_exist")});
        }
        
        // ensure user is a supervisor: electoralLevel in top two levels (country, region)
        let myElectLevel = pollAgent.electoralLevel;
        let electoralLevels = getElectoralLevels();
        debug('electoralLevels: ', electoralLevels);
        if (electoralLevels[0] !== myElectLevel && electoralLevels[1] !== myElectLevel) {
            debug("user doesn't have right electoral level permission");
            return cb(null, false, {errMsg: i18next.t("no_elect_level_permission")});
        }
        //
        return cb(null, pollAgent);
    } catch (exc) {
        debug('poll agent cookie auth exc: ', exc);
        return cb(null, false, exc);
    }
})
);


/*
SubAgent cookie
*/
passport.use('subagent-cookie',
new CookieStrategy({
    cookieName,
    passReqToCallback: true,
    signed: true
},
async (req: express.Request, token: string | undefined, cb: Function)=>{
    try {
        debug('cookie strategy cb. phone: ', req.session.phone);
        let phone = req.session.phone;
        let email = req.session.email;

        // access poll Agent record by email or phone if defined
        let filterArray = [];
        if (email) filterArray.push({email});
        if (phone) filterArray.push({phone});
        if (!phone && !email) { // prevent null query
            debug('unauthorized. either no cookie or phone/email');
            return cb(null, false, 'unauthorized. no cookie or phone/email');
        }

        // ensure user has completed signup
        let filter = { $or: filterArray };
        let pollAgent = await pollAgentModel.findOne(filter, {password: 0});
        if (!pollAgent?.phoneConfirmed && !pollAgent?.emailConfirmed) {
            debug("Account doesn't exist. phone/email not confirmed")
            return cb(null, false, {errMsg: i18next.t("account_not_exist")});
        }

        // ensure user is a subAgent, electoralLevel not in the first two levels ([country, region])
        let myElectLevel = pollAgent.electoralLevel;
        let electoralLevels = getElectoralLevels();
        let ind = electoralLevels.findIndex((v)=> v==myElectLevel );
        // reject: ind == 0 (country), ind==1 (region). Also ind==-1 (electoral level not found)
        debug(`electoral level ind: ${ind}`);
        if (ind < 2) {
            debug("user doesn't have right electoral level permission");
            return cb(null, false, {errMsg: i18next.t("no_elect_level_permission")});
        }

        //
        return cb(null, pollAgent);
    } catch (exc) {
        debug('poll agent cookie auth exc: ', exc);
        return cb(null, false, exc);
    }
})
);


/*
All poll agents
*/
passport.use('pollagent-cookie',
new CookieStrategy({
    cookieName,
    passReqToCallback: true,
    signed: true
},
async (req: express.Request, token: string | undefined, cb: Function)=>{
    try {
        debug(`cookie strategy cb. email: ${req.session?.email}, phone: ${req.session?.phone}`);
        let phone = req.session.phone;
        let email = req.session.email;

        // access poll Agent record by email or phone if defined
        let filterArray = [];
        if (email) filterArray.push({email});
        if (phone) filterArray.push({phone});
        if (!phone && !email) { // prevent null query
            debug('unauthorized. either no cookie or phone/email');
            return cb(null, false, 'unauthorized. no cookie or phone/email');
        }

        let filter = { $or: filterArray };
        let pollAgent = await pollAgentModel.findOne(filter);
        // ensure user completed signup
        if (!pollAgent?.emailConfirmed && !pollAgent?.phoneConfirmed) {
            debug("Account doesn't exist. phone/email not confirmed");
            return cb(null, false, {errMsg: i18next.t("account_not_exist")});
        }
        
        //
        return cb(null, pollAgent);
    } catch (exc) {
        debug('poll agent cookie auth exc: ', exc);
        return cb(null, false, exc);
    }
})
);


