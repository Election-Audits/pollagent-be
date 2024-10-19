// Controller for signup, login etc.
const debug = require('debug')("ea:ctrl-login");
debug.log = console.log.bind(console);
import { BUILD_TYPES } from "shared-lib/constants";
import { BUILD, EMAIL_USER as emailUserEnv, EMAIL_PASSWORD as emailPasswordEnv } from "../utils/env";
import nodemailer from "nodemailer";
import { pollAgentModel } from "../db/models/poll-agent";
import { supervisorModel } from "../db/models/others";
import i18next from "i18next";
import * as bcrypt from "bcrypt";
import { secrets ,checkSecretsReturned } from "../utils/infisical";
import { pollAgentCookieMaxAge } from "../utils/misc";
import { signupSchema, signupConfirmSchema, loginSchema, loginConfirmSchema, passwordResetSchema, 
passwordResetConfirmSchema } from "../utils/joi";
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
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }
    let { email, phone } = body;
    // first try to get record from the database to check pre-approval
    // highest levels of supervisors (country, region) use email, while others use phone
    let filterArray = [];
    if (email) filterArray.push({email});
    if (phone) filterArray.push({phone});
    if (!email && !phone) { // don't allow empty query
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }
    let filter = { $or: filterArray };
    let record = await pollAgentModel.findOne(filter);
    debug('record: ', JSON.stringify(record));
    if (!record) return Promise.reject({errMsg: i18next.t("not_approved_signup")});
    // if email or phone already confirmed, account already exists. Reject so user can login
    if (record.emailConfirmed || record.phoneConfirmed) {
        return Promise.reject({errMsg: i18next.t("account_exists")});
    }
    // If supervisor, ensure email provided. If subAgent, ensure phone provided
    if (record?.supervisorId) { // subAgent. use phone
        if (!body.phone) return Promise.reject({errMsg: i18next.t("request_body_error")});
    } else { // supervisor. use email
        if (!body.email) return Promise.reject({errMsg: i18next.t("request_body_error")});
    }
    // update record with body fields, then send confirmation
    // admin preapproved using email or phone, thus not updating field that already exists
    if (record.email) body.email = undefined; // not updating email
    if (record.phone) body.phone = undefined;
    // hash the password before saving
    body.password = await bcrypt.hash(body.password, 12);
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
    // typically added by staff of Election Audits, and supervisorId field is not set. Send OTP by email. Otherwise, 
    // OTP would be delivered to the supervisor, to be forwarded to the agent signing up
    if (record.supervisorId) { // a subAgent
        await signupSubAgent(record, code);
    } else { // a supervisor/ regional/ country coordinator
        let emailInput = {
            recipient: email,
            subject: 'Election Audits',
            text: i18next.t("otp_message") + code, // plain text body
        };
        let agent = {id: record._id};
        await signupSupervisor(emailInput, agent);
    }
}


/**
 * 
 * @param myData {id}
 * @param code 
 */
async function signupSubAgent(myData: {[key: string]: any}, code: string) {
    // also write the code in the supervisors table so can be accessed
    let filter = {agentId: myData.supervisorId};
    let field = `subAgents.${myData._id}`;
    let update = {[field]: code};
    await supervisorModel.updateOne(filter, {$set: update});
    // TODO: send a push notification to the supervisor that a subAgent is attempting to signup

}


/**
 * complete signup for a supervisor (first two electoral levels)
 * @param emailInput 
 * @param agent 
 * @returns 
 */
async function signupSupervisor(emailInput: EmailInput, agent: {[key: string]: any}) {
    // For a supervisor, create a record in the Supervisors collection
    let updateFields = {subAgents: {}};
    await supervisorModel.updateOne({agentId: agent.id}, {$set: updateFields}, {upsert: true});
    // only send email when in cloud build
    if (BUILD == BUILD_TYPES.local) return;
    // send the OTP by email to the supervisor
    const info = await transporter.sendMail({
        from: emailUser, // sender address (passed by env var or Infisical secret)
        to: emailInput.recipient, // list of receivers
        subject: emailInput.subject, // Subject line
        text: emailInput.text, // plain text body
        // html: "<b>OTP for signup</b>", // html body
    });
    // debug('email sent. info ret: ', info);
    // {accepted: ['<email>'], rejected: [], response: '',...}
    if (info.rejected.length > 0) { // email error
        debug('email error');
        return Promise.reject(info);
    }
}
///////


