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
