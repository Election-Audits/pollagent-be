// Error created for http response
interface RequestError {
    errMsg: string | undefined // the error message
}


// Email Input
interface EmailInput {
    recipient: string,
    subject: string,
    text: string
}


// Add a declaration that will be merged with Express.Request
declare namespace Express {

    interface User { // add email to Request.User
        email: string,
        phone: string
    }
}