/**
 * Signup confirm. OTP checks
 * @param req 
 * @param res 
 * @param next 
 */
export async function signupConfirm(req: Request, res: Response, next: NextFunction) {
    // validate inputs with joi
    let body = req.body;
    let { error } = await signupConfirmSchema.validateAsync(body);
    if (error) {
        debug('schema error: ', error);
        return Promise.reject({errMsg: i18next.t("request_body_error")}); // todo printf
    }
    // first get record from the db
    let { email, phone } = body;
    // highest levels of supervisors (country, region) use email, while others use phone
    let filterArray = [];
    if (email) filterArray.push({email});
    if (phone) filterArray.push({phone});
    if (!email && !phone) {
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }
    let filter = { $or: filterArray };
    let record = await pollAgentModel.findOne(filter);
    debug('record: ', JSON.stringify(record));
    // if email or phone already confirmed, account already exists. Reject so user can login
    if (record?.emailConfirmed || record?.phoneConfirmed) {
        return Promise.reject({errMsg: i18next.t("account_exists")});
    }
    // search otpCodes array for a code that matches
    let dbCodes = record?.otpCodes || []; // {code: 0}
    let ind = dbCodes.findIndex((codeObj)=> codeObj.code == body.code);
    if (ind == -1) {
        return Promise.reject({errMsg: i18next.t("wrong_code")});
    }
    // Ensure that the code has not expired
    let codeCreatedAt = record?.otpCodes[ind].createdAtms || 0; // dbCodes
    let deltaT = Date.now() - codeCreatedAt;
    if (deltaT > verifyWindow) {
        debug(`code has expired: deltaT is ${deltaT/1000} seconds`);
        return Promise.reject({errMsg: i18next.t("expired_code")});
    }
    // At this point, code is equal, and within verification window. Update record
    let updateFields = email ? { emailConfirmed: true } : { phoneConfirmed: true };
    await pollAgentModel.updateOne(filter, {$set: updateFields});
    // set cookie for authenticating future requests
    if (email) req.session.email = email;
    if (phone) req.session.phone = phone;
}


/**
 * 
 * @param req 
 * @param res 
 * @param next 
 */
export async function login(req: Request, res: Response, next: NextFunction) {
    // validate inputs with joi
    let body = req.body;
    let { error } = await loginSchema.validateAsync(body);
    if (error) {
        debug('schema error: ', error);
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }
    let { email, phone } = body;
    // first get record from db
    let filterArray = [];
    if (email) filterArray.push({email});
    if (phone) filterArray.push({phone});
    if (!email && !phone) {
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }
    let filter = { $or: filterArray };
    let record = await pollAgentModel.findOne(filter);
    debug('record: ', JSON.stringify(record));
    // Ensure account exists
    if (!record?.emailConfirmed && !record?.phoneConfirmed) {
        return Promise.reject({errMsg: i18next.t("account_not_exist")});
    }
    // check if password is equal
    let pwdEqual = await bcrypt.compare(''+body.password, record.password+'');
    if (!pwdEqual) {
        return Promise.reject({errMsg: i18next.t("wrong_email_password")});
    }
    // Account exists and password correct. Create OTP to be sent by email or to supervisor
    let code = (record.supervisorId) ? randomString({length: 4, type: 'numeric'}) : randomString({length: 6});
    let otpCodes_0 = record.otpCodes || [];
    let otpCodes = [...otpCodes_0, {code, createdAtms: Date.now()}];
    // remove otp codes that are too old
    otpCodes = otpCodes.filter((x: any)=>{
        let codeAge = Date.now() - x.createdAtms; //debug(`code: ${x.code}, codeAge: ${codeAge/(60*1000)} minutes`);
        return codeAge < 2*verifyWindow;
    });
    // update otp codes
    await pollAgentModel.updateOne(filter, {$set: {otpCodes}});
    debug(`code: ${code}`);
    // if supervisor, will send OTP by email, otherwise for subAgent, the OTP would be send to the supervisor's app to
    // be forwarded to the subAgent by text
    if (record.supervisorId) { // a subAgent
        await otpSubAgent(record, code);
    } else { // a supervisor/ regional/ country coordinator
        let emailInput = {
            recipient: email,
            subject: 'Election Audits',
            text: i18next.t("otp_message") + code, // plain text body
        };
        //let agent = {id: record._id};
        await otpSupervisor(emailInput);
    }
}


