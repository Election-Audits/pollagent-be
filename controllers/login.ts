// Controller for signup, login etc.
const debug = require('debug')("ea:ctrl-login");
debug.log = console.log.bind(console);
import { BUILD_TYPES } from "shared-lib/constants";
import { BUILD, EMAIL_USER as emailUserEnv, EMAIL_PASSWORD as emailPasswordEnv } from "../utils/env";
import nodemailer from "nodemailer";
import { pollAgentModel } from "../db/models/poll-agent";
import i18next from "i18next";
import * as bcrypt from "bcrypt";
import { secrets ,checkSecretsReturned } from "../utils/infisical";
import { pollAgentCookieMaxAge } from "../utils/misc";
import { signupSchema } from "../utils/joi";
import { Request, Response, NextFunction } from "express";

// ES Module import
let randomString : Function;
import('crypto-random-string').then((importRet)=>{
    randomString = importRet.default;
});

// time limit to confirm code for 2FA 
const verifyWindow = 30*60*1000; // ms. (30 minutes) 30*60*1000

const cookieOptions = {
    httpOnly: true, signed: true, maxAge: pollAgentCookieMaxAge
};

// nodemailer
let transporter = nodemailer.createTransport({});
let emailUser : string;
let emailPassword: string;

async function setup() {
    await checkSecretsReturned();
    // get emailUser from environment in local build, Infisical in cloud build
    emailUser = (BUILD == BUILD_TYPES.local) ? emailUserEnv+'' : secrets.EMAIL_USER; // TODO: get from Infisical
    emailPassword = (BUILD == BUILD_TYPES.local) ? emailPasswordEnv+'' : secrets.EMAIL_PASSWORD; // TODO
    // create email transporter
    transporter = nodemailer.createTransport({
        host: "mail.privateemail.com", //"smtp.ethereal.email",
        port: 465, //587,
        secure: true, // Use `true` for port 465, `false` for all other ports
        auth: {
            user: emailUser,
            pass: emailPassword,
        },
    });
}

setup();


/**
 * Signup
 * @param req 
 * @param res 
 * @param next 
 */
export async function signup(req: Request, res: Response, next: NextFunction) {
    // check inputs
    let body = req.body;
    let { error } = await signupSchema.validateAsync(body);
    if (error) {
        debug('schema error: ', error);
        return Promise.reject({errMsg: i18next.t("request_body_error")}); // todo printf
    }
    let { email, phone, password } = body;
    // first try to get record from the database to check pre-approval
    // highest levels of supervisors (country, region) use email, while others use phone
    let filter = {$or: [{email}, {phone}]};
    let record = await pollAgentModel.findOne(filter);
    debug('record: ', record);
    if (!record) return Promise.reject({errMsg: i18next.t("not_approved_signup")});
    // if email or phone already confirmed, account already exists. Reject so user can login
    if (record.emailConfirmed || record.phoneConfirmed) {
        return Promise.reject({errMsg: i18next.t("account_exists")});
    }
    // update record with body fields, then send confirmation
    // admin preapproved using email or phone, thus not updating field that already exists
    if (record.email) body.email = undefined; // not updating email
    if (record.phone) body.phone = undefined;
    // Generate OTP. Simpler OTP for subAgents, more complex for supervisors
    let code = (record.supervisorId) ? randomString({length: 4, type: 'numeric'}) : randomString({length: 6});
    let otpCodes_0 = record.otpCodes || [];
    let otpCodes = [...otpCodes_0, {code, createdAtms: Date.now()}];
    // remove otp codes that are too old
    otpCodes = otpCodes.filter((x: any)=>{
        let codeAge = Date.now() - x.createdAtms;
        return codeAge < 2*verifyWindow;
    });
    body.otpCodes = otpCodes;
    // update password and otp codes
    await pollAgentModel.updateOne(filter, {$set: body});
    debug(`code: ${code}`);

    // Send OTP: There are two ways to send an OTP after generation. Agents in the highest tiers (country/region) are
    // typically added by staff of Election Audits, and supervisorId not set. Send OTP by email. Otherwise, OTP would
    // be delivered to the supervisor, to be forwarded to the agent signing up
    if (record.supervisorId) { // a subAgent

    } else { // a supervisor/ regional/ country coordinator

    }
}



