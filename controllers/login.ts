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
import { pollAgentCookieMaxAge, verifyWindow, getElectoralLevels } from "../utils/misc";
import { signupSchema, signupConfirmSchema, loginSchema, loginConfirmSchema, passwordResetSchema, 
passwordResetConfirmSchema, resendCodeSchema, updateProfileSchema } from "../utils/joi";
import { Request, Response, NextFunction } from "express";
import * as mongoose from "mongoose";

// ES Module import
let randomString : Function;
import('crypto-random-string').then((importRet)=>{
    randomString = importRet.default;
});


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
    emailUser = (BUILD == BUILD_TYPES.local) ? emailUserEnv+'' : secrets.EMAIL_USER;
    emailPassword = (BUILD == BUILD_TYPES.local) ? emailPasswordEnv+'' : secrets.EMAIL_PASSWORD;
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
 * Signup. TODO: On signup/login, inform user of need to check email or contact supervisor for OTP
 * @param req 
 * @param res 
 * @param next 
 */
export async function signup(req: Request, res: Response, next: NextFunction) {
    // check inputs
    let body = req.body;
    let { error } = signupSchema.validate(body);
    if (error) {
        debug('schema error: ', error);
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }

    // get user record
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

    // check that user pre-approved for signup, if user already signed up, etc.
    if (!record) return Promise.reject({errMsg: i18next.t("not_approved_signup")});
    // if email or phone already confirmed, account already exists. Reject so user can login
    if (record.emailConfirmed || record.phoneConfirmed) {
        return Promise.reject({errMsg: i18next.t("account_exists")});
    }

    // update record with body fields, then send confirmation
    // admin preapproved using email or phone, thus not updating field that already exists
    if (record.email) body.email = undefined; // not updating email
    if (record.phone) body.phone = undefined;
    // hash the password before saving
    body.password = await bcrypt.hash(body.password, 12);
    // Generate OTP. Simpler OTP for subAgents, more complex for supervisors
    let otpLength = (record.supervisorId) ? 4 : 6;
    let code = randomString({length: otpLength, type: 'numeric'});
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

    // An agent can be both a supervisor and a sub agent if in middle of hierarchy
    if (record.supervisorId) await signupSubAgent(record, code); // subagent
    // check if supervisor and signup as supervisor
    let electoralLevels = getElectoralLevels();
    let ind = electoralLevels.findIndex((v)=> v== record.electoralLevel );
    if (ind < electoralLevels.length-1) { // this agent is also a supervisor
        let agent = {id: record._id};
        await signupSupervisor(agent);
    }

    // send OTP by email or phone
    if (email) {
        let emailInput = {
            recipient: email,
            subject: 'Election Audits',
            text: i18next.t("otp_message") + code, // plain text body
        };
        await sendEmail(emailInput);
    } else {
        // TODO: send push notification to supervisor
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
    let field = `subAgents.${myData._id.toString()}`;
    let update = {[field]: true};
    await supervisorModel.updateOne(filter, {$set: update});
    // TODO: send a push notification to the supervisor that a subAgent is attempting to signup

}


/**
 * complete signup for a supervisor (first two electoral levels)
 * @param emailInput 
 * @param agent 
 * @returns 
 */
async function signupSupervisor(agent: {[key: string]: any}) {
    // For a supervisor, create a record in the Supervisors collection
    let updateFields = {subAgents: {}};
    await supervisorModel.updateOne({agentId: agent.id}, {$set: updateFields}, {upsert: true});

}

/**
 * 
 * @param emailInput 
 * @returns 
 */
async function sendEmail(emailInput: EmailInput) {
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
    let { error } = signupConfirmSchema.validate(body);
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
    let updateFields: {[key: string]: any} = email ? { emailConfirmed: true } : { phoneConfirmed: true };
    updateFields.fbToken = body.fbToken; // also set firebase token
    await pollAgentModel.updateOne(filter, {$set: updateFields});
    // set cookie for authenticating future requests
    if (email) req.session.email = email;
    if (phone) req.session.phone = phone;

    // data to send to client : {[key: string]: any}
    let retData = {
        email,
        phone,
        surname: record?.surname,
        otherNames: record?.otherNames
    };
    return retData;
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
    let { error } = loginSchema.validate(body);
    if (error) {
        debug('schema error: ', error);
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }

    // first get record from db
    let { email, phone } = body;
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
    let otpLength = (record.supervisorId) ? 4 : 6;
    let code = randomString({length: otpLength, type: 'numeric'});
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

    // if logging in with email, will send OTP by email, otherwise for subAgent, the OTP would be send to the 
    // supervisor's app to be forwarded to the subAgent by text
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
    let field = `subAgents.${myData.phone}`;
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
    let { error } = loginConfirmSchema.validate(body);
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

    // update fbToken
    await pollAgentModel.updateOne(filter, {$set: {fbToken: body.fbToken}});

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
 * Resend code
 * @param req 
 * @param res 
 * @param next 
 */
export async function resendCode(req: Request, res: Response, next: NextFunction) {
    let body = req.body;
    // validate input
    let { error } = resendCodeSchema.validate(body);
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
    if (!record) {
        return Promise.reject({errMsg: i18next.t("account_not_exist")});
    }

    // Ensure that user was in the process of login/sign up (there exists a recent code)
    let otpCodes_0 = record.otpCodes || [];
    if (!otpCodes_0) return Promise.reject("not in the process of logging in");
    let recentOtpObjects = otpCodes_0.filter((x)=>{
        let codeAge = Date.now() - x.createdAtms;
        return codeAge < verifyWindow;
    });
    if (recentOtpObjects.length == 0) {
        return Promise.reject("not in the process of logging in");
    }

    // Create and save OTP
    let otpLength = (record.supervisorId) ? 4 : 6;
    let code = randomString({length: otpLength, type: 'numeric'});
    //
    let otpCodes = [...otpCodes_0, {code, createdAtms: Date.now()}];
    // remove otp codes that are too old
    otpCodes = otpCodes.filter((x: any)=>{
        let codeAge = Date.now() - x.createdAtms; //debug(`code: ${x.code}, codeAge: ${codeAge/(60*1000)} minutes`);
        return codeAge < 2*verifyWindow;
    });
    // update otp codes
    await pollAgentModel.updateOne(filter, {$set: {otpCodes}});
    debug(`code: ${code}`);

    // Send OTP by email if supervisor, or to supervisor app if a subAgent
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
 * Start process of resetting password
 * @param req 
 * @param res 
 * @param next 
 */
export async function passwordReset(req: Request, res: Response, next: NextFunction) {
    let body = req.body;
    // validate input with Joi
    let { error } = passwordResetSchema.validate(body);
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
    let otpLength = (record.supervisorId) ? 4 : 6;
    let code = randomString({length: otpLength, type: 'numeric'});
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
    let { error } = passwordResetConfirmSchema.validate(body);
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


/**
 * Update profile
 * @param req 
 * @param res 
 * @param next 
 */
export async function updateProfile(req: Request, res: Response, next: NextFunction) {
    let body = req.body;
    // validate input
    let { error } = updateProfileSchema.validate(body);
    if (error) {
        debug('schema error: ', error);
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }

    // ensure body not empty. Actually updating some field
    if (Object.keys(body).length == 0) {
        return Promise.reject({errMsg: i18next.t("request_body_error")});
    }

    // update record
    let email = req.user?.email; // passport middleware set req.user after auth
    let phone = req.user?.phone;
    let filter: {[key: string]: any} = {};
    if (email) filter.email = email;
    if (phone) filter.phone = phone;
    // NB: auth middleware ensures both email and phone not null
    let update = {$set: body};
    let options: mongoose.QueryOptions<any> = {
        returnDocument: 'after',
        projection: {password: 0, otpCodes: 0}
    };
    let pollAgent = await pollAgentModel.findOneAndUpdate(filter, update, options);
    debug('pollAgent ret: ', JSON.stringify(pollAgent));
    let retData = {
        email: pollAgent?.email,
        phone: pollAgent?.phone,
        surname: pollAgent?.surname,
        otherNames: pollAgent?.otherNames
    };
    return retData;
}


/**
 * Deactivate account
 * @param req 
 * @param res 
 * @param next 
 */
export async function deactivate(req: Request, res: Response, next: NextFunction) {
    let filter = {_id: req.user?._id};
    await pollAgentModel.deleteOne(filter);
    // move sub agents, notify super and sub agents
}