/**
 * 
 * @param myData {id}
 * @param code 
 */
async function otpSubAgent(myData: {[key: string]: any}, code: string) {
    // also write the code in the supervisors table so can be accessed
    let filter = {agentId: myData.supervisorId};
    let field = `subAgents.${myData._id}`;
    let update = {[field]: code};
    await supervisorModel.updateOne(filter, {$set: update});
    // TODO: send a push notification to the supervisor that a subAgent is attempting to signup

}


/**
 * complete signup for a supervisor (first two electoral levels)
 * @param emailInput
 * @returns 
 */
async function otpSupervisor(emailInput: EmailInput) {
    // only send email when in cloud build
    if (BUILD == BUILD_TYPES.local) return;
    // send the OTP by email to the supervisor
    const info = await transporter.sendMail({
        from: emailUser, // sender address (passed by env var or Infisical secret)
        to: emailInput.recipient, // list of receivers
        subject: emailInput.subject, // Subject line
        text: emailInput.text, // plain text body
        // html: "<b>OTP for signup</b>", // html body
    });
    // debug('email sent. info ret: ', info);
    // {accepted: ['<email>'], rejected: [], response: '',...}
    if (info.rejected.length > 0) { // email error
        debug('email error');
        return Promise.reject(info);
    }
}
//////////////////////


/**
 * 
 * @param req 
 * @param res 
 * @param next 
 */
export async function loginConfirm(req: Request, res: Response, next: NextFunction) {
    let body = req.body;
    // validate inputs with joi
    let { error } = await loginConfirmSchema.validateAsync(body);
    if (error) {
        debug('schema error: ', error);
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }
    // first get record from the db
    let { email, phone } = body;
    // highest levels of supervisors (country, region) use email, while others use phone
    let filterArray = [];
    if (email) filterArray.push({email});
    if (phone) filterArray.push({phone});
    if (!email && !phone) {
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }
    let filter = { $or: filterArray };
    let record = await pollAgentModel.findOne(filter);
    // Ensure account exists
    if (!record?.emailConfirmed && !record?.phoneConfirmed) {
        return Promise.reject({errMsg: i18next.t("account_not_exist")});
    }
    debug('record: ', JSON.stringify(record));
    // search otpCodes array for a code that matches
    let dbCodes = record?.otpCodes || []; // {code: 0}
    let ind = dbCodes.findIndex((codeObj)=> codeObj.code == body.code);
    if (ind == -1) {
        return Promise.reject({errMsg: i18next.t("wrong_code")});
    }
    // Ensure that the code has not expired
    let codeCreatedAt = record?.otpCodes[ind].createdAtms || 0; // dbCodes
    let deltaT = Date.now() - codeCreatedAt;
    if (deltaT > verifyWindow) {
        debug(`code has expired: deltaT is ${deltaT/1000} seconds`);
        return Promise.reject({errMsg: i18next.t("expired_code")});
    }
    // set cookie for authenticating future requests
    if (email) req.session.email = email;
    if (phone) req.session.phone = phone;
    // data to send to client : {[key: string]: any}
    let retData = {
        email,
        phone,
        surname: record.surname,
        otherNames: record.otherNames
    };
    return retData;
}


/**
 * Start process of resetting password
 * @param req 
 * @param res 
 * @param next 
 */
export async function passwordReset(req: Request, res: Response, next: NextFunction) {
    let body = req.body;
    // validate input with Joi
    let { error } = await passwordResetSchema.validateAsync(body);
    if (error) {
        debug('schema error: ', error);
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }

    // Ensure account exists
    let { email, phone } = body;
    // highest levels of supervisors (country, region) use email, while others use phone
    let filterArray = [];
    if (email) filterArray.push({email});
    if (phone) filterArray.push({phone});
    if (!email && !phone) {
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }
    let filter = { $or: filterArray };
    let record = await pollAgentModel.findOne(filter);
    debug('record: ', JSON.stringify(record));
    // ensure account exists
    if (!record?.emailConfirmed && !record?.phoneConfirmed) {
        return Promise.reject({errMsg: i18next.t("account_not_exist")});
    }

    // create an OTP code and save
    let code = (record.supervisorId) ? randomString({length: 4, type: 'numeric'}) : randomString({length: 6});
    let otpCodes_0 = record.otpCodes || [];
    let otpCodes = [...otpCodes_0, {code, createdAtms: Date.now()}];
    debug(`code: ${code}`);
    // remove otp codes that are too old
    otpCodes = otpCodes.filter((x: any)=>{
        let codeAge = Date.now() - x.createdAtms; //debug(`code: ${x.code}, codeAge: ${codeAge/(60*1000)} minutes`);
        return codeAge < 2*verifyWindow;
    });
    // update otp codes
    await pollAgentModel.updateOne(filter, {$set: {otpCodes}});

    // if supervisor, will send OTP by email, otherwise for subAgent, the OTP would be send to the supervisor's app to
    // be forwarded to the subAgent by text
    if (record.supervisorId) { // a subAgent
        await otpSubAgent(record, code);
    } else { // a supervisor/ regional/ country coordinator
        let emailInput = {
            recipient: email,
            subject: 'Election Audits',
            text: i18next.t("otp_message") + code, // plain text body
        };
        await otpSupervisor(emailInput);
    }
}


/**
 * 
 * @param req 
 * @param res 
 * @param next 
 */
export async function passwordResetConfirm(req: Request, res: Response, next: NextFunction) {
    let body = req.body;
    // validate input with Joi
    let { error } = await passwordResetConfirmSchema.validateAsync(body);
    if (error) {
        debug('schema error: ', error);
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }

    // Ensure account exists
    let { email, phone } = body;
    // highest levels of supervisors (country, region) use email, while others use phone
    let filterArray = [];
    if (email) filterArray.push({email});
    if (phone) filterArray.push({phone});
    if (!email && !phone) {
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }
    let filter = { $or: filterArray };
    let record = await pollAgentModel.findOne(filter);
    // ensure account exists
    if (!record?.emailConfirmed && !record?.phoneConfirmed) {
        return Promise.reject({errMsg: i18next.t("account_not_exist")});
    }

    // Check that the OTP is correct
    // search otpCodes array for a code that matches
    let dbCodes = record?.otpCodes || []; // {code: 0}
    let ind = dbCodes.findIndex((codeObj)=> codeObj.code == body.code);
    if (ind == -1) {
        return Promise.reject({errMsg: i18next.t("wrong_code")});
    }
    // Ensure that the code has not expired
    let codeCreatedAt = record?.otpCodes[ind].createdAtms || 0;
    let deltaT = Date.now() - codeCreatedAt;
    if (deltaT > verifyWindow) {
        debug(`code has expired: deltaT is ${deltaT/1000} seconds`);
        return Promise.reject({errMsg: i18next.t("expired_code")});
    }

    // hash password
    let password = await bcrypt.hash(body.password, 12);
    // update record
    await pollAgentModel.updateOne(filter, {$set: {password} });
    // TODO: destroy all sessions
}




